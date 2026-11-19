#!/bin/bash
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib-root.sh
source "$HERE/lib-root.sh"

unset DSH_EVOLVE_RSI || true
unset DSH_EVOLVE_L3 || true
unset DSH_EVOLVE_SELEXIS || true
unset DSH_EVOLVE_HARDENED || true
# This tree is OR2. vns-parent supplies select and mutate. It is not the OR1 floor graft.
unset DSH_EVOLVE_FLOOR || true

TASK="$ORGANON_ROOT/evolve-tasks/ale_bench/ahc008"
ARCH="$ORGANON_ROOT/evolve-tasks/_archive"
LOGDIR="$ORGANON_ROOT/evolve-tasks/logs"
mkdir -p "$ARCH" "$LOGDIR"

if [[ ! -f "$ORGANON_ROOT/organon-credentials.yaml" ]]; then
  echo "缺少 $ORGANON_ROOT/organon-credentials.yaml。先运行: bash \"$HERE/setup.sh\""
  exit 1
fi
if [[ ! -x "$ORGANON_ROOT/.dsh/benchmarks/venv/bin/python" ]]; then
  echo "Python 评测环境还不能用。先运行: bash \"$HERE/setup.sh\""
  exit 1
fi
if [[ ! -f "$ORGANON_ROOT/deepseek-harness/node_modules/tsx/package.json" ]]; then
  echo "Harness 依赖还没装好。先运行: bash \"$HERE/setup.sh\""
  exit 1
fi

if [ -e "$TASK/run" ]; then
  stamp=$(date +%Y%m%d-%H%M%S)
  mv "$TASK/run" "$ARCH/ahc008-run-$stamp"
  echo "archived previous run -> $ARCH/ahc008-run-$stamp"
fi

grep -q "num_public_cases = 50" "$TASK/evaluator/evaluator.py"
test -f "$TASK/solution.cpp"

PROMPT='The working directory is ALE-Bench problem ahc008. solution.cpp at the task root is the baseline. evaluator/evaluator.py is the official ALE-Bench interface and already scores 50 public cases. Do not edit the evaluator, task.json, solution.cpp, or the case count.

Call evolve_run exactly once, immediately, with max_budget 100. Do not pass candidates, so this call runs until the budget is used. Do not call any tool before evolve_run. After it returns, stop. Do not use bash. Do not call the evaluator yourself. Do not edit the solution yourself. Do not use the web. Do not read the harness source.'

mkdir -p "$HERE/.cache"
python3 -c 'import json,sys; print("process.chdir(%s)" % json.dumps(sys.argv[1]))' "$TASK" > "$HERE/.cache/chdir-ahc008-formal.mjs"
cd "$ORGANON_ROOT/deepseek-harness"
LOG="$LOGDIR/ahc008-formal.log"
echo "start $(date -Iseconds) root=$ORGANON_ROOT" >> "$LOG"
exec stdbuf -oL -eL node --import tsx/esm --import "$HERE/.cache/chdir-ahc008-formal.mjs" apps/cli/src/bin.ts headless --json "$PROMPT" >> "$LOG" 2>&1
