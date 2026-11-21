// Synthetic highlights used only in automated tests. These describe no actual video.
import type { Analysis, AnalysisRequest } from '../shared/contracts'

export const videoId = 'ixRanV-rdAQ'
export const ownerToken = 'fixture_owner_token_for_test_runs_only'
export const preferences: AnalysisRequest = {
  url: `https://youtu.be/${videoId}?si=discard-this`,
  count: 5,
  length: 'balanced',
}
export const lowerScore = {
  source_start_seconds: 60,
  source_end_seconds: 85,
  title: 'Fixture: the final turn',
  opening_hook: 'The lead changes just before the finish.',
  rationale: 'The reversal and payoff fit in one clip.',
  content_category: 'Gameplay',
  quality_score: 77,
  verification_status: 'uncertain',
} as const

export const higherScore = {
  ...lowerScore,
  source_start_seconds: 10,
  source_end_seconds: 30,
  title: 'Fixture: the comeback',
  quality_score: 94,
  verification_status: 'estimated',
} as const

export const fixture: Analysis = {
  videoId,
  model: 'gemini-4-hydrogen',
  sourceDurationSeconds: 120,
  clips: [
    { ...higherScore, id: '10-30', transcript_excerpt_if_supported: null },
    { ...lowerScore, id: '60-85', transcript_excerpt_if_supported: null },
  ],
}

export const geminiFixture = {
  id: 'fixture-interaction',
  status: 'completed',
  steps: [{
    type: 'model_output',
    content: [{ type: 'text', text: JSON.stringify({ source_duration_seconds: 120, clips: [lowerScore, higherScore] }) }],
  }],
}
