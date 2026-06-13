const SECTOR_MAP: Record<string, string> = {
  RELIANCE: 'Oil & Gas',
  ONGC: 'Oil & Gas',
  IOC: 'Oil & Gas',
  BPCL: 'Oil & Gas',
  HPCL: 'Oil & Gas',
  GAIL: 'Oil & Gas',

  TCS: 'IT Services',
  INFY: 'IT Services',
  WIPRO: 'IT Services',
  HCLTECH: 'IT Services',
  TECHM: 'IT Services',
  LTIM: 'IT Services',
  MPHASIS: 'IT Services',
  PERSISTENT: 'IT Services',

  HDFCBANK: 'Banking',
  ICICIBANK: 'Banking',
  SBIN: 'Banking',
  AXISBANK: 'Banking',
  KOTAKBANK: 'Banking',
  INDUSINDBK: 'Banking',
  PNB: 'Banking',
  BANKBARODA: 'Banking',
  IDFCFIRSTB: 'Banking',
  FEDERALBNK: 'Banking',

  BAJFINANCE: 'Financial Services',
  BAJAJFINSV: 'Financial Services',
  HDFCLIFE: 'Insurance',
  SBILIFE: 'Insurance',
  ICICIPRULI: 'Insurance',
  ICICIGI: 'Insurance',
  LIC: 'Insurance',
  CHOLAFIN: 'Financial Services',
  M_MFIN: 'Financial Services',
  MUTHOOTFIN: 'Financial Services',
  PFC: 'Financial Services',
  RECLTD: 'Financial Services',

  HINDUNILVR: 'FMCG',
  ITC: 'FMCG',
  NESTLEIND: 'FMCG',
  DABUR: 'FMCG',
  BRITANNIA: 'FMCG',
  MARICO: 'FMCG',
  GODREJCP: 'FMCG',
  COLPAL: 'FMCG',
  TATACONSUM: 'FMCG',
  UBL: 'FMCG',

  MARUTI: 'Automobile',
  TATAMOTORS: 'Automobile',
  M_M: 'Automobile',
  EICHERMOT: 'Automobile',
  BAJAJ_AUTO: 'Automobile',
  HEROMOTOCO: 'Automobile',
  TVSMOTOR: 'Automobile',
  ASHOKLEY: 'Automobile',
  MOTHERSON: 'Auto Ancillary',
  BOSCHLTD: 'Auto Ancillary',

  SUNPHARMA: 'Pharma',
  DRREDDY: 'Pharma',
  CIPLA: 'Pharma',
  DIVISLAB: 'Pharma',
  AUROPHARMA: 'Pharma',
  LUPIN: 'Pharma',
  TORNTPHARM: 'Pharma',
  APOLLOHOSP: 'Healthcare',
  MAXHEALTH: 'Healthcare',
  FORTIS: 'Healthcare',

  TATASTEEL: 'Metals',
  JSWSTEEL: 'Metals',
  HINDALCO: 'Metals',
  VEDL: 'Metals',
  SAIL: 'Metals',
  NMDC: 'Metals',
  JINDALSTEL: 'Metals',
  COALINDIA: 'Mining',

  LT: 'Construction',
  ULTRACEMCO: 'Cement',
  SHREECEM: 'Cement',
  AMBUJACEM: 'Cement',
  ACC: 'Cement',
  GRASIM: 'Cement',
  DALBHARAT: 'Cement',

  NTPC: 'Power',
  POWERGRID: 'Power',
  TATAPOWER: 'Power',
  ADANIPOWER: 'Power',
  ADANIGREEN: 'Power',
  NHPC: 'Power',
  SJVN: 'Power',

  BHARTIARTL: 'Telecom',
  IDEA: 'Telecom',

  ASIANPAINT: 'Paints',
  BERGEPAINT: 'Paints',
  PIDILITIND: 'Chemicals',
  UPL: 'Chemicals',
  SRF: 'Chemicals',
  DEEPAKNTR: 'Chemicals',

  DMART: 'Retail',
  TRENT: 'Retail',
  TITAN: 'Consumer Durables',
  HAVELLS: 'Consumer Durables',
  VOLTAS: 'Consumer Durables',
  WHIRLPOOL: 'Consumer Durables',
  CROMPTON: 'Consumer Durables',

  ZOMATO: 'Internet',
  PAYTM: 'Internet',
  NYKAA: 'Internet',
  POLICYBZR: 'Internet',

  ADANIENT: 'Conglomerate',
  ADANIPORTS: 'Logistics',
  CONCOR: 'Logistics',

  DLF: 'Real Estate',
  GODREJPROP: 'Real Estate',
  OBEROIRLTY: 'Real Estate',
  PRESTIGE: 'Real Estate',

  IRCTC: 'Travel',
  INDIGO: 'Aviation',
  SPICEJET: 'Aviation',
}

function normalize(symbol: string): string {
  return symbol
    .replace(/-(EQ|BE|BZ|SM|ST)$/i, '')
    .replace(/&/g, '_')
    .toUpperCase()
    .trim()
}

export function sectorForSymbol(symbol: string | undefined | null): string {
  if (!symbol) return 'Other'
  return SECTOR_MAP[normalize(symbol)] ?? 'Other'
}
