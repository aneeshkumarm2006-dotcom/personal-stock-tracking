import nodemailer, { type Transporter } from 'nodemailer'

import { formatCurrency, formatIstTime, formatPercent } from '@/lib/format'
import type { TriggeredAlert } from '@/lib/watchlist/evaluate'

export type MailResult =
  | { sent: true }
  | { sent: false; reason: 'not_configured' }
  | { sent: false; reason: 'error'; error: string }

let cached: Transporter | null = null

// Lazy, env-read-at-call-time transporter. Returns null when Gmail SMTP isn't
// configured so callers can no-op gracefully (the refresh cycle never throws).
function getTransporter(): Transporter | null {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) return null
  if (!cached) {
    cached = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
    })
  }
  return cached
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildAlertEmail(alert: TriggeredAlert): {
  subject: string
  html: string
} {
  const symbol = escapeHtml(alert.instrumentSymbol)
  const dirWord = alert.direction === 'below' ? '≤' : '≥'
  const subject = `🔔 ${alert.instrumentSymbol} hit ${formatCurrency(
    alert.ltp,
  )} (${dirWord} your ${formatCurrency(alert.targetPrice)} alert)`

  const dirSentence =
    alert.direction === 'below'
      ? `price dropped to/below ${formatCurrency(alert.targetPrice)}`
      : `price rose to/above ${formatCurrency(alert.targetPrice)}`

  const noteLine = alert.note
    ? `<div style="color:#666;margin-top:4px">Your note: "${escapeHtml(
        alert.note,
      )}"</div>`
    : ''

  const base = process.env.APP_BASE_URL ?? ''
  const path =
    alert.source === 'portfolio'
      ? `/portfolio/${encodeURIComponent(alert.instrumentToken)}`
      : '/watchlist'
  const link = base
    ? `<p style="margin-top:16px"><a href="${escapeHtml(
        base + path,
      )}">View in app</a></p>`
    : ''

  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px">
  <div style="font-weight:600;font-size:16px">${symbol} (${escapeHtml(
    alert.exchange,
  )})</div>
  <div style="color:#444;margin-top:4px">LTP ${formatCurrency(
    alert.ltp,
  )} &nbsp;•&nbsp; Day ${formatPercent(alert.dayChangePct)} &nbsp;•&nbsp; ${formatIstTime(
    alert.triggeredAt,
  )}</div>
  <div style="margin-top:8px">Alert: ${dirSentence}</div>
  ${noteLine}
  ${link}
</div>`

  return { subject, html }
}

// Send one email for a single triggered alert (per-hit delivery). Catches all
// errors and returns a result; never throws.
export async function sendWatchlistAlertEmail(
  alert: TriggeredAlert,
): Promise<MailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    console.log(
      JSON.stringify({
        event: 'watchlist.alert.email',
        status: 'skipped',
        reason: 'not_configured',
      }),
    )
    return { sent: false, reason: 'not_configured' }
  }

  const to = process.env.ALERT_EMAIL_TO || process.env.GMAIL_USER
  const { subject, html } = buildAlertEmail(alert)

  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to,
      subject,
      html,
    })
    return { sent: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.log(
      JSON.stringify({
        event: 'watchlist.alert.email',
        status: 'error',
        error,
      }),
    )
    return { sent: false, reason: 'error', error }
  }
}
