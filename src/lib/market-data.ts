export type MarketId = "ZEC/USDC" | "ZEC/USDT";
export type ChartRange = "1H" | "4H" | "1D";

export type Market = {
  id: MarketId;
  settlementPair: "pZEC-USDC" | "pZEC-USDT0";
  quote: "USDC" | "USDT0";
  lastTicks: bigint;
  changeBps: number;
  highTicks: bigint;
  lowTicks: bigint;
  volume: string;
};

export type BookLevel = {
  priceTicks: bigint;
  sizeAtoms: bigint;
  totalAtoms: bigint;
};

export type RecentTrade = {
  priceTicks: bigint;
  sizeAtoms: bigint;
  side: "buy" | "sell";
  time: string;
};

function pzecAtomsFromHundredths(hundredths: bigint): bigint {
  return hundredths * 1_000000n;
}

function accumulate(
  levels: ReadonlyArray<{ priceTicks: bigint; sizeAtoms: bigint }>,
  accumulateFrom: "start" | "end",
): BookLevel[] {
  const next = levels.map((level) => ({ ...level, totalAtoms: 0n }));
  const indexes = [...next.keys()];
  if (accumulateFrom === "end") indexes.reverse();

  let total = 0n;
  for (const index of indexes) {
    total += next[index].sizeAtoms;
    next[index].totalAtoms = total;
  }
  return next;
}

export const markets: Record<MarketId, Market> = {
  "ZEC/USDC": {
    id: "ZEC/USDC",
    settlementPair: "pZEC-USDC",
    quote: "USDC",
    lastTicks: 5284n,
    changeBps: 585,
    highTicks: 5284n,
    lowTicks: 4992n,
    volume: "$1.84M",
  },
  "ZEC/USDT": {
    id: "ZEC/USDT",
    settlementPair: "pZEC-USDT0",
    quote: "USDT0",
    lastTicks: 5279n,
    changeBps: 583,
    highTicks: 5279n,
    lowTicks: 4988n,
    volume: "$1.12M",
  },
};

export const chartSeries: Record<MarketId, Record<ChartRange, readonly number[]>> = {
  "ZEC/USDC": {
    "1H": [5182, 5168, 5193, 5206, 5197, 5218, 5211, 5246, 5238, 5261, 5249, 5284],
    "4H": [5072, 5096, 5081, 5114, 5147, 5135, 5188, 5222, 5205, 5241, 5266, 5284],
    "1D": [4992, 5021, 5004, 5068, 5044, 5116, 5102, 5174, 5208, 5191, 5242, 5284],
  },
  "ZEC/USDT": {
    "1H": [5177, 5164, 5189, 5201, 5193, 5214, 5208, 5241, 5233, 5256, 5244, 5279],
    "4H": [5068, 5091, 5076, 5109, 5142, 5130, 5183, 5217, 5200, 5236, 5261, 5279],
    "1D": [4988, 5017, 5000, 5063, 5040, 5111, 5098, 5169, 5203, 5186, 5237, 5279],
  },
};

