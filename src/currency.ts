// TZS equivalent per 1 unit of each currency — approximate mid-market rates (2025)
export const EXCHANGE_RATES: Record<string, number> = {
  TZS: 1,
  TSh: 1,
  USD: 2580,
  EUR: 2800,
  GBP: 3260,
  CNY: 355,
  AED: 702,
  SAR: 688,
  INR: 31,
  KES: 20,
  UGX: 0.70,
  RWF: 1.85,
  ZAR: 140,
  CHF: 2900,
  JPY: 17,
  MYR: 585,
  SGD: 1940,
};

export function toTZS(amount: number, currency: string): number {
  const key = currency?.trim().toUpperCase();
  const rate = EXCHANGE_RATES[key] ?? EXCHANGE_RATES[currency?.trim()] ?? 1;
  return Math.round(amount * rate);
}

export function isForeignCurrency(currency: string): boolean {
  const c = currency?.trim();
  return c !== 'TSh' && c !== 'TZS';
}
