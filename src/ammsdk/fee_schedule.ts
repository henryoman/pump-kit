import type { FeeConfig } from "./generated/accounts/feeConfig";
import type { Fees } from "./generated/types/fees";

export function selectFeeSchedule(config: FeeConfig, canonical: boolean, quoteMint: string, marketCap: bigint): Fees {
  if (!canonical) return config.flatFees;
  const solLike = ["11111111111111111111111111111111", "So11111111111111111111111111111111111111112", "9pan9bMn5HatX4EJdBwg9VgCa7Uz5HL8N1m5D3NdXejP"].includes(quoteMint);
  const stable = quoteMint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  if (!solLike && !stable) {
    const fees = config.exoticFlatFees;
    return fees.lpFeeBps || fees.protocolFeeBps || fees.creatorFeeBps ? fees : config.flatFees;
  }
  const tiers = [...(stable && config.stableFeeTiers.length ? config.stableFeeTiers : config.feeTiers)]
    .sort((a, b) => a.marketCapLamportsThreshold < b.marketCapLamportsThreshold ? -1 : a.marketCapLamportsThreshold > b.marketCapLamportsThreshold ? 1 : 0);
  if (!tiers.length) throw new Error("Fee tier schedule is empty");
  let fees = tiers[0]!.fees;
  for (const tier of tiers) if (marketCap >= tier.marketCapLamportsThreshold) fees = tier.fees;
  return fees;
}
