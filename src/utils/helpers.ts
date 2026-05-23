/**
 * Normalizes asset names (case-insensitive) and maps aliases like "bitcoin" to "BTC"
 * @param asset Raw asset symbol or name
 * @returns Normalized asset symbol (e.g. "BTC")
 */
export function normalizeAsset(asset: string | null | undefined): string {
  if (!asset) return '';
  const clean = asset.trim().toLowerCase();
  
  const aliases: Record<string, string> = {
    'bitcoin': 'BTC',
    'ethereum': 'ETH',
    'tether': 'USDT',
    'solana': 'SOL',
    'polygon': 'MATIC',
    'chainlink': 'LINK',
    'btc': 'BTC',
    'eth': 'ETH',
    'usdt': 'USDT',
    'sol': 'SOL',
    'matic': 'MATIC',
    'link': 'LINK'
  };

  return aliases[clean] || clean.toUpperCase();
}

/**
 * Checks if two transaction types match directly or are mapped equivalents
 * (e.g. TRANSFER_OUT on User side matches TRANSFER_IN on Exchange side)
 */
export function typesMatch(type1: string | null | undefined, type2: string | null | undefined): boolean {
  if (!type1 || !type2) return false;
  const t1 = type1.trim().toUpperCase();
  const t2 = type2.trim().toUpperCase();

  if (t1 === t2) return true;

  // Mapped equivalents
  const isTransferEquivalent =
    (t1 === 'TRANSFER_OUT' && t2 === 'TRANSFER_IN') ||
    (t1 === 'TRANSFER_IN' && t2 === 'TRANSFER_OUT');

  return isTransferEquivalent;
}

/**
 * Determines if the percentage difference between two quantities is within the tolerance percentage
 * @param qty1 Reference quantity (usually User quantity)
 * @param qty2 Comparison quantity (usually Exchange quantity)
 * @param tolerancePct Tolerance in percent (e.g. 0.01 for 0.01%)
 */
export function isWithinQuantityTolerance(qty1: number, qty2: number, tolerancePct: number): boolean {
  if (qty1 === 0) return qty2 === 0;
  
  const diff = Math.abs(qty1 - qty2);
  const percentDiff = (diff / Math.abs(qty1)) * 100;
  
  return percentDiff <= tolerancePct;
}

/**
 * Determines if two timestamps are within a specific tolerance in seconds
 */
export function isWithinTimestampTolerance(
  date1: Date | string,
  date2: Date | string,
  toleranceSeconds: number
): boolean {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
    return false;
  }
  
  const diffSeconds = Math.abs(d1.getTime() - d2.getTime()) / 1000;
  return diffSeconds <= toleranceSeconds;
}

/**
 * Parses numeric string safely, returning null if invalid or empty
 */
export function parseNumeric(val: string | undefined | null): number | null {
  if (val === undefined || val === null || val.trim() === '') {
    return null;
  }
  const parsed = Number(val.replace(/,/g, ''));
  return isNaN(parsed) ? null : parsed;
}

/**
 * Checks if a transaction ID matches between user and exchange side based on matching numerical suffixes
 * e.g., USR-012 matches EXC-1012 because 12 === 1012 - 1000
 */
export function isIdMatch(userTxId: string | null | undefined, exchangeTxId: string | null | undefined): boolean {
  if (!userTxId || !exchangeTxId) return false;
  
  const userNum = parseInt(userTxId.replace(/[^\d]/g, ''), 10);
  const exchangeNum = parseInt(exchangeTxId.replace(/[^\d]/g, ''), 10);
  
  if (isNaN(userNum) || isNaN(exchangeNum)) return false;

  // Match if exchange ID number minus 1000 equals user ID number
  return userNum === (exchangeNum - 1000);
}
