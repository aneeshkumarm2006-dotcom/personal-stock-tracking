import { z } from 'zod'

export const chargesSchema = z.object({
  brokerage: z.number().min(0).default(0),
  stt: z.number().min(0).default(0),
  exchFees: z.number().min(0).default(0),
  gst: z.number().min(0).default(0),
  stampDuty: z.number().min(0).default(0),
  sebiFees: z.number().min(0).default(0),
  // Single combined charge amount (current UI). Legacy rows split the total
  // across the fields above; consumers sum them all, so either form is valid.
  total: z.number().min(0).default(0),
})

export type Charges = z.infer<typeof chargesSchema>

const dateLike = z.preprocess((v) => {
  if (v instanceof Date) return v
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? v : d
  }
  return v
}, z.date())

const positiveInt = z
  .number()
  .int('quantity must be an integer')
  .positive('quantity must be greater than zero')

export const transactionSchema = z.object({
  instrumentToken: z.string().min(1),
  instrumentSymbol: z.string().min(1),
  type: z.enum(['BUY', 'SELL']),
  quantity: positiveInt,
  price: z.number().positive('price must be greater than zero'),
  date: dateLike,
  charges: chargesSchema.default({
    brokerage: 0,
    stt: 0,
    exchFees: 0,
    gst: 0,
    stampDuty: 0,
    sebiFees: 0,
    total: 0,
  }),
  notes: z.string().optional(),
})

export type TransactionInput = z.infer<typeof transactionSchema>

export const cashAccountSchema = z.object({
  fundsAdded: z.number().min(0, 'funds added must be zero or more'),
})

export type CashAccountInput = z.infer<typeof cashAccountSchema>

// A top-up: the amount to add to the running funds-added total.
export const addFundsSchema = z.object({
  amount: z.number().positive('amount must be greater than zero'),
})

export type AddFundsInput = z.infer<typeof addFundsSchema>

export const holdingTagsSchema = z.object({
  instrumentSymbol: z.string().optional(),
  tags: z.array(z.string()).max(50, 'too many tags'),
})

export type HoldingTagsInput = z.infer<typeof holdingTagsSchema>

export const instrumentNoteSchema = z.object({
  instrumentSymbol: z.string().optional(),
  note: z.string().max(10000, 'note is too long'),
})

export type InstrumentNoteInput = z.infer<typeof instrumentNoteSchema>

export const strategyGroupSchema = z.object({
  name: z.string().min(1, 'name is required'),
  allocatedCapital: z.number().positive('allocatedCapital must be greater than zero'),
})

export type StrategyGroupInput = z.infer<typeof strategyGroupSchema>

const strategyEntryBaseSchema = z.object({
  groupId: z.string().min(1),
  // Optional: an entry can be saved with just the levels and no stock yet, then
  // have the stock assigned later via an edit. Empty/absent means "unassigned".
  instrumentToken: z.string().optional(),
  instrumentSymbol: z.string().optional(),
  entryPrice: z.number().positive('entryPrice must be greater than zero'),
  stopLoss: z.number().positive('stopLoss must be greater than zero'),
  // First target (TP1).
  targetPrice: z.number().positive('targetPrice must be greater than zero'),
  // Optional second target (TP2). Must sit above TP1 when provided.
  target2: z.number().positive('target2 must be greater than zero').optional(),
  quantity: positiveInt,
  direction: z.enum(['long']).default('long'),
  // Free-form labels captured at creation (e.g. "swing", "earnings"). Editable
  // later on the entry too. Optional so existing callers keep working.
  tags: z.array(z.string()).max(50, 'too many tags').optional(),
  // How a pending entry should fill. 'auto' lets the server decide off the live
  // price (breakout vs dip); 'limit'/'stop' force the choice. 'active' means the
  // position is already held — the entry is recorded as filled immediately
  // rather than waiting for a trigger. Resolved to a concrete 'limit'|'stop'
  // before the entry is stored.
  triggerType: z.enum(['auto', 'limit', 'stop', 'active']).default('auto'),
})

export const strategyEntrySchema = strategyEntryBaseSchema.superRefine(
  (data, ctx) => {
    // "Already entered" means the position is held right now — that requires
    // knowing the stock. An unassigned entry can only ever be a pending idea.
    if (data.triggerType === 'active' && !data.instrumentToken) {
      ctx.addIssue({
        code: 'custom',
        path: ['instrumentToken'],
        message: 'Pick a stock to mark an entry as already held',
      })
    }
    if (data.stopLoss >= data.entryPrice) {
      ctx.addIssue({
        code: 'custom',
        path: ['stopLoss'],
        message: 'stopLoss must be below entryPrice for a long entry',
      })
    }
    if (data.targetPrice <= data.entryPrice) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetPrice'],
        message: 'targetPrice must be above entryPrice for a long entry',
      })
    }
    if (data.target2 != null && data.target2 <= data.targetPrice) {
      ctx.addIssue({
        code: 'custom',
        path: ['target2'],
        message: 'target2 must be above target1 (TP1)',
      })
    }
  },
)

