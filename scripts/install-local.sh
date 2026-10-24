#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for required_command in node npm python3 openssl pdftoppm; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Prérequis système absent : $required_command" >&2
    exit 1
  fi
done
node --input-type=module -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major!==22||minor<13)throw Error("Node 22.13 ou ultérieur dans la branche 22 est requis")'
mkdir -p .local/install
chmod 700 .local
npm ci --include=dev
npx playwright install chromium
python3 -m venv .local/tools-venv
.local/tools-venv/bin/python -m pip install -r scripts/requirements-tools.txt
.local/tools-venv/bin/python -m pip freeze > .local/install/python-installed.txt
npm run typecheck
npm run build
printf '\nInstallation locale terminée. Démarrage : npm run local:start\n'
