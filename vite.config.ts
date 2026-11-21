import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { gzipSync } from 'node:zlib'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const packageRequire = createRequire(import.meta.url)
const onnxDirectory = dirname(packageRequire.resolve('onnxruntime-web'))

function packedWasm(): Plugin {
  const sources = {
    ffmpeg: packageRequire.resolve('@ffmpeg/core/wasm'),
    onnx: join(onnxDirectory, 'ort-wasm-simd-threaded.jsep.wasm'),
  }
  const prefix = 'virtual:cutroom-'
  const packs = new Map<string, { path: string; bytes: Buffer }>()

  function prepare(name: keyof typeof sources) {
    const existing = packs.get(name)
    if (existing) return existing
    const bytes = gzipSync(readFileSync(sources[name]), { level: 6 })
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
    const pack = { path: `/assets/${name}-${hash}.wasm-pack`, bytes }
    packs.set(name, pack)
    return pack
  }

  return {
    name: 'packed-wasm',
    resolveId: (id) => id.startsWith(prefix) && Object.hasOwn(sources, id.slice(prefix.length)) ? '\0' + id : undefined,
    load(id) {
      if (!id.startsWith('\0' + prefix)) return
      const pack = prepare(id.slice(prefix.length + 1) as keyof typeof sources)
      return 'export default ' + JSON.stringify(pack.path)
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.endsWith('.wasm-pack')) return next()
        const pack = [...packs.values()].find(({ path }) => path === request.url)
        if (!pack) return next()
        response.setHeader('Content-Type', 'application/octet-stream')
        response.end(pack.bytes)
      })
    },
    generateBundle() {
      for (const { path, bytes } of packs.values()) this.emitFile({ type: 'asset', fileName: path.slice(1), source: bytes })
    },
  }
}

export default defineConfig({
  resolve: {
    alias: [
      { find: /^cutroom-ort-module(?=\?|$)/, replacement: join(onnxDirectory, 'ort-wasm-simd-threaded.jsep.mjs') },
    ],
  },
  worker: { format: 'es' },
  plugins: [react(), packedWasm()],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
})
