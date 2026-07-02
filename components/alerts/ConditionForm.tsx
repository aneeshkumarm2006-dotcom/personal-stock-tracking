'use client'

import { useState } from 'react'
import { BellIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ADVANCED_TYPES, type AlertRequestBody } from '@/lib/alerts/conditionMeta'
import type { AlertDirection, ConditionType } from '@/lib/alerts/types'
import type { WatchlistAlertView } from '@/lib/watchlist/types'

type Mode = 'normal' | 'advanced'

export type ConditionFormProps = {
  // When present, the form is editing an existing alert (prefilled) and does a
  // full-condition replace on submit; otherwise it's the add form.
  initial?: WatchlistAlertView
  submitLabel: string
  onSubmit: (body: AlertRequestBody) => Promise<boolean | void> | boolean | void
  onCancel?: () => void
  busy: boolean
}

const RSI_HINT: Record<'overbought' | 'oversold', number> = {
  overbought: 70,
  oversold: 30,
}

export function ConditionForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  busy,
}: ConditionFormProps) {
  const initType: ConditionType = initial?.type ?? 'price'
  const cfg = initial?.config ?? {}

  const [mode, setMode] = useState<Mode>(
    initType === 'price' ? 'normal' : 'advanced',
  )
  const [advType, setAdvType] = useState<ConditionType>(
    initType === 'price' ? 'pct_change' : initType,
  )
  const [direction, setDirection] = useState<AlertDirection>(
    initial?.direction ?? 'below',
  )
  const [targetPrice, setTargetPrice] = useState(
    initial?.targetPrice != null ? String(initial.targetPrice) : '',
  )
  const [thresholdPct, setThresholdPct] = useState(
    cfg.thresholdPct != null ? String(cfg.thresholdPct) : '5',
  )
  const [multiple, setMultiple] = useState(
    cfg.multiple != null ? String(cfg.multiple) : '2',
  )
  const [edge, setEdge] = useState<'high' | 'low'>(cfg.edge ?? 'high')
  const [marginPct, setMarginPct] = useState(
    cfg.marginPct != null ? String(cfg.marginPct) : '0',
  )
  const [band, setBand] = useState<'upper' | 'lower' | 'either'>(
    cfg.band ?? 'either',
  )
  const [period, setPeriod] = useState(
    cfg.period != null ? String(cfg.period) : '20',
  )
  const [rsiBand, setRsiBand] = useState<'overbought' | 'oversold'>(
    cfg.rsiBand ?? 'overbought',
  )
  const [threshold, setThreshold] = useState(
    cfg.threshold != null ? String(cfg.threshold) : '',
  )
  const [macdDirection, setMacdDirection] = useState<'bullish' | 'bearish'>(
    cfg.macdDirection ?? 'bullish',
  )
  const [timeframe, setTimeframe] = useState<'1D' | '1W' | '1M'>(
    cfg.timeframe ?? '1D',
  )
  const [to, setTo] = useState<'buy' | 'sell' | 'neutral' | 'any'>(
    cfg.to ?? 'any',
  )
  const [note, setNote] = useState(initial?.note ?? '')

  function pickAdvType(t: ConditionType) {
    setAdvType(t)
    // Sensible default cross direction per type.
    if (t === 'pct_change') setDirection('above')
    else if (t === 'sma_cross' || t === 'ema_cross') setDirection('below')
  }

  function buildBody(): AlertRequestBody | null {
    const trimmed = note.trim()
    const noteField = trimmed ? { note: trimmed } : {}

    if (mode === 'normal') {
      const p = Number(targetPrice)
      if (!Number.isFinite(p) || p <= 0) {
        toast.error('Enter a valid target price')
        return null
      }
      return { type: 'price', targetPrice: p, direction, ...noteField }
    }

    switch (advType) {
      case 'pct_change': {
        const t = Number(thresholdPct)
        if (!Number.isFinite(t) || t <= 0) {
          toast.error('Enter a valid % threshold')
          return null
        }
        return {
          type: 'pct_change',
          direction,
          config: { thresholdPct: t },
          ...noteField,
        }
      }
      case 'volume': {
        const m = Number(multiple)
        if (!Number.isFinite(m) || m <= 0) {
          toast.error('Enter a valid volume multiple')
          return null
        }
        return {
          type: 'volume',
          config: { mode: 'spike', multiple: m },
          ...noteField,
        }
      }
      case 'week52':
        return {
          type: 'week52',
          config: { edge, marginPct: Number(marginPct) || 0 },
          ...noteField,
        }
      case 'circuit':
        return { type: 'circuit', config: { band }, ...noteField }
      case 'sma_cross':
      case 'ema_cross': {
        const p = Number(period)
        if (!Number.isInteger(p) || p <= 0) {
          toast.error('Enter a whole-number period')
          return null
        }
        return { type: advType, direction, config: { period: p }, ...noteField }
      }
      case 'rsi': {
        const th = threshold.trim() === '' ? undefined : Number(threshold)
        if (th !== undefined && (!Number.isFinite(th) || th < 1 || th > 99)) {
          toast.error('RSI threshold must be 1–99')
          return null
        }
        return {
          type: 'rsi',
          config: {
            rsiBand,
            period: 14,
            ...(th !== undefined ? { threshold: th } : {}),
          },
          ...noteField,
        }
      }
      case 'macd_cross':
        return { type: 'macd_cross', config: { macdDirection }, ...noteField }
      case 'rating_flip':
        return {
          type: 'rating_flip',
          config: { timeframe, to },
          ...noteField,
        }
      default:
        return null
    }
  }

  async function handleSubmit() {
    const body = buildBody()
    if (!body) return
    const ok = await onSubmit(body)
    if (ok !== false && !initial) {
      // Reset the volatile fields after a successful add.
      setTargetPrice('')
      setNote('')
    }
  }

  return (
    <div className="space-y-3">
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList className="w-full">
          <TabsTrigger value="normal">Normal</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="normal" className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>When price is</Label>
              <Select
                value={direction}
                onValueChange={(v) => setDirection(v as AlertDirection)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="below">at or below</SelectItem>
                  <SelectItem value="above">at or above</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Target price (₹)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="advanced" className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label>Condition</Label>
            <Select
              value={advType}
              onValueChange={(v) => pickAdvType(v as ConditionType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADVANCED_TYPES.map((c) => (
                  <SelectItem key={c.type} value={c.type}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {ADVANCED_TYPES.find((c) => c.type === advType)?.hint}
            </p>
          </div>

          {advType === 'pct_change' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Direction</Label>
                <Select
                  value={direction}
                  onValueChange={(v) => setDirection(v as AlertDirection)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="above">up by ≥</SelectItem>
                    <SelectItem value="below">down by ≥</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Threshold (%)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.1"
                  inputMode="decimal"
                  value={thresholdPct}
                  onChange={(e) => setThresholdPct(e.target.value)}
                />
              </div>
            </div>
          )}

          {advType === 'volume' && (
            <div className="space-y-1.5">
              <Label>Multiple of 20-day average volume</Label>
              <Input
                type="number"
                min={0}
                step="0.1"
                inputMode="decimal"
                value={multiple}
                onChange={(e) => setMultiple(e.target.value)}
              />
            </div>
          )}

          {advType === 'week52' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Breaks the</Label>
                <Select
                  value={edge}
                  onValueChange={(v) => setEdge(v as 'high' | 'low')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">52-week high</SelectItem>
                    <SelectItem value="low">52-week low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Margin (%)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.1"
                  inputMode="decimal"
                  value={marginPct}
                  onChange={(e) => setMarginPct(e.target.value)}
                />
              </div>
            </div>
          )}

          {advType === 'circuit' && (
            <div className="space-y-1.5">
              <Label>Circuit band</Label>
              <Select
                value={band}
                onValueChange={(v) =>
                  setBand(v as 'upper' | 'lower' | 'either')
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="either">upper or lower</SelectItem>
                  <SelectItem value="upper">upper only</SelectItem>
                  <SelectItem value="lower">lower only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {(advType === 'sma_cross' || advType === 'ema_cross') && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Price</Label>
                <Select
                  value={direction}
                  onValueChange={(v) => setDirection(v as AlertDirection)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="below">crosses below</SelectItem>
                    <SelectItem value="above">crosses above</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Period</Label>
                <Input
                  type="number"
                  min={1}
                  step="1"
                  inputMode="numeric"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                />
              </div>
            </div>
          )}

          {advType === 'rsi' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Band</Label>
                <Select
                  value={rsiBand}
                  onValueChange={(v) =>
                    setRsiBand(v as 'overbought' | 'oversold')
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="overbought">overbought</SelectItem>
                    <SelectItem value="oversold">oversold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Threshold</Label>
                <Input
                  type="number"
                  min={1}
                  max={99}
                  step="1"
                  inputMode="numeric"
                  placeholder={String(RSI_HINT[rsiBand])}
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                />
              </div>
            </div>
          )}

          {advType === 'macd_cross' && (
            <div className="space-y-1.5">
              <Label>Cross</Label>
              <Select
                value={macdDirection}
                onValueChange={(v) =>
                  setMacdDirection(v as 'bullish' | 'bearish')
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bullish">bullish (up)</SelectItem>
                  <SelectItem value="bearish">bearish (down)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {advType === 'rating_flip' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Timeframe</Label>
                <Select
                  value={timeframe}
                  onValueChange={(v) => setTimeframe(v as '1D' | '1W' | '1M')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1D">Daily</SelectItem>
                    <SelectItem value="1W">Weekly</SelectItem>
                    <SelectItem value="1M">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Flips to</Label>
                <Select
                  value={to}
                  onValueChange={(v) =>
                    setTo(v as 'buy' | 'sell' | 'neutral' | 'any')
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">any change</SelectItem>
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="space-y-1.5">
        <Label>Note (optional)</Label>
        <Input
          type="text"
          placeholder='e.g. "buy zone"'
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
        ) : null}
        <Button type="button" size="sm" onClick={handleSubmit} disabled={busy}>
          <BellIcon className="size-3.5" aria-hidden="true" />
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
