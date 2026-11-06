export interface LiveMarketDepth {
  count: number;
  lowestFixed: number | null;
  highestFixed: number | null;
  liveMedian20: number | null;
  liveAvg20: number | null;
  isCrashDetected: boolean;
  crashDiscountPct: number;
  activePrices: number[];
}

export function computeLiveMarketDepth(
  listings: Array<any> | null | undefined,
  referenceMedian: number | null = null
): LiveMarketDepth {
  const activePrices = (Array.isArray(listings) ? listings : [])
    .filter((l) => l && (l.status === 'active' || l.status === undefined) && (!l.endsAt || Date.parse(l.endsAt) > Date.now()))
    .map((l) => (typeof l === 'number' ? l : Number(l.price)))
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);

  if (activePrices.length === 0) {
    return {
      count: 0,
      lowestFixed: null,
      highestFixed: null,
      liveMedian20: null,
      liveAvg20: null,
      isCrashDetected: false,
      crashDiscountPct: 0,
      activePrices: []
    };
  }

  const count = activePrices.length;
  const lowestFixed = activePrices[0];
  const highestFixed = activePrices[count - 1];

  const mid = Math.floor(count / 2);
  const liveMedian20 =
    count % 2 !== 0
      ? activePrices[mid]
      : Math.round((activePrices[mid - 1] + activePrices[mid]) / 2);

  const sum = activePrices.reduce((acc, p) => acc + p, 0);
  const liveAvg20 = Math.round((sum / count) * 10) / 10;

  const isCrashDetected = Boolean(
    referenceMedian &&
    referenceMedian > 0 &&
    count >= 2 &&
    liveMedian20 <= referenceMedian * 0.70
  );

  const crashDiscountPct =
    referenceMedian && referenceMedian > 0
      ? Math.max(0, Math.round(((referenceMedian - liveMedian20) / referenceMedian) * 100))
      : 0;

  return {
    count,
    lowestFixed,
    highestFixed,
    liveMedian20,
    liveAvg20,
    isCrashDetected,
    crashDiscountPct,
    activePrices
  };
}

export interface SaleProbability {
  p12h: number;
  p24h: number;
  p48h: number;
  label: 'Élevée' | 'Moyenne' | 'Faible';
}

export function estimateSaleProbability(
  sales7d: number | null,
  price: number,
  median: number | null,
  lowestCompetition: number | null
): SaleProbability {
  const vol = Number.isFinite(sales7d) && sales7d! >= 0 ? sales7d! : 0;
  const dailyRate = vol / 7;
  if (dailyRate <= 0) {
    return { p12h: 5, p24h: 10, p48h: 18, label: 'Faible' };
  }
  let priceFactor = 1.0;
  if (Number.isFinite(lowestCompetition) && lowestCompetition! > 0) {
    if (price < lowestCompetition!) priceFactor = 1.35;
    else if (price === lowestCompetition!) priceFactor = 1.1;
    else priceFactor = Math.max(0.25, lowestCompetition! / price);
  } else if (Number.isFinite(median) && median! > 0) {
    priceFactor = Math.max(0.25, Math.min(1.4, median! / price));
  }
  const effectiveDaily = dailyRate * priceFactor;
  const prob = (days: number) =>
    Math.round(Math.min(99, Math.max(5, (1 - Math.exp(-effectiveDaily * days)) * 100)));
  const p12h = prob(0.5);
  const p24h = prob(1.0);
  const p48h = prob(2.0);
  const label = p24h >= 75 ? 'Élevée' : p24h >= 40 ? 'Moyenne' : 'Faible';
  return { p12h, p24h, p48h, label };
}