export const books: Record<MarketId, { asks: BookLevel[]; bids: BookLevel[] }> = {
  "ZEC/USDC": {
    asks: accumulate(
      [
        { priceTicks: 5318n, sizeAtoms: pzecAtomsFromHundredths(1564n) },
        { priceTicks: 5312n, sizeAtoms: pzecAtomsFromHundredths(1981n) },
        { priceTicks: 5308n, sizeAtoms: pzecAtomsFromHundredths(2398n) },
        { priceTicks: 5302n, sizeAtoms: pzecAtomsFromHundredths(2815n) },
        { priceTicks: 5297n, sizeAtoms: pzecAtomsFromHundredths(1132n) },
        { priceTicks: 5291n, sizeAtoms: pzecAtomsFromHundredths(1549n) },
      ],
      "end",
    ),
    bids: accumulate(
      [
        { priceTicks: 5278n, sizeAtoms: pzecAtomsFromHundredths(2815n) },
        { priceTicks: 5273n, sizeAtoms: pzecAtomsFromHundredths(1132n) },
        { priceTicks: 5269n, sizeAtoms: pzecAtomsFromHundredths(1549n) },
        { priceTicks: 5263n, sizeAtoms: pzecAtomsFromHundredths(1966n) },
        { priceTicks: 5257n, sizeAtoms: pzecAtomsFromHundredths(2383n) },
        { priceTicks: 5251n, sizeAtoms: pzecAtomsFromHundredths(2800n) },
      ],
      "start",
    ),
  },
  "ZEC/USDT": {
    asks: accumulate(
      [
        { priceTicks: 5313n, sizeAtoms: pzecAtomsFromHundredths(2398n) },
        { priceTicks: 5307n, sizeAtoms: pzecAtomsFromHundredths(2815n) },
        { priceTicks: 5303n, sizeAtoms: pzecAtomsFromHundredths(1132n) },
        { priceTicks: 5297n, sizeAtoms: pzecAtomsFromHundredths(1549n) },
        { priceTicks: 5292n, sizeAtoms: pzecAtomsFromHundredths(1966n) },
        { priceTicks: 5286n, sizeAtoms: pzecAtomsFromHundredths(2383n) },
      ],
      "end",
    ),
    bids: accumulate(
      [
        { priceTicks: 5273n, sizeAtoms: pzecAtomsFromHundredths(1549n) },
        { priceTicks: 5268n, sizeAtoms: pzecAtomsFromHundredths(1966n) },
        { priceTicks: 5264n, sizeAtoms: pzecAtomsFromHundredths(2383n) },
        { priceTicks: 5258n, sizeAtoms: pzecAtomsFromHundredths(2800n) },
        { priceTicks: 5252n, sizeAtoms: pzecAtomsFromHundredths(1117n) },
        { priceTicks: 5246n, sizeAtoms: pzecAtomsFromHundredths(1534n) },
      ],
      "start",
    ),
  },
};

export const recentTrades: Record<MarketId, readonly RecentTrade[]> = {
  "ZEC/USDC": [
    { priceTicks: 5284n, sizeAtoms: pzecAtomsFromHundredths(340n), side: "buy", time: "14:32:08" },
    { priceTicks: 5281n, sizeAtoms: pzecAtomsFromHundredths(812n), side: "sell", time: "14:31:54" },
    { priceTicks: 5282n, sizeAtoms: pzecAtomsFromHundredths(176n), side: "buy", time: "14:31:41" },
    { priceTicks: 5278n, sizeAtoms: pzecAtomsFromHundredths(1205n), side: "sell", time: "14:31:27" },
    { priceTicks: 5280n, sizeAtoms: pzecAtomsFromHundredths(544n), side: "buy", time: "14:31:12" },
  ],
  "ZEC/USDT": [
    { priceTicks: 5279n, sizeAtoms: pzecAtomsFromHundredths(340n), side: "buy", time: "14:32:08" },
    { priceTicks: 5276n, sizeAtoms: pzecAtomsFromHundredths(812n), side: "sell", time: "14:31:54" },
    { priceTicks: 5277n, sizeAtoms: pzecAtomsFromHundredths(176n), side: "buy", time: "14:31:41" },
    { priceTicks: 5273n, sizeAtoms: pzecAtomsFromHundredths(1205n), side: "sell", time: "14:31:27" },
    { priceTicks: 5275n, sizeAtoms: pzecAtomsFromHundredths(544n), side: "buy", time: "14:31:12" },
  ],
};

export const pools = [
  {
    id: "pZEC/USDC",
    quote: "USDC",
    fee: "0.30%",
    tvl: "$842,410",
    volume: "$311,820",
    reserveZecAtoms: 797_132_000000n,
    reserveQuoteAtoms: 421_205_000000n,
  },
  {
    id: "pZEC/USDT0",
    quote: "USDT0",
    fee: "0.30%",
    tvl: "$516,920",
    volume: "$188,460",
    reserveZecAtoms: 489_600_000000n,
    reserveQuoteAtoms: 258_460_000000n,
  },
] as const;

export function formatSignedChange(changeBps: number): string {
  const sign = changeBps > 0 ? "+" : changeBps < 0 ? "-" : "";
  const absolute = Math.abs(changeBps);
  const whole = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${sign}${whole}.${fraction}%`;
}
