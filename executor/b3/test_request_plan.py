import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from budget import BudgetError, Ledger
from test_budget import POLICY
from request_plan import prepare_request

class RequestPlanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.ledger = Ledger(Path(self.temp.name)/"budget.sqlite", clock=lambda:1000)
        self.ledger.create_job("job", replace(POLICY, provider="nous"))
    def tearDown(self): self.temp.cleanup()
    def prepare(self, **kwargs):
        values = dict(ledger=self.ledger, job_id="job", call_id="call", agent="carlos", phase="round1", messages=[{"role":"user","content":"Synthetic public data"}], input_tokens=50, output_tokens=50)
        values.update(kwargs)
        return prepare_request(**values)
    def test_explicit_model_and_output_cap_without_dispatch(self):
        request = self.prepare()
        self.assertEqual(request["body"]["model"], "fake-model")
        self.assertEqual(request["body"]["max_tokens"], 50)
        self.assertFalse(request["live_enabled"])
        self.assertEqual(self.ledger.snapshot("job")["calls"][0]["status"], "prepared")
        self.assertNotIn("tools",request["body"])
    def test_too_large_input_is_blocked_before_a_plan_is_returned(self):
        with self.assertRaises(BudgetError): self.prepare(input_tokens=101)
        self.assertEqual(self.ledger.snapshot("job")["calls"],[])
    def test_caller_changes_cannot_mutate_reserved_payload(self):
        messages=[{"role":"user","content":"Synthetic"}]
        request=self.prepare(messages=messages)
        messages[0]["content"]="changed"
        self.assertEqual(request["body"]["messages"][0]["content"],"Synthetic")
        with self.assertRaisesRegex(BudgetError,"REQUEST_CONFLICT"): self.prepare(messages=messages)
    def test_tools_extra_fields_and_empty_messages_are_rejected(self):
        for messages in [[],[{"role":"tool","content":"x"}],[{"role":"user","content":"x","tools":[]}],[{"role":"user","content":""}]]:
            with self.assertRaises(BudgetError):self.prepare(messages=messages)
        self.assertEqual(self.ledger.snapshot("job")["calls"],[])
    def test_different_provider_is_not_silently_used(self):
        self.ledger.create_job("other",POLICY)
        with self.assertRaisesRegex(BudgetError,"PROVIDER_NOT_APPROVED"):self.prepare(job_id="other")
