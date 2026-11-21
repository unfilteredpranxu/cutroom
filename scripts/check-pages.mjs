import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const output = 'dist'
const maxAssetBytes = 25 * 1024 * 1024
const files = await readdir(output, { recursive: true, withFileTypes: true })
if (!files.some((entry) => entry.isFile() && entry.name === 'index.html')) {
  throw new Error('Run the production build before checking Pages assets.')
}

let largest = 0
for (const entry of files) {
  if (!entry.isFile()) continue
  const path = join(entry.parentPath, entry.name)
  const { size } = await stat(path)
  if (size > maxAssetBytes) throw new Error(`${path} exceeds the Cloudflare Pages 25 MiB asset limit.`)
  largest = Math.max(largest, size)
}
console.log(`Pages assets verified. Largest asset: ${(largest / 1024 / 1024).toFixed(2)} MiB.`)
