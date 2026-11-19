#!/bin/bash
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=../lib-root.sh
source "$HERE/../lib-root.sh"
whoami
if [ -f "$ORGANON_ROOT/organon-credentials.yaml" ]; then echo CREDS; else echo NO_CREDS; fi
if [ -f "$ORGANON_ROOT/deepseek-harness/apps/cli/src/bin.ts" ]; then echo DSH_SRC; else echo NO_DSH_SRC; fi
if [ -x "$ORGANON_ROOT/.dsh/benchmarks/venv/bin/python" ]; then echo VENV; else echo NO_VENV; fi
command -v node
node -v
if node --import tsx/esm -e 'console.log("tsx-ok")'; then echo TSX_OK; else echo TSX_NO; fi
grep -n "num_public_cases" "$ORGANON_ROOT/evolve-tasks/ale_bench/ahc008/evaluator/evaluator.py"
python3 - "$ORGANON_ROOT" <<'PY'
import sys
from pathlib import Path
root = Path(sys.argv[1])
p = root / "evolve-tasks/ale_bench/ahc008/run/population.jsonl"
print("population_exists", p.exists(), "lines", sum(1 for _ in p.open()) if p.exists() else 0)
PY
