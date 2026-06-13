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
  targetPrice: z.number().positive('targetPrice must be greater than zero'),
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
