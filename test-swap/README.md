# Live Swap Test Scripts

Separate scripts for testing buy and sell operations on Solana using Pump Kit:

- **test-buy.ts**: Buys 0.01 SOL worth of tokens with 1% slippage
- **test-sell.ts**: Sells 100% of wallet token balance with 1% slippage

## Setup

### 1. Create Keypair File

Place your Solana keypair JSON file in this folder as `keypair.json`.

**Format:** Standard Solana keypair JSON (64-byte array)
```json
[123, 45, 67, 89, 12, 34, 56, 78, ...]
```

**How to export from Phantom/Solflare:**
- Export private key as JSON array
- Or use `solana-keygen` to generate: `solana-keygen new -o keypair.json`

**⚠️ WARNING:** This file contains your private key. Never commit it to git!

### 2. Set Environment Variables

```bash
# Required: Token mint address to swap
export TOKEN_MINT="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

# Optional: Custom RPC endpoint (defaults to mainnet-beta)
export RPC_URL="https://api.mainnet-beta.solana.com"
export RPC_WS_URL="wss://api.mainnet-beta.solana.com"
```

### 3. Run the Scripts

**Buy tokens:**
```bash
bun test-swap/test-buy.ts
```

**Sell all tokens:**
```bash
bun test-swap/test-sell.ts
```

Both scripts are pre-configured with:
- Token: `NvW3Ukof58evgpCDhEsPhy2bAURGXjEQU5gy9ZDpump`
- Slippage: 1% (100 bps)
- No priority fees (just gas)

## What They Do

**test-buy.ts:**
1. Loads your keypair from `test-swap/keypair.json`
2. Connects to RPC (mainnet by default)
3. Checks balance - ensures you have enough SOL
4. Buys tokens - spends 0.01 SOL with 1% slippage tolerance
5. Shows transaction signature and balance changes

**test-sell.ts:**
1. Loads your keypair from `test-swap/keypair.json`
2. Connects to RPC (mainnet by default)
3. Checks balance - ensures you have enough SOL for fees
4. Sells all tokens - sells 100% of wallet balance with 1% slippage
5. Shows transaction signature and balance changes

## Expected Output

**test-buy.ts:**
```
🚀 Pump Kit Buy Test

📁 Loading keypair from: /path/to/test-swap/keypair.json
✅ Wallet address: YourWalletAddress...

🌐 Connecting to RPC: https://api.mainnet-beta.solana.com
✅ RPC connected

💰 Initial SOL balance: 1.2345 SOL

📊 Token mint: NvW3Ukof58evgpCDhEsPhy2bAURGXjEQU5gy9ZDpump
💵 Buy amount: 0.01 SOL
📉 Slippage: 1%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Buying tokens
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Buy instruction created
📝 Building transaction...
📤 Sending buy transaction...

✅ Buy transaction confirmed!
🔗 Signature: https://solscan.io/tx/...
📦 Slot: 123456789

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 Initial balance: 1.2345 SOL
💰 Final balance:   1.2234 SOL
💸 Amount spent:    0.0111 SOL

✅ Buy test completed successfully!
```

**test-sell.ts:**
```
🚀 Pump Kit Sell Test

📁 Loading keypair from: /path/to/test-swap/keypair.json
✅ Wallet address: YourWalletAddress...

🌐 Connecting to RPC: https://api.mainnet-beta.solana.com
✅ RPC connected

💰 Initial SOL balance: 1.2234 SOL

📊 Token mint: NvW3Ukof58evgpCDhEsPhy2bAURGXjEQU5gy9ZDpump
📉 Slippage: 1%
💯 Selling: 100% of wallet balance

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Selling all tokens
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Sell instruction created
📝 Building transaction...
📤 Sending sell transaction...

✅ Sell transaction confirmed!
🔗 Signature: https://solscan.io/tx/...
📦 Slot: 123456790

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 Initial balance: 1.2234 SOL
💰 Final balance:   1.2323 SOL
💵 Amount received: +0.0089 SOL

✅ Sell test completed successfully!
```

## Troubleshooting

**"Keypair file not found"**
- Make sure `keypair.json` is in the `test-swap/` folder
- Check the file path is correct

**"Insufficient balance"**
- Need at least 0.011 SOL (0.01 for swap + ~0.001 for fees)
- Get SOL from a faucet (devnet) or fund your wallet (mainnet)

**"TOKEN_MINT environment variable is required"**
- Scripts are pre-configured with `NvW3Ukof58evgpCDhEsPhy2bAURGXjEQU5gy9ZDpump`
- To use a different token, edit the `TOKEN_MINT` constant in the script

**Transaction fails**
- Check you have enough SOL for fees
- Verify the token mint exists and has liquidity
- Try with a smaller amount first

