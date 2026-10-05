import tempfile
import unittest
from pathlib import Path
from budget import BudgetError, Ledger
from test_budget import POLICY, PAYLOAD
from response_contract import reconcile_response, validate_response


def response(**changes):
    body = {"model": "fake-model", "usage": {"prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30,
            "completion_tokens_details": {"reasoning_tokens": 7}},
            "choices": [{"finish_reason": "stop", "message": {"content": "Synthetic study", "reasoning_content": "private synthetic reasoning"}}]}
    body.update(changes)
    return body


class ResponseContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.ledger = Ledger(Path(self.temp.name)/"budget.sqlite", clock=lambda: 1000)
        self.ledger.create_job("job", POLICY)
        self.ledger.reserve("job", "call", "carlos", "round1", PAYLOAD, 50, 50)
        self.ledger.claim_dispatch("job", "call")
    def tearDown(self):
        self.temp.cleanup()
    def test_reasoning_is_not_double_charged_or_exposed(self):
        result = reconcile_response(self.ledger, "job", "call", response())
        self.assertEqual(result["output_tokens"], 10)
        self.assertTrue(result["complete"])
        self.assertNotIn("reasoning", str(result))
        self.assertEqual(self.ledger.snapshot("job")["held_tokens"], 30)
    def test_missing_usage_holds_reservation_and_halts(self):
        with self.assertRaises(BudgetError):
            reconcile_response(self.ledger, "job", "call", response(usage=None))
        snapshot = self.ledger.snapshot("job")
        self.assertEqual(snapshot["held_tokens"], 100)
        self.assertEqual(snapshot["status"], "halted")
    def test_fallback_is_not_silently_accepted(self):
        with self.assertRaisesRegex(BudgetError, "MODEL_UNVERIFIED"):
            reconcile_response(self.ledger, "job", "call", response(model="different"))
        self.assertEqual(self.ledger.snapshot("job")["held_tokens"], 100)
    def test_invalid_usage_never_becomes_zero(self):
        for usage in [{}, {"prompt_tokens": True, "completion_tokens": 10, "total_tokens": 11},
                      {"prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 99},
                      {"prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30, "completion_tokens_details": {"reasoning_tokens": 11}}]:
            with self.assertRaises(BudgetError): validate_response(response(usage=usage), "fake-model")
    def test_truncation_is_accounted_but_not_delivered_as_complete(self):
        body = response(choices=[{"finish_reason": "length", "message": {"content": "partial"}}])
        result = reconcile_response(self.ledger, "job", "call", body)
        self.assertFalse(result["complete"])
        self.assertIsNone(result["text"])
        self.assertEqual(self.ledger.snapshot("job")["held_tokens"], 30)
    def test_tool_request_is_not_a_completed_study(self):
        body = response(choices=[{"finish_reason": "stop", "message": {"content": "partial", "tool_calls": [{"id": "synthetic"}]}}])
        self.assertFalse(validate_response(body, "fake-model")["complete"])
    def test_replayed_settlement_does_not_duplicate_charge(self):
        reconcile_response(self.ledger, "job", "call", response())
        reconcile_response(self.ledger, "job", "call", response())
        self.assertEqual(self.ledger.snapshot("job")["held_cost_micro_usd"], 40)
