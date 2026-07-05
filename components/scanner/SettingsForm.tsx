'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
import {
  scannerSettingsUpdateSchema,
  type ScannerSettingsUpdate,
} from '@/lib/scanner/schemas'
import type { ScannerSettings } from '@/lib/scanner/types'

const STRATEGY_KEYS = [
  'breakout',
  'pullback',
  'trend_st_adx',
  'rs_momentum',
  'rsi_mr',
] as const

const STRATEGY_LABELS: Record<(typeof STRATEGY_KEYS)[number], string> = {
  breakout: 'Breakout',
  pullback: 'Pullback',
  trend_st_adx: 'Trend (SuperTrend + ADX)',
  rs_momentum: 'RS momentum',
  rsi_mr: 'RSI mean-revert',
}

const COST_KEYS = [
  'brokeragePerOrder',
  'brokerageMaxPct',
  'sttPct',
  'exchangeTxnPct',
  'sebiPct',
  'stampDutyBuyPct',
  'gstPct',
  'dpChargeSell',
] as const

const COST_LABELS: Record<(typeof COST_KEYS)[number], string> = {
  brokeragePerOrder: 'Brokerage / order (₹)',
  brokerageMaxPct: 'Brokerage cap (%)',
  sttPct: 'STT (%)',
  exchangeTxnPct: 'Exchange txn (%)',
  sebiPct: 'SEBI (%)',
  stampDutyBuyPct: 'Stamp duty, buy (%)',
  gstPct: 'GST (%)',
  dpChargeSell: 'DP charge / sell (₹)',
}

type NumberFieldName =
  | 'capital'
  | 'riskPct'
  | 'gapHardCapPct'
  | 'minFillRR'
  | 'timeStopSessions'
  | 'slippageBps'

const NUMBER_FIELDS: {
  name: NumberFieldName
  label: string
  step: string
  min: number
}[] = [
  { name: 'capital', label: 'Capital (₹)', step: '1', min: 1 },
  { name: 'riskPct', label: 'Risk per trade (%)', step: '0.1', min: 0 },
  { name: 'gapHardCapPct', label: 'Gap hard cap (%)', step: '0.1', min: 0 },
  { name: 'minFillRR', label: 'Min fill R:R', step: '0.1', min: 0 },
  { name: 'timeStopSessions', label: 'Time stop (sessions)', step: '1', min: 1 },
  { name: 'slippageBps', label: 'Slippage (bps)', step: '1', min: 0 },
]

// A blank number input must serialize to undefined (omitted from the PATCH — the
// .partial() schema accepts that and updateSettings skips it), NOT NaN: zod's
// z.number() rejects NaN, which would abort handleSubmit and silently drop every
// other edit folded in at submit time.
const asOptionalNumber = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : Number(v)

export type SettingsFormProps = {
  initial: ScannerSettings
}