export const strategyEntryUpdateSchema = strategyEntryBaseSchema
  .partial()
  .omit({ groupId: true, direction: true })

export type StrategyEntryInput = z.infer<typeof strategyEntrySchema>

// Turn a planned strategy entry into a real portfolio position. The user records
// the ACTUAL fill (entry price often differs from the planned one) plus the
// levels to track and a combined charge — the route creates a BUY transaction
// from this and marks the entry as entered/active.
export const strategyEnterSchema = z
  .object({
    entryPrice: z.number().positive('entryPrice must be greater than zero'),
    quantity: positiveInt,
    stopLoss: z.number().positive('stopLoss must be greater than zero'),
    targetPrice: z.number().positive('targetPrice must be greater than zero'),
    target2: z.number().positive('target2 must be greater than zero').optional(),
    date: dateLike,
    // Single combined brokerage+taxes amount, like AddTransactionDialog.
    charges: z.number().min(0).default(0),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.stopLoss >= data.entryPrice) {
      ctx.addIssue({
        code: 'custom',
        path: ['stopLoss'],
        message: 'stopLoss must be below entryPrice for a long entry',
      })
    }
    if (data.targetPrice <= data.entryPrice) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetPrice'],
        message: 'targetPrice must be above entryPrice for a long entry',
      })
    }
    if (data.target2 != null && data.target2 <= data.targetPrice) {
      ctx.addIssue({
        code: 'custom',
        path: ['target2'],
        message: 'target2 must be above target1 (TP1)',
      })
    }
  })

export type StrategyEnterInput = z.infer<typeof strategyEnterSchema>

// Replace the full tag set on a strategy entry. An empty array clears tags.
export const strategyEntryTagsSchema = z.object({
  tags: z.array(z.string()).max(50, 'too many tags'),
})

export type StrategyEntryTagsInput = z.infer<typeof strategyEntryTagsSchema>

export const manualCloseSchema = z.object({
  closePrice: z.number().positive('closePrice must be greater than zero'),
  closeDate: dateLike,
})

export type ManualCloseInput = z.infer<typeof manualCloseSchema>

// --- Watchlist ---

const convictionEnum = z.enum(['watching', 'interested', 'high'])
const exchangeEnum = z.enum(['NSE', 'BSE'])
const alertDirectionEnum = z.enum(['below', 'above'])
const alertStatusEnum = z.enum(['armed', 'triggered', 'snoozed', 'disabled'])

export const watchlistItemSchema = z.object({
  instrumentToken: z.string().min(1),
  instrumentSymbol: z.string().min(1),
  exchange: exchangeEnum.default('NSE'),
  name: z.string().optional(),
  tags: z.array(z.string()).max(50, 'too many tags').default([]),
  notes: z.string().max(2000).optional(),
  targetBuyPrice: z
    .number()
    .positive('targetBuyPrice must be greater than zero')
    .optional(),
  priceWhenAdded: z.number().positive().optional(),
  conviction: convictionEnum.default('watching'),
})

export type WatchlistItemInput = z.infer<typeof watchlistItemSchema>

// Partial edit of an item's metadata (not tags/alerts — those have their own
// routes). `targetBuyPrice` is nullable so the edit form can clear the target.
export const watchlistItemUpdateSchema = z
  .object({
    instrumentSymbol: z.string().min(1),
    exchange: exchangeEnum,
    name: z.string(),
    notes: z.string().max(2000),
    targetBuyPrice: z
      .number()
      .positive('targetBuyPrice must be greater than zero')
      .nullable(),
    conviction: convictionEnum,
  })
  .partial()

export type WatchlistItemUpdateInput = z.infer<typeof watchlistItemUpdateSchema>

// --- Alerts (discriminated by `type`) -------------------------------------
// `price` is the original/Normal alert (kept flat with top-level targetPrice +
// direction for backward compatibility). Every other member is an Advanced
// condition carrying its parameters in `config`. Cross direction for
// price/pct_change/sma_cross/ema_cross lives in the top-level `direction`.

const sharedAlertFields = {
  note: z.string().max(500).optional(),
  status: alertStatusEnum.optional(),
}
const periodInt = z.number().int().positive().max(400)

