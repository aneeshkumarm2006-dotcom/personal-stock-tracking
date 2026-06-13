import { z } from 'zod'

export const chargesSchema = z.object({
  brokerage: z.number().min(0).default(0),
  stt: z.number().min(0).default(0),
  exchFees: z.number().min(0).default(0),
  gst: z.number().min(0).default(0),
  stampDuty: z.number().min(0).default(0),
  sebiFees: z.number().min(0).default(0),
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
  }),
  notes: z.string().optional(),
})

export type TransactionInput = z.infer<typeof transactionSchema>

export const cashAccountSchema = z.object({
  fundsAdded: z.number().min(0, 'funds added must be zero or more'),
})

export type CashAccountInput = z.infer<typeof cashAccountSchema>

export const holdingTagsSchema = z.object({
  instrumentSymbol: z.string().optional(),
  tags: z.array(z.string()).max(50, 'too many tags'),
})

export type HoldingTagsInput = z.infer<typeof holdingTagsSchema>

export const strategyGroupSchema = z.object({
  name: z.string().min(1, 'name is required'),
  allocatedCapital: z.number().positive('allocatedCapital must be greater than zero'),
})

export type StrategyGroupInput = z.infer<typeof strategyGroupSchema>

const strategyEntryBaseSchema = z.object({
  groupId: z.string().min(1),
  instrumentToken: z.string().min(1),
  instrumentSymbol: z.string().min(1),
  entryPrice: z.number().positive('entryPrice must be greater than zero'),
  stopLoss: z.number().positive('stopLoss must be greater than zero'),
  // First target (TP1).
  targetPrice: z.number().positive('targetPrice must be greater than zero'),
  // Optional second target (TP2). Must sit above TP1 when provided.
  target2: z.number().positive('target2 must be greater than zero').optional(),
  quantity: positiveInt,
  direction: z.enum(['long']).default('long'),
})

export const strategyEntrySchema = strategyEntryBaseSchema.superRefine(
  (data, ctx) => {
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

// Create or fully edit one alert. `status` is optional on create (the model
// defaults to 'armed').
export const priceAlertSchema = z.object({
  targetPrice: z.number().positive('targetPrice must be greater than zero'),
  direction: alertDirectionEnum.default('below'),
  note: z.string().max(500).optional(),
  status: alertStatusEnum.optional(),
})

export type PriceAlertInput = z.infer<typeof priceAlertSchema>

// Snooze / disable / re-arm or partial edit: a body of just { status } is valid.
export const priceAlertUpdateSchema = priceAlertSchema.partial()

export type PriceAlertUpdateInput = z.infer<typeof priceAlertUpdateSchema>
