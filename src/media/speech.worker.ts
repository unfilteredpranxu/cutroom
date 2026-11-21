import { env, pipeline } from '@huggingface/transformers'
import runtimeModule from 'cutroom-ort-module?url'
import runtimeWasm from 'cutroom-ort-wasm?url'
import { groupSpeechChunks } from './captions'
import type { ClipRange } from './settings'

env.allowLocalModels = false
env.useBrowserCache = true
env.useWasmCache = false
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1
  env.backends.onnx.wasm.proxy = false
  env.backends.onnx.wasm.wasmPaths = {
    mjs: new URL(runtimeModule, self.location.href).href,
    wasm: new URL(runtimeWasm, self.location.href).href,
  }
}

self.onmessage = async ({ data }: MessageEvent<{ pcm: Float32Array; range: ClipRange }>) => {
  try {
    const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
      device: 'wasm',
      dtype: 'q8',
    })
    self.postMessage({ type: 'inference' })
    const result = await transcriber(data.pcm, {
      return_timestamps: 'word',
      chunk_length_s: 25,
      stride_length_s: 4,
      max_new_tokens: 256,
      task: 'transcribe',
    })
    const chunks = Array.isArray(result) ? result[0]?.chunks : result.chunks
    self.postMessage({ type: 'captions', captions: groupSpeechChunks(chunks, data.range) })
  } catch {
    self.postMessage({ type: 'failed' })
  }
}
