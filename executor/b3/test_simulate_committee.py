from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from simulate_committee import run_simulation

class SimulatedCommitteeTests(unittest.TestCase):
    def run_case(self,scenario):
        with tempfile.TemporaryDirectory() as folder, patch('socket.socket.connect',side_effect=AssertionError('Network prohibited')), patch('urllib.request.urlopen',side_effect=AssertionError('Network prohibited')):
            return run_simulation(Path(folder)/'simulation.sqlite',scenario)
    def test_all_21_calls_complete_with_shared_budget_and_no_network(self):
        r=self.run_case('success')
        self.assertEqual(r['outcome'],'simulated_complete')
        self.assertEqual(r['settled_responses'],21)
        self.assertEqual(r['held_tokens'],630)
        self.assertEqual(r['held_cost_micro_usd'],840)
        self.assertEqual(len([x for x in r['results'] if x['phase']=='round1']),9)
        self.assertEqual(len([x for x in r['results'] if x['phase']=='round2']),9)
        self.assertEqual(len([x for x in r['results'] if x['phase']=='refutation']),2)
        self.assertEqual(r['results'][-1]['agent'],'rafael')
        self.assertFalse(r['live_enabled'])
        self.assertFalse(r['portal_wallet_connected'])
    def test_unknown_usage_stops_simulation_and_holds_maximum(self):
        r=self.run_case('unknown_usage')
        self.assertEqual(r['prepared_calls'],1)
        self.assertEqual(r['settled_responses'],0)
        self.assertEqual(r['held_cost_micro_usd'],150)
        self.assertEqual(r['ledger_status'],'halted')
    def test_truncation_does_not_reach_moderator(self):
        r=self.run_case('truncated')
        self.assertEqual(r['prepared_calls'],1)
        self.assertEqual(r['outcome'],'incomplete_response')
        self.assertFalse(r['results'][0]['complete'])
        self.assertEqual(r['held_cost_micro_usd'],40)
    def test_limit_blocks_next_agent_before_dispatch(self):
        r=self.run_case('budget_exhausted')
        self.assertEqual(r['outcome'],'COST_LIMIT')
        self.assertEqual(r['prepared_calls'],1)
        self.assertEqual(r['settled_responses'],1)
        self.assertEqual(r['held_cost_micro_usd'],40)
    def test_unknown_scenario_is_rejected(self):
        with self.assertRaises(ValueError):self.run_case('invalid')
