import os from 'node:os'
import path from 'node:path'
export function dshHomePath(...segments) {
  return path.join(os.tmpdir(), 'dsh-one-gateway-smoke-home', ...segments)
}
