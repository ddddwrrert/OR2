# Resolve this tree from the script location. Source this; do not execute it.
_ORGANON_HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
export ORGANON_ROOT=$(cd "$_ORGANON_HERE/.." && pwd)
export DSH_HOME="$ORGANON_ROOT/.dsh"
export PATH="$ORGANON_ROOT/.dsh/benchmarks/venv/bin:${PATH:-}"
unset _ORGANON_HERE
