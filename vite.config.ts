import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { gzipSync } from 'node:zlib'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function packedFfmpeg(): Plugin {
  const id = 'virtual:cutroom-ffmpeg'
  let bytes: Buffer
  let path: string
  function prepare() {
    if (bytes) return
    const require = createRequire(import.meta.url)
    bytes = gzipSync(readFileSync(require.resolve('@ffmpeg/core/wasm')), { level: 6 })
    path = '/assets/ffmpeg-' + createHash('sha256').update(bytes).digest('hex').slice(0, 12) + '.wasm-pack'
  }

  return {
    name: 'packed-ffmpeg',
    resolveId: (name) => name === id ? '\0' + id : undefined,
    load(name) {
      if (name !== '\0' + id) return
      prepare()
      return 'export default ' + JSON.stringify(path)
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith('/assets/ffmpeg-') || !request.url.endsWith('.wasm-pack')) return next()
        prepare()
        if (request.url !== path) return next()
        response.setHeader('Content-Type', 'application/octet-stream')
        response.end(bytes)
      })
    },
    generateBundle() {
      prepare()
      this.emitFile({ type: 'asset', fileName: path.slice(1), source: bytes })
    },
  }
}

export default defineConfig({
  plugins: [react(), packedFfmpeg()],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
})
