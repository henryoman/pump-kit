export interface AmmFees { lpFeeBps: bigint; protocolFeeBps: bigint; creatorFeeBps: bigint }
const BPS = 10000n;
const ceil = (a: bigint, b: bigint) => (a + b - 1n) / b;
function validate(base: bigint, quote: bigint, fees: AmmFees) {
  if (base <= 0n || quote <= 0n) throw new Error("AMM reserves must be positive");
  const values = [fees.lpFeeBps, fees.protocolFeeBps, fees.creatorFeeBps];
  if (values.some(value => value < 0n) || values.reduce((sum, value) => sum + value, 0n) >= BPS) throw new Error("Invalid AMM fee rates");
}
export function ammQuoteFees(quote: bigint, fees: AmmFees) {
  return { lp: ceil(quote * fees.lpFeeBps, BPS), protocol: ceil(quote * fees.protocolFeeBps, BPS), creator: ceil(quote * fees.creatorFeeBps, BPS) };
}
export function quoteAmmBuyCost(tokens: bigint, base: bigint, quote: bigint, fees: AmmFees): bigint {
  validate(base, quote, fees);
  if (tokens <= 0n || tokens >= base) throw new Error("Buy quantity must be positive and below base reserves");
  const net = ceil(tokens * quote, base - tokens);
  const charged = ammQuoteFees(net, fees);
  return net + charged.lp + charged.protocol + charged.creator;
}
export function quoteAmmBuyBudget(budget: bigint, base: bigint, quote: bigint, fees: AmmFees) {
  validate(base, quote, fees);
  if (budget <= 0n) throw new Error("AMM budget must be positive");
  const totalFeeBps = fees.lpFeeBps + fees.protocolFeeBps + fees.creatorFeeBps;
  let effectiveQuote = budget * BPS / (BPS + totalFeeBps);
  const charged = ammQuoteFees(effectiveQuote, fees);
  const totalWithFees = effectiveQuote + charged.lp + charged.protocol + charged.creator;
  if (totalWithFees > budget) effectiveQuote -= totalWithFees - budget;
  // Official buyQuoteInput reserves one quote unit after the fee adjustment.
  const input = effectiveQuote - 1n;
  if (input <= 0n) throw new Error("AMM budget is too small to buy any tokens");
  const tokenAmountOut = base * input / (quote + input);
  if (tokenAmountOut <= 0n) throw new Error("AMM budget is too small to buy any tokens");
  return { tokenAmountOut, quoteRequired: quoteAmmBuyCost(tokenAmountOut, base, quote, fees) };
}
export function quoteAmmSell(tokens: bigint, base: bigint, effectiveQuote: bigint, realQuote: bigint, fees: AmmFees): bigint {
  validate(base, effectiveQuote, fees);
  if (tokens <= 0n) throw new Error("Sell quantity must be positive");
  const gross = tokens * effectiveQuote / (base + tokens);
  const charged = ammQuoteFees(gross, fees);
  if (gross - charged.lp > realQuote) throw new Error("AMM has insufficient real quote liquidity");
  const net = gross - charged.lp - charged.protocol - charged.creator;
  if (net <= 0n) throw new Error("AMM trade produces no quote output after fees");
  return net;
}
