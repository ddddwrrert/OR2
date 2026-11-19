#!/bin/bash
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib-root.sh
source "$HERE/lib-root.sh"
ps -ef | awk '/bin.ts headless|cli\/src\/bin.ts/ && !/awk/ {print}'
echo "---- task ----"
ls -la "$ORGANON_ROOT/evolve-tasks/ale_bench/ahc008" | head
echo "---- sessions ----"
find "$ORGANON_ROOT/.dsh" -name "*.jsonl" -mmin -10 2>/dev/null | head
echo "---- log size ----"
wc -c "$ORGANON_ROOT/evolve-tasks/logs/ahc008-formal.log"
