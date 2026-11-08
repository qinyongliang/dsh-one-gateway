import { spawnSync } from 'node:child_process'
const r = spawnSync(process.execPath, ['test/smoke-run.mjs'], { stdio: 'inherit' })
process.exit(r.status ?? 1)
