# Protocol definition refresh

Source: https://github.com/pump-fun/pump-public-docs/tree/81091419e4457566469d4e2a27f64ed84d42419c

The checked-in IDLs are exact upstream files. Generated TypeScript for Pump and PumpSwap uses the existing Codama toolchain. The fees IDL is pinned for layout verification; the SDK does not build fee-program instructions.

## pump

Instructions: 29 → 47.

### instructions

- Added `add_quote_control_mint`.
- Added `add_quote_mint`.
- Added `admin_cto`.
- Removed `admin_set_creator`.
- Added `buy_exact_quote_in_v2`.
- Added `buy_v2`.
- Added `claim_cashback_v2`.
- Added `collect_creator_fee_v2`.
- Changed `create_v2` (accounts, arguments, constraints or documentation; inspect the IDL diff).
- Added `distribute_creator_fees_v2`.
- Added `distribute_fee_to_holders`.
- Changed `extend_account` (accounts, arguments, constraints or documentation; inspect the IDL diff).
- Added `initialize_quote_control`.
- Changed `migrate` (accounts, arguments, constraints or documentation; inspect the IDL diff).
- Added `migrate_v2`.
- Added `remove_quote_control_mint`.
- Added `remove_quote_mint`.
- Changed `sell` (accounts, arguments, constraints or documentation; inspect the IDL diff).
- Added `sell_v2`.
- Added `set_quote_control_admin`.
- Added `set_virtual_quote_reserves`.
- Added `update_buyback_config`.
- Added `update_creator_fee_config`.
- Added `update_holder_reward_config`.

### types

- Added `AddQuoteControlMintEvent`.
- Added `AdminCtoEvent`.
- Removed `AdminSetCreatorEvent`.
- Changed `BondingCurve`: position 1: `virtual_sol_reserves` → `virtual_quote_reserves`; position 3: `real_sol_reserves` → `real_quote_reserves`; position 9: `absent` → `quote_mint`; position 10: `absent` → `creator_fee_bps`; position 11: `absent` → `can_edit_creator_fee`; position 12: `absent` → `is_holder_reward`.
- Changed `CollectCreatorFeeEvent`: position 3: `absent` → `quote_mint`.
- Changed `CompleteEvent`: position 4: `absent` → `quote_mint`.
- Changed `CompletePumpAmmMigrationEvent`: position 3: `sol_amount` → `sol_amount`; position 8: `absent` → `quote_mint`.
- Changed `CreateEvent`: position 15: `absent` → `quote_mint`; position 16: `absent` → `virtual_quote_reserves`; position 17: `absent` → `creator_fee_bps`; position 18: `absent` → `is_holder_reward`.
- Changed `DistributeCreatorFeesEvent`: position 7: `absent` → `quote_mint`.
- Added `DistributeFeeToHoldersEvent`.
- Changed `FeeConfig`: position 4: `absent` → `stable_fee_tiers`; position 5: `absent` → `exotic_flat_fees`.
- Changed `Global`: position 21: `absent` → `buyback_fee_recipients`; position 22: `absent` → `buyback_basis_points`; position 23: `absent` → `initial_virtual_quote_reserves`; position 24: `absent` → `whitelisted_quote_mints`; position 25: `absent` → `creator_fee_configurable`; position 26: `absent` → `max_configurable_creator_fee_bps`; position 27: `absent` → `holder_reward_claim_authority`; position 28: `absent` → `is_holder_reward_enabled`.
- Added `OptionU64`.
- Added `QuoteControl`.
- Added `QuoteControlMint`.
- Added `RemoveQuoteControlMintEvent`.
- Added `SetQuoteControlAdminEvent`.
- Changed `TradeEvent`: position 25: `absent` → `buyback_fee_basis_points`; position 26: `absent` → `buyback_fee`; position 27: `absent` → `shareholders`; position 28: `absent` → `quote_mint`; position 29: `absent` → `quote_amount`; position 30: `absent` → `virtual_quote_reserves`; position 31: `absent` → `real_quote_reserves`; position 32: `absent` → `holder_rewards_bps`; position 33: `absent` → `holder_rewards`.
- Added `UpdateCreatorFeeConfigEvent`.
- Changed `UserVolumeAccumulator`: position 9: `absent` → `stable_cashback_earned`; position 10: `absent` → `total_stable_cashback_claimed`.

