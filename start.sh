#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
PORT="${PORT:-3000}"
export PORT

run_timed() {
  /usr/bin/time -p "$@"
}

# Keep the deployment manifest in worker metadata, while the build stays in this project.
run_timed node --input-type=module - "$PROJECT_DIR" <<'NODE'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const project = resolve(process.argv[2])
const metadataDir = process.env.OPENCODE_WEB_DIR || '/home/runner/work/_temp/omgithub-web'
mkdirSync(metadataDir, { recursive: true })
writeFileSync(resolve(metadataDir, 'deployment-output.json'), JSON.stringify({ project, directory: resolve(project, 'dist') }))
NODE

if [[ ! -d node_modules || ! -f node_modules/.package-lock.json || package-lock.json -nt node_modules/.package-lock.json ]]; then
  run_timed npm install --no-audit --no-fund
fi

if [[ ! -f dist/index.html ]] || find src public index.html package.json package-lock.json vite.config.js -type f -newer dist/index.html -print -quit | grep -q .; then
  run_timed npm run build
fi

exec /usr/bin/time -p npm run preview -- --host 0.0.0.0 --port "$PORT" --strictPort
