import { z } from 'zod'
import { videoIdSchema } from './youtube'

export const MODEL = 'gemini-4-hydrogen'

export const lengthOptions = {
  balanced: '15–45 sec',
  quick: '15–25 sec',
  full: '25–45 sec',
} as const

export const analysisRequestSchema = z.strictObject({
  url: z.string().trim().min(1).max(2048),
  count: z.number().int().min(5).max(10),
  length: z.enum(['balanced', 'quick', 'full']),
})
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>

export const candidateSchema = z.object({
  source_start_seconds: z.number().int().nonnegative().max(86400),
  source_end_seconds: z.number().int().positive().max(86400),
  title: z.string().trim().min(1).max(90),
  opening_hook: z.string().trim().min(1).max(300),
  rationale: z.string().trim().min(1).max(500),
  content_category: z.enum(['Gameplay', 'Reaction', 'Humor', 'Drama', 'Story', 'Insight', 'Other']),
  quality_score: z.number().int().min(0).max(100),
  verification_status: z.enum(['estimated', 'uncertain']),
})

export const durationSchema = z.number().int().positive().max(86400).nullable()

export const analysisSchema = z.object({
  videoId: videoIdSchema,
  model: z.literal(MODEL),
  sourceDurationSeconds: durationSchema,
  clips: z.array(candidateSchema.extend({
    id: z.string().min(1).max(40),
    transcript_excerpt_if_supported: z.null(),
  })).max(10),
})

export type Analysis = z.infer<typeof analysisSchema>
export type Clip = Analysis['clips'][number]
