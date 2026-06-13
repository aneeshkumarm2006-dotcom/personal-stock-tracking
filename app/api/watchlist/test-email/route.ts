import { NextResponse } from 'next/server'

import { sendWatchlistAlertEmail } from '@/lib/email/mailer'
import type { TriggeredAlert } from '@/lib/watchlist/evaluate'

export const dynamic = 'force-dynamic'

// Fire a sample alert email to verify SMTP is configured before trusting it
// with real alerts. Never throws — returns the MailResult.
export async function POST() {
  const sample: TriggeredAlert = {
    instrumentToken: '0',
    instrumentSymbol: 'TEST-EQ',
    exchange: 'NSE',
    alertId: 'sample',
    direction: 'below',
    targetPrice: 1205,
    ltp: 1200,
    dayChangePct: -1.8,
    note: 'This is a test alert email from your watchlist.',
    triggeredAt: new Date(),
  }

  const result = await sendWatchlistAlertEmail(sample)
  return NextResponse.json(result)
}
