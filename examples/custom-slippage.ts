import { buy, sell, rpc } from "pump-kit";
import { address, generateKeyPairSigner } from "@solana/kit";

async function main() {
  const user = await generateKeyPairSigner();
  const mint = address(process.env.PUMP_EXAMPLE_MINT!);
  const buyPlan = await buy({ user, mint, rpc, amountIn: 5_000_000n, slippageBps: 100 });
  const sellPlan = await sell({ user, mint, rpc, amountIn: 500_000n, slippageBps: 25 });
  console.log(buyPlan.quote, buyPlan.instructions);
  console.log(sellPlan.quote, sellPlan.instructions);
}

main().catch(console.error);
