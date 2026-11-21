import { expect, it } from 'vitest'
import { captionsAreValid, groupSpeechChunks, parseCaptions, subtitleScript } from '../src/media/captions'

it('imports timed SRT and uses source-relative ranges for the export', () => {
  const captions = parseCaptions('1\r\n00:00:00,200 --> 00:00:01,140\r\nFirst line\r\nSecond line\r\n', 10)
  expect(captions).toEqual([{ id: '1', start: 10.2, end: 11.14, text: 'First line\nSecond line' }])
  expect(captionsAreValid(captions, 15)).toBe(true)
  expect(captionsAreValid(captions, 11)).toBe(false)
  expect(subtitleScript(captions, { start: 10, end: 11 }, 'editorial')).toContain(
    'Dialogue: 0,0:00:00.20,0:00:01.00,Caption,,0,0,0,,First line\\NSecond line',
  )
})

it('imports VTT with cue IDs and formatting while neutralizing ASS tags', () => {
  const input = 'WEBVTT\n\nNOTE A comment\n\ncue-one\n00:00.500 --> 00:01.500 align:center\n<b>A &amp; B</b>{\\pos(0,0)}'
  const [cue] = parseCaptions(input)
  expect(cue).toMatchObject({ start: 0.5, end: 1.5, text: 'A & B{\\pos(0,0)}' })
  const ass = subtitleScript([cue], { start: 0, end: 2 }, 'studio')
  expect(ass).toContain('A & B｛＼pos(0,0)｝')
  expect(ass).not.toContain('{\\pos')
})

it('rejects invalid caption times and empty cues', () => {
  expect(() => parseCaptions('1\n00:99:00,200 --> 00:00:01,140\nText')).toThrow()
  expect(() => parseCaptions('WEBVTT\n\n00:01.000 --> 00:01.000\nText')).toThrow()
  expect(() => parseCaptions('WEBVTT\n\n00:01.000 --> 00:02.000\n')).toThrow()
})

it('only highlights words with valid model timing and clips words to the source range', () => {
  const range = { start: 4, end: 6 }
  const cues = groupSpeechChunks([
    { text: ' First', timestamp: [0.2, 0.5] },
    { text: ' skipped', timestamp: [0.6, null] },
    { text: ' word', timestamp: [0.64, 1.0] },
    { text: ' next', timestamp: [1.85, 2.5] },
  ], range)
  expect(cues.map(({ text, end }) => ({ text, end }))).toEqual([
    { text: 'First word', end: 5 },
    { text: 'next', end: 6 },
  ])
  expect(subtitleScript(cues, range, 'kinetic')).toContain('{\\k44}First {\\k36}word')
  expect(subtitleScript(cues, range, 'studio')).not.toContain('{\\k')
})