const priceCondition = z.object({
  type: z.literal('price'),
  targetPrice: z.number().positive('targetPrice must be greater than zero'),
  direction: alertDirectionEnum.default('below'),
  ...sharedAlertFields,
})
const pctChangeCondition = z.object({
  type: z.literal('pct_change'),
  direction: alertDirectionEnum.default('above'),
  config: z.object({ thresholdPct: z.number().positive() }),
  ...sharedAlertFields,
})
const volumeCondition = z.object({
  type: z.literal('volume'),
  config: z
    .object({
      mode: z.literal('spike').default('spike'),
      multiple: z.number().positive().default(2),
    })
    .optional(),
  ...sharedAlertFields,
})
const week52Condition = z.object({
  type: z.literal('week52'),
  config: z.object({
    edge: z.enum(['high', 'low']),
    marginPct: z.number().min(0).max(100).default(0),
  }),
  ...sharedAlertFields,
})
const circuitCondition = z.object({
  type: z.literal('circuit'),
  config: z
    .object({ band: z.enum(['upper', 'lower', 'either']).default('either') })
    .optional(),
  ...sharedAlertFields,
})
const smaCrossCondition = z.object({
  type: z.literal('sma_cross'),
  direction: alertDirectionEnum.default('below'),
  config: z.object({ period: periodInt }),
  ...sharedAlertFields,
})
const emaCrossCondition = z.object({
  type: z.literal('ema_cross'),
  direction: alertDirectionEnum.default('below'),
  config: z.object({ period: periodInt }),
  ...sharedAlertFields,
})
const rsiCondition = z.object({
  type: z.literal('rsi'),
  config: z.object({
    rsiBand: z.enum(['overbought', 'oversold']),
    threshold: z.number().min(1).max(99).optional(),
    period: periodInt.default(14),
  }),
  ...sharedAlertFields,
})
const macdCrossCondition = z.object({
  type: z.literal('macd_cross'),
  config: z.object({ macdDirection: z.enum(['bullish', 'bearish']) }),
  ...sharedAlertFields,
})
const ratingFlipCondition = z.object({
  type: z.literal('rating_flip'),
  config: z
    .object({
      timeframe: z.enum(['1D', '1W', '1M']).default('1D'),
      to: z.enum(['buy', 'sell', 'neutral', 'any']).default('any'),
    })
    .optional(),
  ...sharedAlertFields,
})

export const alertConditionSchema = z.discriminatedUnion('type', [
  priceCondition,
  pctChangeCondition,
  volumeCondition,
  week52Condition,
  circuitCondition,
  smaCrossCondition,
  emaCrossCondition,
  rsiCondition,
  macdCrossCondition,
  ratingFlipCondition,
])

// Create one alert. A body with no `type` is a legacy price alert (the old
// watchlist/portfolio clients POST { targetPrice, direction, note }), so inject
// type:'price' before discriminating — this keeps the old wire format working.
export const alertCreateSchema = z.preprocess(
  (v) =>
    v && typeof v === 'object' && !Array.isArray(v) && !('type' in v)
      ? { ...(v as Record<string, unknown>), type: 'price' }
      : v,
  alertConditionSchema,
)

export type AlertCreateInput = z.infer<typeof alertConditionSchema>

// Snooze / disable / re-arm or note-only edit: a body of just { status } and/or
// { note }. Tried AFTER the full-condition schema so a full re-submit (which
// carries `type` or a legacy targetPrice+direction) is treated as a replace, not
// a note patch.
const alertStatusPatchSchema = z
  .object({
    status: alertStatusEnum.optional(),
    note: z.string().max(500).optional(),
  })
  .refine((o) => o.status !== undefined || o.note !== undefined, {
    message: 'Provide a status and/or note to update',
  })

export const alertUpdateSchema = z.union([
  alertCreateSchema,
  alertStatusPatchSchema,
])

export type AlertUpdateInput = z.infer<typeof alertUpdateSchema>

// Holding (portfolio) alerts additionally accept symbol/exchange on create so the
// first POST can seed the per-instrument doc (the cron needs them for the trigger
// email). Parsed separately from the condition (which strips unknown keys).
export const holdingAlertMetaSchema = z.object({
  instrumentSymbol: z.string().optional(),
  exchange: exchangeEnum.optional(),
})

export type HoldingAlertMetaInput = z.infer<typeof holdingAlertMetaSchema>

// --- Web Push ---

// The shape a browser PushSubscription serialises to (sub.toJSON()), plus the
// device's user agent for humans to tell subscriptions apart.
export const pushSubscribeSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
})

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>
