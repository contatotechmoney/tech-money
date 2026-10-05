"""Durable shared budget for a dedicated executor. No provider/network adapter.

All agents must share this ledger. A reservation is not a remote spend cap;
production requires trusted token counting and provider limits as documented.
"""
from __future__ import annotations
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
import time

class BudgetError(RuntimeError):
    pass

def integer(value, name, minimum=0):
    if type(value) is not int or value < minimum or value > 2**53 - 1:
        raise BudgetError("INVALID_" + name)
    return value

def fingerprint(value):
    return sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

@dataclass(frozen=True)
class Limits:
    provider: str
    model: str
    price_version: str
    input_micro_usd_per_million: int
    output_micro_usd_per_million: int
    max_cost_micro_usd: int
    max_tokens: int
    max_calls: int
    max_parallel: int
    max_input_per_call: int
    max_output_per_call: int
    deadline_seconds: int

    def validate(self):
        for field in ("provider", "model", "price_version"):
            if not isinstance(getattr(self, field), str) or not 1 <= len(getattr(self, field)) <= 180:
                raise BudgetError("INVALID_MODEL_POLICY")
        for field, value in asdict(self).items():
            if field not in ("provider", "model", "price_version"):
                integer(value, field.upper(), 1)
        if self.max_parallel > self.max_calls:
            raise BudgetError("INVALID_PARALLEL_LIMIT")
        # Arithmetic must fit SQLite's signed INTEGER, even at worst-case prices.
        if self.max_tokens * max(self.input_micro_usd_per_million, self.output_micro_usd_per_million) > 2**63 - 1:
            raise BudgetError("POLICY_ARITHMETIC_OVERFLOW")
        return self

    def cost(self, inputs, outputs):
        # Round once UP; no floating point or assumed cache discount.
        total = inputs * self.input_micro_usd_per_million + outputs * self.output_micro_usd_per_million
        return (total + 999999) // 1000000