SHA-256: `ffe966c42f1af41652ee753fe2f1e3f7cd4077d7e6f49faf3138959c8b56064b`.

## pump_amm

Instructions: 25 → 32.

### instructions

- Added `admin_cto_pool`.
- Removed `admin_set_coin_creator`.
- Added `boost_buy_and_burn`.
- Changed `claim_cashback` (accounts, arguments, constraints or documentation; inspect the IDL diff).
- Changed `create_pool` (accounts, arguments, constraints or documentation; inspect the IDL diff).
- Changed `extend_account` (accounts, arguments, constraints or documentation; inspect the IDL diff).
- Added `init_boost`.
- Added `set_boost_authority`.
- Added `toggle_boost`.
- Added `transfer_creator_fees_to_pump_v2`.
- Added `update_buyback_config`.
- Added `update_creator_fee_config`.

### types

- Added `AdminCtoPoolEvent`.
- Removed `AdminSetCoinCreatorEvent`.
- Added `BoostBuyAndBurnEvent`.
- Changed `BuyEvent`: position 32: `absent` → `buyback_fee_basis_points`; position 33: `absent` → `buyback_fee`; position 34: `absent` → `virtual_quote_reserves`; position 35: `absent` → `can_boost`; position 36: `absent` → `base_supply`; position 37: `absent` → `holder_rewards_bps`; position 38: `absent` → `holder_rewards`.
- Changed `CreatePoolEvent`: position 21: `absent` → `creator_fee_bps`; position 22: `absent` → `can_edit_creator_fee`; position 23: `absent` → `is_holder_reward`.
- Changed `FeeConfig`: position 4: `absent` → `stable_fee_tiers`; position 5: `absent` → `exotic_flat_fees`.
- Changed `GlobalConfig`: position 12: `absent` → `buyback_fee_recipients`; position 13: `absent` → `buyback_basis_points`; position 14: `absent` → `boost_authority`; position 15: `absent` → `boost_enabled`; position 16: `absent` → `creator_fee_configurable`; position 17: `absent` → `max_configurable_creator_fee_bps`.
- Added `InitBoostEvent`.
- Added `OptionU64`.
- Changed `Pool`: position 12: `absent` → `virtual_quote_reserves`; position 13: `absent` → `creator_fee_bps`; position 14: `absent` → `can_edit_creator_fee`; position 15: `absent` → `is_holder_reward`.
- Changed `SellEvent`: position 25: `absent` → `buyback_fee_basis_points`; position 26: `absent` → `buyback_fee`; position 27: `absent` → `virtual_quote_reserves`; position 28: `absent` → `can_boost`; position 29: `absent` → `base_supply`; position 30: `absent` → `holder_rewards_bps`; position 31: `absent` → `holder_rewards`.
- Added `SetBoostAuthorityEvent`.
- Added `UpdateCreatorFeeConfigEvent`.

SHA-256: `2091433899b07d003d98118ae6cd3c628960fd393b40710b6e15bce6d0e7f2d1`.

Compatibility decoding is applied by `scripts/codama-generate.ts` to the generated
`decodeBondingCurve` and `decodePool` account entry points. Their single-account
and batch fetchers therefore accept historical accounts with whole trailing
fields missing. `src/utils/protocol_accounts.ts` supplies documented zero/false/
default-public-key values and rejects partial fields or wrong discriminators.
The raw fixed-layout codecs continue to describe the current IDL wire layout.

References at the pinned revision:
- `docs/PUMP_PROGRAM_README.md`, Bonding curve appended-field defaults.
- `docs/PUMP_SWAP_README.md`, Pool appended-field defaults.

## pump_fees

`idl/pumpfees.idl.json` is the exact upstream `idl/pump_fees.json` at the pinned
revision. SHA-256: `d87b52305fd6b2ec487d4ba1e08a49990c23fa9b8b76092b2097df0164fa3859`.
The Pump and PumpSwap IDLs embed the same `FeeConfig` account discriminator and
`FeeConfig`, `FeeTier`, and `Fees` field layouts. `tests/unit/fee_idl.test.ts`
checks that match and both generated fee decoders.
