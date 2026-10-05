"""Offline request preparation: reserves budget but NEVER claims dispatch or sends.

Token count must include the entire provider envelope; fake counters are for tests
only. This planner is not a live adapter and does not certify tokenizer or billing.
"""
from copy import deepcopy
from budget import BudgetError, fingerprint, integer


def prepare_request(ledger, job_id, call_id, agent, phase, messages, input_tokens, output_tokens):
    policy = ledger.snapshot(job_id)["policy"]
    if policy["provider"] != "nous":
        raise BudgetError("PROVIDER_NOT_APPROVED")
    if not isinstance(messages, list) or not messages:
        raise BudgetError("INVALID_MESSAGES")
    for message in messages:
        if not isinstance(message, dict) or set(message) != {"role", "content"}:
            raise BudgetError("INVALID_MESSAGES")
        if message["role"] not in ("system", "user", "assistant") or not isinstance(message["content"], str) or not message["content"].strip():
            raise BudgetError("INVALID_MESSAGES")
    integer(input_tokens, "INPUT_TOKENS", 1)
    integer(output_tokens, "OUTPUT_TOKENS", 1)
    # Small, explicit, single-completion contract. No tool routing, streaming,
    # provider fallback, credentials, recursion or arbitrary client parameters.
    body = {"model": policy["model"], "messages": deepcopy(messages),
            "max_tokens": output_tokens, "stream": False, "n": 1}
    payload_hash = fingerprint(body)
    ledger.reserve(job_id, call_id, agent, phase, payload_hash, input_tokens, output_tokens)
    return {"body": body, "payload_hash": payload_hash, "live_enabled": False}
