'use client'

import { useCallback, useEffect, useRef } from 'react'

type AudioCtor = typeof AudioContext

// A loud, attention-grabbing alarm built with the Web Audio API — no audio asset
// to ship, and programmatic so it can repeat/escalate. Browsers block audio
// until the user has interacted with the page, so we lazily create and resume an
// AudioContext on the first pointer/key event and keep it for the tab's lifetime.
// If the alarm is asked to play before any interaction, it silently no-ops (the
// visual banner + browser notification still fire); the sound works on the next
// hit after any click.
export function useAlarm() {
  const ctxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    const prime = () => {
      if (ctxRef.current) return
      try {
        const Ctor: AudioCtor | undefined =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: AudioCtor })
            .webkitAudioContext
        if (!Ctor) return
        const ctx = new Ctor()
        void ctx.resume()
        ctxRef.current = ctx
      } catch {
        // ignore — alarm degrades to the visual banner / browser notification
      }
    }
    window.addEventListener('pointerdown', prime)
    window.addEventListener('keydown', prime)
    return () => {
      window.removeEventListener('pointerdown', prime)
      window.removeEventListener('keydown', prime)
    }
  }, [])

  return useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    if (ctx.state === 'suspended') void ctx.resume()
    const start0 = ctx.currentTime
    // Three rising beeps — hard to ignore, over in ~1s.
    const freqs = [880, 988, 1047]
    freqs.forEach((freq, i) => {
      const start = start0 + i * 0.28
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.26)
    })
  }, [])
}
