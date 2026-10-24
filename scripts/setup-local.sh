#!/usr/bin/env bash
set -euo pipefail
mkdir -p .local/tls
chmod 700 .local
openssl req -x509 -newkey rsa:2048 -nodes -keyout .local/tls/key.pem -out .local/tls/cert.pem -days 30 -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' >/dev/null 2>&1
chmod 600 .local/tls/key.pem
npm run compile
if [ -f .local/runtime.json ]; then
  archive_dir=".local/archive/$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$archive_dir"
  for local_file in identities.json runtime.json gateway.json simulator.json gas.json; do
    if [ -f ".local/$local_file" ]; then mv ".local/$local_file" "$archive_dir/$local_file"; fi
  done
fi
npm run seed
