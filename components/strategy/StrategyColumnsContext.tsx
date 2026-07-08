'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { useLocalStorage } from '@/lib/hooks/useLocalStorage'
import {
  DEFAULT_HIDDEN,
  DEFAULT_ORDER,
  ENTRY_COLUMNS,
  mergeOrder,
} from './entryColumns'
import { ColumnSettingsDialog } from './ColumnSettingsDialog'

const STORAGE_KEY = 'stocktracker:strategy:columns'

type Persisted = { order: string[]; hidden: string[] }

// Stable default reference for useLocalStorage's snapshots.
const DEFAULT_PREF: Persisted = { order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN }

type ColumnsContextValue = {
  order: string[]
  hidden: Set<string>
  toggle: (id: string) => void
  reorder: (activeId: string, overId: string) => void
  reset: () => void
  openSettings: () => void
}

// Pinned ids can never be toggled off or reordered.
const PINNED = new Set(ENTRY_COLUMNS.filter((c) => c.pinned).map((c) => c.id))

// Safe default so an EntriesTable rendered outside the provider still works.
const DEFAULT_VALUE: ColumnsContextValue = {
  order: mergeOrder(DEFAULT_ORDER),
  hidden: new Set(DEFAULT_HIDDEN),
  toggle: () => {},
  reorder: () => {},
  reset: () => {},
  openSettings: () => {},
}

const StrategyColumnsContext = createContext<ColumnsContextValue>(DEFAULT_VALUE)

export function useStrategyColumns(): ColumnsContextValue {
  return useContext(StrategyColumnsContext)
}

export function StrategyColumnsProvider({ children }: { children: ReactNode }) {
  const [pref, setPref] = useLocalStorage<Persisted>(STORAGE_KEY, DEFAULT_PREF)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const order = useMemo(() => mergeOrder(pref.order ?? []), [pref.order])
  const hidden = useMemo(() => new Set(pref.hidden ?? []), [pref.hidden])

  const toggle = useCallback(
    (id: string) => {
      if (PINNED.has(id)) return
      setPref((p) => {
        const h = new Set(p.hidden ?? [])
        if (h.has(id)) h.delete(id)
        else h.add(id)
        return { ...p, hidden: [...h] }
      })
    },
    [setPref],
  )

  const reorder = useCallback(
    (activeId: string, overId: string) => {
      if (activeId === overId || PINNED.has(activeId) || PINNED.has(overId)) return
      setPref((p) => {
        const cur = mergeOrder(p.order ?? [])
        const from = cur.indexOf(activeId)
        const to = cur.indexOf(overId)
        if (from < 0 || to < 0) return p
        const next = [...cur]
        const [moved] = next.splice(from, 1)
        if (moved === undefined) return p
        next.splice(to, 0, moved)
        return { ...p, order: next }
      })
    },
    [setPref],
  )

  const reset = useCallback(
    () => setPref({ order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN }),
    [setPref],
  )

  const value = useMemo<ColumnsContextValue>(
    () => ({
      order,
      hidden,
      toggle,
      reorder,
      reset,
      openSettings: () => setSettingsOpen(true),
    }),
    [order, hidden, toggle, reorder, reset],
  )

  return (
    <StrategyColumnsContext.Provider value={value}>
      {children}
      <ColumnSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </StrategyColumnsContext.Provider>
  )
}
