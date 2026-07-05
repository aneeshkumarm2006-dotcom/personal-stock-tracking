import { z } from 'zod'

// PUT /api/scanner/settings body. A partial patch over the editable knobs — the
// settings form may send any subset. Permissive by design: unknown keys are
// stripped (default object behaviour), and the singleton's identity/metadata
// (_id, seededFrom, createdAt) are intentionally NOT accepted here.
const costsSchema = z.record(z.string(), z.number())

const strategiesSchema = z.record(z.string(), z.boolean())

export const scannerSettingsUpdateSchema = z
  .object({
    capital: z.number().positive('capital must be greater than zero'),
    riskPct: z.number().min(0).max(100),
    riskPctOverrides: z.record(z.string(), z.number()),
    entryModel: z.string(),
    gapHardCapPct: z.number().min(0),
    minFillRR: z.number().min(0),
    timeStopSessions: z.number().int().min(1),
    tpMode: z.enum(['partial-trail', 'tp1-full']),
    slippageBps: z.number().int().min(0),
    costs: costsSchema,
    strategies: strategiesSchema,
    watchlist: z.array(z.string()),
    blacklist: z.array(z.string()),
  })
  .partial()

export type ScannerSettingsUpdate = z.infer<typeof scannerSettingsUpdateSchema>