class Ledger:
    def __init__(self, path: str | Path, clock=time.time):
        self.path, self.clock = str(path), clock
        if self.path == ":memory:":
            raise BudgetError("DURABLE_DATABASE_REQUIRED")
        with self._connection() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS budget_jobs (
              id TEXT PRIMARY KEY, policy TEXT NOT NULL, policy_hash TEXT NOT NULL,
              deadline REAL NOT NULL, status TEXT NOT NULL DEFAULT 'active'
            );
            CREATE TABLE IF NOT EXISTS budget_calls (
              job_id TEXT NOT NULL REFERENCES budget_jobs(id), id TEXT NOT NULL,
              request_hash TEXT NOT NULL, agent TEXT NOT NULL, phase TEXT NOT NULL,
              input_cap INTEGER NOT NULL, output_cap INTEGER NOT NULL,
              held_cost INTEGER NOT NULL, held_tokens INTEGER NOT NULL,
              status TEXT NOT NULL DEFAULT 'prepared', settlement_hash TEXT,
              PRIMARY KEY(job_id,id)
            );
            CREATE TABLE IF NOT EXISTS budget_events (
              id INTEGER PRIMARY KEY, job_id TEXT NOT NULL, call_id TEXT,
              event TEXT NOT NULL, created_at REAL NOT NULL
            );
            CREATE TRIGGER IF NOT EXISTS immutable_budget_events_update
              BEFORE UPDATE ON budget_events BEGIN SELECT RAISE(ABORT,'Append-only budget events'); END;
            CREATE TRIGGER IF NOT EXISTS immutable_budget_events_delete
              BEFORE DELETE ON budget_events BEGIN SELECT RAISE(ABORT,'Append-only budget events'); END;
            """)

    @contextmanager
    def _connection(self):
        db = sqlite3.connect(self.path, timeout=15, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA synchronous=FULL")
        try:
            yield db
        finally:
            db.close()

    @contextmanager
    def _transaction(self):
        with self._connection() as db:
            db.execute("BEGIN IMMEDIATE")
            try:
                yield db
                db.execute("COMMIT")
            except BaseException:
                db.execute("ROLLBACK")
                raise

    def _event(self, db, job, call, event):
        db.execute("INSERT INTO budget_events(job_id,call_id,event,created_at) VALUES (?,?,?,?)",
                   (job, call, event, self.clock()))

    def create_job(self, job_id: str, limits: Limits):
        if not isinstance(job_id, str) or not 1 <= len(job_id) <= 180:
            raise BudgetError("INVALID_JOB_ID")
        policy = asdict(limits.validate())
        with self._transaction() as db:
            old = db.execute("SELECT * FROM budget_jobs WHERE id=?", (job_id,)).fetchone()
            if old:
                if old["policy_hash"] != fingerprint(policy):
                    raise BudgetError("POLICY_CONFLICT")
                return  # Never extend a deadline on replay.
            db.execute("INSERT INTO budget_jobs(id,policy,policy_hash,deadline) VALUES (?,?,?,?)",
                       (job_id, json.dumps(policy), fingerprint(policy), self.clock()+limits.deadline_seconds))
            self._event(db, job_id, None, "created")

    def _job(self, db, job_id):
        job = db.execute("SELECT * FROM budget_jobs WHERE id=?", (job_id,)).fetchone()
        if not job:
            raise BudgetError("UNKNOWN_JOB")
        return job, Limits(**json.loads(job["policy"]))

    def _active(self, job):
        if job["status"] != "active":
            raise BudgetError("JOB_HALTED")
        if self.clock() >= job["deadline"]:
            raise BudgetError("DEADLINE")

    def reserve(self, job_id, call_id, agent, phase, payload_hash, input_tokens, output_tokens):
        """Reserve before I/O. input_tokens must come from a validated tokenizer.

        payload_hash covers all billable content/options; secrets are not stored.
        A stable call ID is a single dispatch, not an automatic retry permission.
        """
        for value in (call_id, agent, phase):
            if not isinstance(value, str) or not 1 <= len(value) <= 180:
                raise BudgetError("INVALID_CALL_IDENTITY")
        if not isinstance(payload_hash,str) or len(payload_hash) != 64 or any(c not in '0123456789abcdef' for c in payload_hash):
            raise BudgetError("INVALID_PAYLOAD_HASH")
        integer(input_tokens, "INPUT", 1); integer(output_tokens, "OUTPUT", 1)
        request = fingerprint([agent,phase,payload_hash,input_tokens,output_tokens])
        with self._transaction() as db:
            job, limits = self._job(db, job_id)
            old = db.execute("SELECT * FROM budget_calls WHERE job_id=? AND id=?", (job_id,call_id)).fetchone()
            if old:
                if old["request_hash"] != request:
                    raise BudgetError("REQUEST_CONFLICT")
                return dict(old)
            self._active(job)
            if input_tokens > limits.max_input_per_call or output_tokens > limits.max_output_per_call:
                raise BudgetError("CALL_TOKEN_LIMIT")
            totals = db.execute("""SELECT count(*) AS calls,coalesce(sum(held_cost),0) AS cost,
              coalesce(sum(held_tokens),0) AS tokens,
              count(*) FILTER(WHERE status IN ('prepared','running')) AS active
              FROM budget_calls WHERE job_id=?""", (job_id,)).fetchone()
            cost = limits.cost(input_tokens,output_tokens)
            if totals["calls"] >= limits.max_calls:
                raise BudgetError("CALL_LIMIT")
            if totals["active"] >= limits.max_parallel:
                raise BudgetError("PARALLEL_LIMIT")
            if totals["cost"]+cost > limits.max_cost_micro_usd:
                raise BudgetError("COST_LIMIT")
            if totals["tokens"]+input_tokens+output_tokens > limits.max_tokens:
                raise BudgetError("TOKEN_LIMIT")
            db.execute("""INSERT INTO budget_calls(job_id,id,request_hash,agent,phase,input_cap,
              output_cap,held_cost,held_tokens) VALUES (?,?,?,?,?,?,?,?,?)""",
                       (job_id,call_id,request,agent,phase,input_tokens,output_tokens,cost,input_tokens+output_tokens))
            self._event(db,job_id,call_id,"reserved")
            return dict(db.execute("SELECT * FROM budget_calls WHERE job_id=? AND id=?", (job_id,call_id)).fetchone())

    def claim_dispatch(self, job_id, call_id):
        """Exactly one local dispatcher wins. Crash after claim requires reconciliation."""
        with self._transaction() as db:
            job,_ = self._job(db,job_id); self._active(job)
            changed = db.execute("UPDATE budget_calls SET status='running' WHERE job_id=? AND id=? AND status='prepared'", (job_id,call_id)).rowcount
            if changed:
                self._event(db,job_id,call_id,"dispatch_claimed")
            return bool(changed)

    def uncertain(self, job_id, call_id):
        """Timeout/missing usage: preserve full reservation and stop further dispatch."""
        with self._transaction() as db:
            self._job(db,job_id)
            changed = db.execute("UPDATE budget_calls SET status='uncertain' WHERE job_id=? AND id=? AND status='running'", (job_id,call_id)).rowcount
            if changed:
                db.execute("UPDATE budget_jobs SET status='halted' WHERE id=?", (job_id,))
                self._event(db,job_id,call_id,"uncertain")

    def settle(self, job_id, call_id, input_tokens, output_tokens):
        """Only the trusted adapter/operator calls this with authoritative total usage.

        Output includes charged reasoning. Missing usage never becomes zero.
        Settlement doesn't resume a halted job or prove a report was approved.
        """
        integer(input_tokens,"USAGE_INPUT"); integer(output_tokens,"USAGE_OUTPUT")
        result_hash = fingerprint([input_tokens,output_tokens])
        with self._transaction() as db:
            _,limits = self._job(db,job_id)
            call = db.execute("SELECT * FROM budget_calls WHERE job_id=? AND id=?", (job_id,call_id)).fetchone()
            if not call:
                raise BudgetError("UNKNOWN_CALL")
            if call["settlement_hash"]:
                if call["settlement_hash"] != result_hash:
                    raise BudgetError("SETTLEMENT_CONFLICT")
                return
            if call["status"] not in ("running","uncertain"):
                raise BudgetError("CALL_NOT_DISPATCHED")
            overrun = input_tokens > call["input_cap"] or output_tokens > call["output_cap"]
            actual_cost = limits.cost(input_tokens,output_tokens)
            if actual_cost > 2**63-1 or input_tokens+output_tokens > 2**63-1:
                raise BudgetError("USAGE_ARITHMETIC_OVERFLOW")
            db.execute("""UPDATE budget_calls SET status=?,held_cost=?,held_tokens=?,settlement_hash=?
              WHERE job_id=? AND id=?""", ("overrun" if overrun else "settled",actual_cost,input_tokens+output_tokens,result_hash,job_id,call_id))
            if overrun:
                db.execute("UPDATE budget_jobs SET status='halted' WHERE id=?", (job_id,))
            self._event(db,job_id,call_id,"provider_limit_violation" if overrun else "settled")

    def quarantine_inflight(self, job_id):
        """Operator-only after exclusive worker takeover; never race a live worker."""
        with self._transaction() as db:
            self._job(db,job_id)
            rows=db.execute("SELECT id FROM budget_calls WHERE job_id=? AND status='running'", (job_id,)).fetchall()
            for row in rows:
                db.execute("UPDATE budget_calls SET status='uncertain' WHERE job_id=? AND id=?", (job_id,row["id"]))
                self._event(db,job_id,row["id"],"restart_uncertain")
            if rows:
                db.execute("UPDATE budget_jobs SET status='halted' WHERE id=?", (job_id,))
            return len(rows)

    def snapshot(self, job_id):
        with self._connection() as db:
            db.execute("BEGIN")
            job,limits=self._job(db,job_id)
            calls=[dict(c) for c in db.execute("SELECT * FROM budget_calls WHERE job_id=? ORDER BY id",(job_id,))]
            return {"status":job["status"],"deadline":job["deadline"],"policy":asdict(limits),
                    "held_cost_micro_usd":sum(c["held_cost"] for c in calls),
                    "held_tokens":sum(c["held_tokens"] for c in calls),"calls":calls}
