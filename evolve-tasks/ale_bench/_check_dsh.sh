#!/bin/bash
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=../lib-root.sh
source "$HERE/../lib-root.sh"
cd "$ORGANON_ROOT/deepseek-harness"
node --import tsx/esm -e 'console.log("tsx-ok")'
echo "---- profile modules ----"
ls "$ORGANON_ROOT/.dsh/profiles/headless/node_modules/dsh-evolve-loop/src/evolve.js"
echo "---- docker ----"
docker info >/dev/null 2>&1 && echo DOCKER_OK || echo DOCKER_NO
ls -l /var/run/docker.sock 2>/dev/null || echo no-sock
