import { describe, it, expect } from 'vitest'

import {
  parseNseCompanyNames,
  resolveInstrumentName,
} from '@/lib/angelone/scripMaster'

const SAMPLE_CSV = `SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE
SBIN,State Bank of India,EQ,01-MAR-1995,1,1,INE062A01020,1
RELIANCE,Reliance Industries Limited,EQ,29-NOV-1995,10,1,INE002A01018,10
TCS,Tata Consultancy Services Limited,EQ,25-AUG-2004,1,1,INE467B01029,1
`

describe('parseNseCompanyNames', () => {
  it('maps each symbol to its full company name', () => {
    const map = parseNseCompanyNames(SAMPLE_CSV)
    expect(map.get('SBIN')).toBe('State Bank of India')
    expect(map.get('RELIANCE')).toBe('Reliance Industries Limited')
    expect(map.get('TCS')).toBe('Tata Consultancy Services Limited')
  })

  it('skips the header row', () => {
    const map = parseNseCompanyNames(SAMPLE_CSV)
    expect(map.has('SYMBOL')).toBe(false)
    expect(map.size).toBe(3)
  })

  it('tolerates blank lines and trailing whitespace', () => {
    const map = parseNseCompanyNames(
      'SYMBOL,NAME OF COMPANY\r\nINFY,Infosys Limited \r\n\r\n',
    )
    expect(map.get('INFY')).toBe('Infosys Limited')
    expect(map.size).toBe(1)
  })

  it('returns an empty map for empty input', () => {
    expect(parseNseCompanyNames('').size).toBe(0)
  })
})

describe('resolveInstrumentName', () => {
  const companyNames = parseNseCompanyNames(SAMPLE_CSV)

  it('uses the NSE company name, stripping the trading suffix', () => {
    expect(resolveInstrumentName('SBIN-EQ', 'SBIN', companyNames)).toBe(
      'State Bank of India',
    )
  })

  it('falls back to the AngelOne short name when no company name exists', () => {
    expect(resolveInstrumentName('UNKNOWN-EQ', 'UNKNOWN', companyNames)).toBe(
      'UNKNOWN',
    )
  })

  it('falls back to the symbol when neither name is available', () => {
    expect(resolveInstrumentName('FOO-EQ', undefined, companyNames)).toBe('FOO-EQ')
  })

  it('matches case-insensitively on the base symbol', () => {
    expect(resolveInstrumentName('reliance-eq', undefined, companyNames)).toBe(
      'Reliance Industries Limited',
    )
  })
})
