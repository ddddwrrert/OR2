#!/bin/bash
# One-time setup after this folder is copied to another computer.
# Usage, from anywhere:  bash /path/to/organon/evolve-tasks/setup.sh
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib-root.sh
source "$HERE/lib-root.sh"

CREDS="$ORGANON_ROOT/organon-credentials.yaml"

say() { printf '%s\n' "$*"; }

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    say "缺少命令: $1"
    exit 1
  fi
}

write_npmrc() {
  local dir="$1"
  local store="$2"
  python3 - "$dir/.npmrc" "$store" <<'PY'
import sys
path, store = sys.argv[1], sys.argv[2]
try:
    text = open(path, encoding="utf-8").read()
except FileNotFoundError:
    text = ""
lines = [ln for ln in text.splitlines() if not ln.startswith("store-dir=")]
lines.append(f"store-dir={store}")
open(path, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
PY
}

say "目录: $ORGANON_ROOT"

need node
node -e 'const p=process.versions.node.split(".").map(Number); if(!((p[0]===22&&p[1]>=19)||p[0]>=24)){console.error("需要 Node ^22.19 或 >=24，当前是 "+process.versions.node); process.exit(1)}'
say "Node $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  need corepack
  corepack enable
  corepack prepare pnpm@11.7.0 --activate
fi
say "pnpm $(pnpm -v)"

if [[ ! -f "$CREDS" ]]; then
  copied=""
  if [[ -n "${ORGANON_CREDENTIALS:-}" && -f "$ORGANON_CREDENTIALS" ]]; then
    copied="$ORGANON_CREDENTIALS"
  elif [[ -f /root/organon-credentials.yaml ]]; then
    copied=/root/organon-credentials.yaml
  fi
  if [[ -n "$copied" ]] && grep -q '^version:' "$copied"; then
    umask 077
    cp "$copied" "$CREDS"
    chmod 600 "$CREDS"
    say "已把密钥文件复制到本目录，没有打印内容。"
  elif [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
    umask 077
    {
      echo "version: 1"
      echo "refs:"
      printf '  DEEPSEEK_API_KEY: %s\n' "$DEEPSEEK_API_KEY"
    } > "$CREDS"
    chmod 600 "$CREDS"
    say "已用环境变量 DEEPSEEK_API_KEY 写成密钥文件，没有打印内容。"
  else
    say "还没有密钥文件。任选一种："
    say "  1. 把原来的 organon-credentials.yaml 放到 $CREDS"
    say "  2. DEEPSEEK_API_KEY=sk-... bash evolve-tasks/setup.sh"
    say "格式见 organon-credentials.yaml.example。不要把真密钥提交到 git。"
    exit 1
  fi
fi
chmod 600 "$CREDS" || true

need python3
PY=python3
if command -v python3.12 >/dev/null 2>&1; then
  PY=python3.12
fi
VENV_PY="$ORGANON_ROOT/.dsh/benchmarks/venv/bin/python"
if ! "$VENV_PY" -c 'import ale_bench, ale_bench_eval' >/dev/null 2>&1; then
  say "重建 Python 虚拟环境并安装本目录里的 ALE-Bench。"
  rm -rf "$ORGANON_ROOT/.dsh/benchmarks/venv"
  "$PY" -m venv "$ORGANON_ROOT/.dsh/benchmarks/venv"
  "$ORGANON_ROOT/.dsh/benchmarks/venv/bin/pip" install -U pip
  "$ORGANON_ROOT/.dsh/benchmarks/venv/bin/pip" install "$ORGANON_ROOT/.dsh/benchmarks/ALE-Bench"
fi
say "Python 评测环境可用。"

write_npmrc "$ORGANON_ROOT/deepseek-harness" "../.pnpm-store"
for profile in headless organon-sdk web; do
  write_npmrc "$ORGANON_ROOT/.dsh/profiles/$profile" "../../../.pnpm-store"
done

repair_modules() {
  local dir="$1"
  local marker="$2"
  if [[ ! -f "$marker" ]]; then
    say "重装 $dir 的依赖。旧的 node_modules 指着另一台电脑。"
    rm -rf "$dir/node_modules"
  fi
}

say "安装 DeepSeek Harness 依赖。这一步需要网络，第一次会比较久。"
repair_modules "$ORGANON_ROOT/deepseek-harness" "$ORGANON_ROOT/deepseek-harness/node_modules/tsx/package.json"
(
  cd "$ORGANON_ROOT/deepseek-harness"
  pnpm install
)
for profile in headless organon-sdk web; do
  say "安装 profile: $profile"
  repair_modules "$ORGANON_ROOT/.dsh/profiles/$profile" "$ORGANON_ROOT/.dsh/profiles/$profile/node_modules/dsh-evolve-loop/src/floor/graft.js"
  (
    cd "$ORGANON_ROOT/.dsh/profiles/$profile"
    pnpm install
  )
done

need docker
if ! docker info >/dev/null 2>&1; then
  say "Docker 没有运行。先启动 Docker，再重新执行本脚本。"
  exit 1
fi
if ! docker image inspect ale-bench:cpp20-202301 >/dev/null 2>&1; then
  say "构建评测镜像 ale-bench:cpp20-202301。"
  (
    cd "$ORGANON_ROOT/.dsh/benchmarks/ALE-Bench"
    docker build ./dockerfiles -t ale-bench:cpp20-202301 -f ./dockerfiles/Dockerfile_cpp20_202301 --build-arg UID="$(id -u)" --build-arg GID="$(id -g)"
  )
fi
if ! docker image inspect rust:1.79.0-buster >/dev/null 2>&1; then
  say "拉取 rust:1.79.0-buster。"
  docker pull rust:1.79.0-buster
fi

say "可以启动了: bash \"$ORGANON_ROOT/evolve-tasks/start-ahc008-formal.sh\""