export function SettingsForm({ initial }: SettingsFormProps) {
  const form = useForm<ScannerSettingsUpdate>({
    resolver: zodResolver(scannerSettingsUpdateSchema),
    defaultValues: {
      capital: initial.capital ?? 500000,
      riskPct: initial.riskPct ?? 1,
      entryModel: initial.entryModel ?? 'open-with-rr-gap-check',
      gapHardCapPct: initial.gapHardCapPct ?? 5,
      minFillRR: initial.minFillRR ?? 1.5,
      timeStopSessions: initial.timeStopSessions ?? 10,
      tpMode: initial.tpMode ?? 'partial-trail',
      slippageBps: initial.slippageBps ?? 5,
    },
  })

  // Records + arrays are transform-heavy (sparse maps, string[] <-> comma text),
  // so they live in local state and are folded into the schema-shaped payload on
  // submit. The scalar/enum knobs above stay in react-hook-form + zodResolver.
  const initialOverrides = initial.riskPctOverrides
  const initialCosts = initial.costs
  const initialStrategies = initial.strategies

  const [overrides, setOverrides] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      STRATEGY_KEYS.map((k) => {
        const v = initialOverrides?.[k]
        return [k, v != null ? String(v) : '']
      }),
    ),
  )
  const [costs, setCosts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      COST_KEYS.map((k) => {
        const v = initialCosts?.[k]
        return [k, v != null ? String(v) : '']
      }),
    ),
  )
  const [strategies, setStrategies] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      STRATEGY_KEYS.map((k) => [k, initialStrategies?.[k] ?? true]),
    ),
  )
  const [watchlist, setWatchlist] = useState<string>(
    (initial.watchlist ?? []).join(', '),
  )
  const [blacklist, setBlacklist] = useState<string>(
    (initial.blacklist ?? []).join(', '),
  )

  const tpMode = form.watch('tpMode') ?? 'partial-trail'

  const onSubmit = async (data: ScannerSettingsUpdate) => {
    const parseList = (s: string) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x.length > 0)

    const numericMap = (m: Record<string, string>) => {
      const out: Record<string, number> = {}
      for (const [k, v] of Object.entries(m)) {
        if (v.trim() === '') continue
        const n = Number(v)
        if (Number.isFinite(n)) out[k] = n
      }
      return out
    }

    const payload: ScannerSettingsUpdate = {
      ...data,
      strategies,
      riskPctOverrides: numericMap(overrides),
      costs: numericMap(costs),
      watchlist: parseList(watchlist),
      blacklist: parseList(blacklist),
    }

    try {
      const res = await fetch('/api/scanner/settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let message = `Failed to save (${res.status})`
        try {
          const d = (await res.json()) as { error?: string }
          if (d?.error) message = d.error
        } catch {}
        toast.error(message)
        return
      }
      toast.success('Settings saved')
    } catch {
      toast.error('Network error — settings not saved')
    }
  }

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
      <section className="space-y-4 rounded-lg border p-4">
        <div>
          <h3 className="text-sm font-semibold">Capital &amp; risk</h3>
          <p className="text-muted-foreground text-xs">
            Sizing inputs used to compute planned quantities.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="capital">{NUMBER_FIELDS[0]!.label}</Label>
            <Input
              id="capital"
              type="number"
              step={NUMBER_FIELDS[0]!.step}
              min={NUMBER_FIELDS[0]!.min}
              inputMode="decimal"
              {...form.register('capital', { setValueAs: asOptionalNumber })}
            />
            {form.formState.errors.capital && (
              <p className="text-destructive text-xs">
                {form.formState.errors.capital.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="riskPct">{NUMBER_FIELDS[1]!.label}</Label>
            <Input
              id="riskPct"
              type="number"
              step={NUMBER_FIELDS[1]!.step}
              min={NUMBER_FIELDS[1]!.min}
              max={100}
              inputMode="decimal"
              {...form.register('riskPct', { setValueAs: asOptionalNumber })}
            />
            {form.formState.errors.riskPct && (
              <p className="text-destructive text-xs">
                {form.formState.errors.riskPct.message}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border p-4">
        <div>
          <h3 className="text-sm font-semibold">Per-strategy risk overrides</h3>
          <p className="text-muted-foreground text-xs">
            Override the risk % for a strategy. Leave blank to use the default
            risk per trade.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STRATEGY_KEYS.map((k) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={`ov-${k}`}>{STRATEGY_LABELS[k]}</Label>
              <Input
                id={`ov-${k}`}
                type="number"
                step="0.1"
                min={0}
                inputMode="decimal"
                placeholder="default"
                value={overrides[k] ?? ''}
                onChange={(e) =>
                  setOverrides((prev) => ({ ...prev, [k]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border p-4">
        <div>
          <h3 className="text-sm font-semibold">Entry &amp; fills</h3>
          <p className="text-muted-foreground text-xs">
            How signals are turned into fills, and when they time out.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <Label htmlFor="entryModel">Entry model</Label>
            <Input id="entryModel" type="text" {...form.register('entryModel')} />
            {form.formState.errors.entryModel && (
              <p className="text-destructive text-xs">
                {form.formState.errors.entryModel.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpMode">Take-profit mode</Label>
            <Select
              value={tpMode}
              onValueChange={(v) =>
                form.setValue(
                  'tpMode',
                  (v ?? 'partial-trail') as 'partial-trail' | 'tp1-full',
                  { shouldValidate: true },
                )
              }
            >
              <SelectTrigger id="tpMode" aria-label="Take-profit mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="partial-trail">Partial + trail</SelectItem>
                <SelectItem value="tp1-full">TP1 full exit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {NUMBER_FIELDS.slice(2).map((f) => (
            <div key={f.name} className="space-y-1.5">
              <Label htmlFor={f.name}>{f.label}</Label>
              <Input
                id={f.name}
                type="number"
                step={f.step}
                min={f.min}
                inputMode="decimal"
                {...form.register(f.name, { setValueAs: asOptionalNumber })}
              />
              {form.formState.errors[f.name] && (
                <p className="text-destructive text-xs">
                  {form.formState.errors[f.name]?.message}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border p-4">
        <div>
          <h3 className="text-sm font-semibold">Cost model</h3>
          <p className="text-muted-foreground text-xs">
            Charges applied to each simulated fill and exit.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COST_KEYS.map((k) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={`cost-${k}`}>{COST_LABELS[k]}</Label>
              <Input
                id={`cost-${k}`}
                type="number"
                step="0.0001"
                min={0}
                inputMode="decimal"
                value={costs[k] ?? ''}
                onChange={(e) =>
                  setCosts((prev) => ({ ...prev, [k]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border p-4">
        <div>
          <h3 className="text-sm font-semibold">Enabled strategies</h3>
          <p className="text-muted-foreground text-xs">
            Disabled strategies stop producing new signals from the next run.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {STRATEGY_KEYS.map((k) => (
            <label
              key={k}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={strategies[k] ?? false}
                onChange={(e) =>
                  setStrategies((prev) => ({ ...prev, [k]: e.target.checked }))
                }
              />
              <span>{STRATEGY_LABELS[k]}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border p-4">
        <div>
          <h3 className="text-sm font-semibold">Watchlist &amp; blacklist</h3>
          <p className="text-muted-foreground text-xs">
            Comma-separated NSE symbols.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="watchlist">Watchlist</Label>
            <Input
              id="watchlist"
              type="text"
              placeholder="RELIANCE, TCS, INFY"
              value={watchlist}
              onChange={(e) => setWatchlist(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Symbols to always keep in the scan universe.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="blacklist">Blacklist</Label>
            <Input
              id="blacklist"
              type="text"
              placeholder="YESBANK, PNB"
              value={blacklist}
              onChange={(e) => setBlacklist(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Symbols to exclude from every scan.
            </p>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </form>
  )
}
