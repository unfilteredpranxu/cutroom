import type { ClipRange } from './settings'

export interface CaptionWord extends ClipRange { text: string }
export interface Caption extends ClipRange {
  id: string
  text: string
  words?: CaptionWord[]
}

export const presets = {
  editorial: { label: 'Editorial', size: 64, primary: '&H00FFFFFF', secondary: '&H00FFFFFF', border: 1, outline: 4, shadow: 2 },
  studio: { label: 'Studio lower third', size: 54, primary: '&H00FFFFFF', secondary: '&H00FFFFFF', border: 3, outline: 10, shadow: 0 },
  kinetic: { label: 'Kinetic highlight', size: 68, primary: '&H00FFBFAF', secondary: '&H00FFFFFF', border: 1, outline: 5, shadow: 2 },
} as const
export type CaptionPreset = keyof typeof presets
export const MAX_CAPTIONS = 250

function timestamp(value: string) {
  const match = /^(?:(\d{1,3}):)?([0-5]\d):([0-5]\d)[.,](\d{3})$/.exec(value)
  if (!match) return NaN
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000
}

function plain(text: string) {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|nbsp|quot|apos);/g, (_, entity: string) =>
      ({ amp: '&', lt: '<', gt: '>', nbsp: ' ', quot: '"', apos: "'" })[entity] ?? '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .trim()
}

export function parseCaptions(input: string, offset = 0): Caption[] {
  const normalized = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  const blocks = normalized.split(/\n[\t ]*\n/)
  const captions: Caption[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    if (/^(WEBVTT(?:\s|$)|NOTE(?:\s|$)|STYLE\s*$|REGION\s*$)/.test(lines[0])) continue
    const lineIndex = lines.findIndex((line) => line.includes('-->'))
    const timing = /^\s*(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(lines[lineIndex] ?? '')
    if (!timing) throw new Error('A caption has an invalid timing line. Use a valid SRT or WebVTT file.')
    const start = timestamp(timing[1])
    const end = timestamp(timing[2])
    const text = plain(lines.slice(lineIndex + 1).join('\n'))
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text || text.length > 240) {
      throw new Error('Caption cues need valid times and 1–240 characters of text.')
    }
    captions.push({ id: String(captions.length + 1), start: start + offset, end: end + offset, text })
    if (captions.length > MAX_CAPTIONS) throw new Error('Import up to 250 captions at a time.')
  }
  if (!captions.length) throw new Error('No caption cues were found in the file.')
  return captions.sort((a, b) => a.start - b.start)
}

export function captionsInRange(captions: Caption[], range: ClipRange) {
  return captions.filter((caption) => caption.start < range.end && caption.end > range.start)
}

export function captionsAreValid(captions: Caption[], duration: number) {
  return captions.every(({ start, end, text }) =>
    Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end <= duration + 0.001
    && end - start >= 0.01 && !!text.trim() && text.length <= 240)
}

export function groupSpeechChunks(chunks: unknown, range: ClipRange): Caption[] {
  if (!Array.isArray(chunks)) return []
  const result: Caption[] = []
  let words: CaptionWord[] = []
  function flush() {
    if (!words.length) return
    result.push({
      id: String(result.length + 1),
      start: words[0].start,
      end: words[words.length - 1].end,
      text: words.map(({ text }) => text).join(' '),
      words,
    })
    words = []
  }
  let previousEnd = range.start
  for (const chunk of chunks) {
    if (!chunk || typeof chunk.text !== 'string' || !Array.isArray(chunk.timestamp)) continue
    const [start, end] = chunk.timestamp
    if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end)) continue
    const word = { text: plain(chunk.text), start: Math.max(previousEnd, range.start + start), end: Math.min(range.end, range.start + end) }
    if (!word.text || word.text.length > 80 || word.end - word.start < 0.01) continue
    if (words.length && (words.length >= 7 || word.end - words[0].start > 3.7 || word.start - previousEnd > 0.55)) flush()
    previousEnd = word.end
    words.push(word)
  }
  flush()
  return result.slice(0, MAX_CAPTIONS)
}

function assTime(seconds: number) {
  const time = Math.max(0, Math.round(seconds * 100))
  return Math.floor(time / 360000) + ':' + String(Math.floor(time / 6000) % 60).padStart(2, '0')
    + ':' + String(Math.floor(time / 100) % 60).padStart(2, '0') + '.' + String(time % 100).padStart(2, '0')
}

function assText(text: string) {
  return text.replace(/[\r\t]/g, ' ').replace(/\\/g, '＼').replace(/\{/g, '｛').replace(/\}/g, '｝').replace(/\n/g, '\\N')
}

function karaoke(caption: Caption, start: number, end: number) {
  const words = caption.words?.filter((word) => word.end > start && word.start < end)
  if (!words?.length || start !== caption.start || end !== caption.end) return assText(caption.text)

  return words.map((word, index) => {
    const next = words[index + 1]?.start ?? end
    const time = Math.max(1, Math.round((next - word.start) * 100))
    return '{\\k' + time + '}' + assText(word.text)
  }).join(' ')
}

export function subtitleScript(captions: Caption[], range: ClipRange, preset: CaptionPreset) {
  const style = presets[preset]
  const outline = preset === 'studio' ? '&H340D0D10' : '&H1608070C'
  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ['Style: Caption', 'DejaVu Sans', style.size, style.primary, style.secondary, outline, '&H48060608',
      -1, 0, 0, 0, 100, 100, 0, 0, style.border, style.outline, style.shadow, 2, 96, 154, 296, 1].join(','),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ]
  for (const caption of captionsInRange(captions, range)) {
    const start = Math.max(caption.start, range.start)
    const end = Math.min(caption.end, range.end)
    const text = preset === 'kinetic' ? karaoke(caption, start, end) : assText(caption.text)
    lines.push(`Dialogue: 0,${assTime(start - range.start)},${assTime(end - range.start)},Caption,,0,0,0,,${text}`)
  }
  return lines.join('\n') + '\n'
}
