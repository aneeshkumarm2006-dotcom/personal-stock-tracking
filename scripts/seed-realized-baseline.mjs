// One-off seed: set the historical realized P&L baseline on the CashAccount
// singleton. This is the realized profit/loss from trades that predate the
// current transaction ledger (no SELL rows exist for them), so it is stored as
// a constant rather than derived.
//
// Usage (from the `site/` directory):
//   node scripts/seed-realized-baseline.mjs           # uses default 5442
//   node scripts/seed-realized-baseline.mjs 5442.67   # custom amount
//
// Reads MONGODB_URI from the environment, falling back to .env.local.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import mongoose from 'mongoose'

const DEFAULT_BASELINE = 5442

function loadEnvLocal() {
  if (process.env.MONGODB_URI) return
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const envPath = join(here, '..', '.env.local')
    const raw = readFileSync(envPath, 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
  } catch {
    // .env.local missing — rely on a pre-set MONGODB_URI instead.
  }
}

async function main() {
  loadEnvLocal()

  const arg = process.argv[2]
  const baseline = arg !== undefined ? Number(arg) : DEFAULT_BASELINE
  if (!Number.isFinite(baseline)) {
    throw new Error(`Invalid baseline amount: ${arg}`)
  }

  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('MONGODB_URI is not set (env or site/.env.local).')
  }

  await mongoose.connect(uri, { bufferCommands: false })

  // Minimal inline schema with strict:false so we only touch this one field and
  // leave fundsAdded / timestamps untouched.
  const CashAccount =
    mongoose.models.CashAccount ||
    mongoose.model(
      'CashAccount',
      new mongoose.Schema({}, { strict: false, collection: 'cashaccounts' }),
    )

  const res = await CashAccount.findOneAndUpdate(
    { key: 'default' },
    { $set: { realizedPnLBaseline: baseline }, $setOnInsert: { fundsAdded: 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean()

  console.log(
    `✓ realizedPnLBaseline set to ₹${baseline.toLocaleString('en-IN')}`,
    `(fundsAdded: ₹${(res?.fundsAdded ?? 0).toLocaleString('en-IN')})`,
  )

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('Seed failed:', err.message)
  process.exitCode = 1
})
