#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -x .local/tools-venv/bin/slither ]; then
  echo 'Installer les outils avec npm run install:local.' >&2
  exit 1
fi
npm run compile
mkdir -p .local/install
rm -f .local/install/slither.json
export VIRTUAL_ENV="$PWD/.local/tools-venv"
set +e
.local/tools-venv/bin/slither artifacts/compiler-input.json --compile-force-framework solc-json --solc scripts/solc-local.mjs --filter-paths node_modules --json .local/install/slither.json > .local/install/slither.log 2>&1
analysis_status=$?
set -e
.local/tools-venv/bin/python - "$analysis_status" <<'PY'
import json,sys
from pathlib import Path
p=Path('.local/install/slither.json')
if not p.exists():
    raise SystemExit('Analyse non aboutie : consulter .local/install/slither.log')
r=json.loads(p.read_text())
if not r.get('success'):
    raise SystemExit('Analyse non aboutie : consulter .local/install/slither.log')
n=len(r.get('results',{}).get('detectors',[]))
print(f'Analyse Slither exécutée : {n} alerte(s). Rapport : .local/install/slither.json')
print('Une analyse aboutie ne signifie pas absence de vulnérabilité. Voir docs/SECURITE.md.')
PY
