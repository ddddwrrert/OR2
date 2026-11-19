#!/bin/bash
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=../lib-root.sh
source "$HERE/../lib-root.sh"
H="$ORGANON_ROOT/.dsh/profiles/headless/node_modules"
ls -d "$H/@deepseek-ai/dsh-agent-preset-registry" 2>/dev/null || echo NO_PRESET_REGISTRY
ls -d "$H/@deepseek-ai/dsh-agent-preset" 2>/dev/null || echo NO_PRESET
python3 - "$H/dsh-evolve-loop/src" <<'PY'
import sys
from pathlib import Path
p = Path(sys.argv[1])
text = "\n".join(x.read_text(errors="ignore") for x in p.rglob("*.js"))
print("a3", "a3-mutate" in text)
print("selexis", "selexis" in text.lower())
print("floor", "floor-mutate" in text)
PY
