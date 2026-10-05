"""Test-only JSON bridge, with outbound Python network operations blocked."""
import json
from pathlib import Path
import sys
from unittest.mock import patch
from simulate_committee import run_simulation

if __name__ == '__main__':
    if len(sys.argv) != 4 or sys.argv[1] != '--offline-fixture':
        raise SystemExit('Only --offline-fixture DATABASE_PATH SCENARIO is supported')
    with patch('socket.socket.connect',side_effect=RuntimeError('Offline fixture: network blocked')), patch('urllib.request.urlopen',side_effect=RuntimeError('Offline fixture: network blocked')):
        print(json.dumps(run_simulation(Path(sys.argv[2]), sys.argv[3])))
