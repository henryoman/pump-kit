# Quote parity fixtures

`quote-parity.json` records outputs generated with the official npm packages
`@pump-fun/pump-sdk@2.0.0` and `@pump-fun/pump-swap-sdk@1.20.0`, installed in an
isolated temporary Bun project. Those packages are not PumpKit dependencies.
All numeric inputs and outputs are stored as decimal strings.

Curve output fields come from `getBuyTokenAmountFromSolAmount`,
`getBuySolAmountFromTokenAmount`, and `getSellSolAmountFromTokenAmount`.
The creator is nonzero, feeConfig is null, and Global fallback fees are 75
protocol / 25 creator basis points. The mint supply is 1,000,000,000,000,000.

AMM output fields come from `buyQuoteInput.base`, `buyBaseInput.uiQuote`, and
`sellBaseInput.uiQuote`, with zero slippage, a nonzero creator, null feeConfig,
and GlobalConfig fallback fees of 75 LP / 75 protocol / 25 creator basis points.
`quote` is the real vault balance; `virtual` is supplied separately to the SDK.

The cases cover initial curve reserves, fee ceilings near small-integer
boundaries, AMM virtual quote reserves, and quantities above the safe number
range. Tests consume static outputs without RPC or legacy SDK imports.
