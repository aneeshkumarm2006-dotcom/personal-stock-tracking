'use client'

import { useCallback, useRef, useSyncExternalStore } from 'react'

// Same-tab subscribers per key, notified on our own writes (the native
// 'storage' event only fires in *other* tabs).
const listeners = new Map<string, Set<() => void>>()

function emit(key: string) {
  listeners.get(key)?.forEach((cb) => cb())
}

// Persisted client state backed by localStorage, built on useSyncExternalStore
// so there's no setState-in-effect and no hydration mismatch: the server and the
// hydrating client render use `initial`, then React swaps in the stored value.
// Pass a STABLE `initial` (module constant) so the snapshots stay referentially
// stable.
export function useLocalStorage<T>(key: string, initial: T) {
  // Cache the parsed value keyed by the raw string, so getSnapshot returns a
  // stable reference until the stored string actually changes.
  const cache = useRef<{ raw: string | null; value: T }>({ raw: null, value: initial })

  const getSnapshot = useCallback((): T => {
    let raw: string | null = null
    try {
      raw = window.localStorage.getItem(key)
    } catch {
      raw = null
    }
    if (raw === cache.current.raw) return cache.current.value
    let value = initial
    if (raw != null) {
      try {
        value = JSON.parse(raw) as T
      } catch {
        value = initial
      }
    }
    cache.current = { raw, value }
    return value
  }, [key, initial])

  const getServerSnapshot = useCallback(() => initial, [initial])

  const subscribe = useCallback((cb: () => void) => {
    let set = listeners.get(key)
    if (!set) {
      set = new Set()
      listeners.set(key, set)
    }
    set.add(cb)
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) cb()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      set?.delete(cb)
      window.removeEventListener('storage', onStorage)
    }
  }, [key])

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = getSnapshot()
      const resolved =
        typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      const raw = JSON.stringify(resolved)
      try {
        window.localStorage.setItem(key, raw)
      } catch {
        // Storage full/blocked — still update the in-memory snapshot below.
      }
      cache.current = { raw, value: resolved }
      emit(key)
    },
    [key, getSnapshot],
  )

  return [value, set] as const
}
