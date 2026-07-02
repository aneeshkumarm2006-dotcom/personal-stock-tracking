import type { AlertCreateInput } from '@/lib/validation/schemas'
import type {
  AlertConfig,
  AlertDirection,
  AlertStatus,
  ConditionType,
} from '@/lib/alerts/types'

export type AlertSubdocInput = {
  type: ConditionType
  targetPrice?: number
  direction?: AlertDirection
  config: AlertConfig
  note: string
  status: AlertStatus
}

// Map a validated create/replace payload (the Zod discriminated union output)
// into the fields pushed onto an alerts subdocument array. Only `price` carries a
// top-level targetPrice; every other type keeps its parameters in `config`.
// Shared by the watchlist + holdings create/replace routes so the two never drift.
export function buildAlertSubdoc(data: AlertCreateInput): AlertSubdocInput {
  const d = data as {
    type: ConditionType
    targetPrice?: number
    direction?: AlertDirection
    config?: AlertConfig
    note?: string
    status?: AlertStatus
  }
  return {
    type: d.type,
    targetPrice: typeof d.targetPrice === 'number' ? d.targetPrice : undefined,
    direction: d.direction,
    config: d.config ?? {},
    note: d.note ?? '',
    status: d.status ?? 'armed',
  }
}
