import concurrent.futures
from dataclasses import replace
from pathlib import Path
import sqlite3
import tempfile
import unittest
from budget import BudgetError, Ledger, Limits

# Synthetic prices only, no model/network credentials or provider imports.
POLICY=Limits('synthetic','fake-model','synthetic-price-v1',1_000_000,2_000_000,1000,1000,21,3,100,100,900)
PAYLOAD='a'*64

class SharedBudgetTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='b3-budget-test-')
        self.path=Path(self.temp.name)/'budget.sqlite'
        self.now=1000
        self.ledger=Ledger(self.path,clock=lambda:self.now)
        self.ledger.create_job('job',POLICY)
    def tearDown(self):
        self.temp.cleanup()
    def reserve(self,call='call',inputs=50,outputs=50,agent='carlos'):
        return self.ledger.reserve('job',call,agent,'round1',PAYLOAD,inputs,outputs)
    def dispatched(self):
        self.reserve(); self.assertTrue(self.ledger.claim_dispatch('job','call'))
    def test_rejects_missing_unknown_or_invalid_pricing(self):
        for bad in [replace(POLICY,model=''),replace(POLICY,max_calls=True),replace(POLICY,input_micro_usd_per_million=0),replace(POLICY,max_cost_micro_usd=0)]:
            with self.assertRaises(BudgetError): self.ledger.create_job('bad',bad)
        with self.assertRaises(BudgetError): Ledger(':memory:')
        with self.assertRaises(BudgetError): self.ledger.snapshot('other')
    def test_replay_keeps_original_deadline_and_model_policy(self):
        self.now+=100
        self.ledger.create_job('job',POLICY)
        self.assertEqual(self.ledger.snapshot('job')['deadline'],1900)
        with self.assertRaisesRegex(BudgetError,'POLICY_CONFLICT'):
            self.ledger.create_job('job',replace(POLICY,model='alternate'))
    def test_atomic_idempotent_reservation_across_threads(self):
        # Independent connections with the same synthetic clock, not wall-time expired fixtures.
        def attempt(_): return Ledger(self.path,clock=lambda:1000).reserve('job','same','carlos','round1',PAYLOAD,50,50)
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as workers:
            result=list(workers.map(attempt,range(12)))
        self.assertTrue(all(r['id']=='same' for r in result))
        snapshot=self.ledger.snapshot('job')
        self.assertEqual(len(snapshot['calls']),1)
        self.assertEqual(snapshot['held_cost_micro_usd'],150)
    def test_competing_agents_cannot_exceed_shared_cost(self):
        self.ledger.create_job('small',replace(POLICY,max_cost_micro_usd=150,max_parallel=21))
        def attempt(i):
            try:
                Ledger(self.path,clock=lambda:1000).reserve('small',str(i),str(i),'round1',PAYLOAD,50,50)
                return True
            except BudgetError as e:
                self.assertEqual(str(e),'COST_LIMIT');return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as workers:
            self.assertEqual(sum(workers.map(attempt,range(8))),1)
        self.assertEqual(self.ledger.snapshot('small')['held_cost_micro_usd'],150)
    def test_independent_call_token_parallel_and_total_limits(self):
        with self.assertRaisesRegex(BudgetError,'CALL_TOKEN_LIMIT'):self.reserve(inputs=101)
        for i in range(3):self.reserve(str(i))
        with self.assertRaisesRegex(BudgetError,'PARALLEL_LIMIT'):self.reserve('fourth')
        self.ledger.create_job('tokens',replace(POLICY,max_tokens=99))
        with self.assertRaisesRegex(BudgetError,'TOKEN_LIMIT'):
            self.ledger.reserve('tokens','c','a','p',PAYLOAD,50,50)
        self.ledger.create_job('one',replace(POLICY,max_calls=1,max_parallel=1))
        self.ledger.reserve('one','first','a','p',PAYLOAD,50,50)
        self.ledger.claim_dispatch('one','first');self.ledger.settle('one','first',1,1)
        with self.assertRaisesRegex(BudgetError,'CALL_LIMIT'):
            self.ledger.reserve('one','retry','a','p',PAYLOAD,50,50)
    def test_dispatch_claim_has_single_winner_across_workers(self):
        self.reserve()
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as workers:
            winners=list(workers.map(lambda _:Ledger(self.path,clock=lambda:1000).claim_dispatch('job','call'),range(8)))
        self.assertEqual(sum(winners),1)
    def test_changed_payload_or_agent_is_not_an_idempotent_retry(self):
        self.reserve()
        with self.assertRaisesRegex(BudgetError,'REQUEST_CONFLICT'):self.reserve(agent='helena')
        with self.assertRaisesRegex(BudgetError,'REQUEST_CONFLICT'):
            self.ledger.reserve('job','call','carlos','round1','b'*64,50,50)
        with self.assertRaises(BudgetError):self.reserve(inputs=True)
    def test_settlement_releases_only_confirmed_difference_once(self):
        self.dispatched();self.ledger.settle('job','call',20,10)
        self.ledger.settle('job','call',20,10)
        self.assertEqual(self.ledger.snapshot('job')['held_cost_micro_usd'],40)
        self.assertEqual(self.ledger.snapshot('job')['held_tokens'],30)
        with self.assertRaisesRegex(BudgetError,'SETTLEMENT_CONFLICT'):
            self.ledger.settle('job','call',20,9)
        self.assertFalse(self.ledger.claim_dispatch('job','call'))
    def test_deadline_blocks_prepared_dispatch_and_new_calls(self):
        self.reserve();self.now=1900
        with self.assertRaisesRegex(BudgetError,'DEADLINE'):self.ledger.claim_dispatch('job','call')
        with self.assertRaisesRegex(BudgetError,'DEADLINE'):self.reserve('another')
        self.assertEqual(self.ledger.snapshot('job')['held_cost_micro_usd'],150)
    def test_timeout_preserves_reservation_and_stops_other_agents(self):
        self.dispatched();self.reserve('next',agent='helena')
        self.ledger.uncertain('job','call')
        self.assertEqual(self.ledger.snapshot('job')['held_cost_micro_usd'],300)
        with self.assertRaisesRegex(BudgetError,'JOB_HALTED'):self.reserve('another')
        with self.assertRaisesRegex(BudgetError,'JOB_HALTED'):self.ledger.claim_dispatch('job','next')
        self.ledger.settle('job','call',20,10)
        self.assertEqual(self.ledger.snapshot('job')['status'],'halted')
    def test_unknown_usage_is_never_settled_as_zero(self):
        self.dispatched()
        with self.assertRaises(BudgetError):self.ledger.settle('job','call',None,10)
        self.ledger.uncertain('job','call')
        self.assertEqual(self.ledger.snapshot('job')['held_cost_micro_usd'],150)
    def test_restart_does_not_dispatch_or_refund_uncertain_work(self):
        self.dispatched()
        restarted=Ledger(self.path,clock=lambda:1000)
        self.assertEqual(restarted.quarantine_inflight('job'),1)
        self.assertEqual(restarted.quarantine_inflight('job'),0)
        self.assertEqual(restarted.snapshot('job')['held_cost_micro_usd'],150)
        with self.assertRaisesRegex(BudgetError,'JOB_HALTED'):restarted.claim_dispatch('job','call')
    def test_provider_exceeding_limit_records_actual_cost_and_halts(self):
        self.dispatched();self.ledger.settle('job','call',50,100)
        snapshot=self.ledger.snapshot('job')
        self.assertEqual(snapshot['held_cost_micro_usd'],250)
        self.assertEqual(snapshot['calls'][0]['status'],'overrun')
        with self.assertRaisesRegex(BudgetError,'JOB_HALTED'):self.reserve('another')
    def test_rounding_is_conservative_and_events_immutable(self):
        self.assertEqual(replace(POLICY,input_micro_usd_per_million=1,output_micro_usd_per_million=1).cost(1,1),1)
        self.reserve()
        with sqlite3.connect(self.path) as db:
            with self.assertRaisesRegex(sqlite3.IntegrityError,'Append-only'):
                db.execute('DELETE FROM budget_events')
            with self.assertRaisesRegex(sqlite3.IntegrityError,'Append-only'):
                db.execute("UPDATE budget_events SET event='changed'")
    def test_unavailable_storage_blocks_instead_of_using_memory(self):
        with self.assertRaises(sqlite3.OperationalError):Ledger(self.path/'invalid.sqlite')
        self.assertEqual(self.ledger.snapshot('job')['held_cost_micro_usd'],0)

if __name__ == '__main__': unittest.main()
