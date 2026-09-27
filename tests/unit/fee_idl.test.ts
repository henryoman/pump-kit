import { expect, test } from "bun:test";
import { getFeeConfigDecoder as getCurveFeeConfigDecoder, FEE_CONFIG_DISCRIMINATOR as CURVE_DISCRIMINATOR } from "../../src/pumpsdk/generated/accounts/feeConfig";
import { getFeeConfigDecoder as getAmmFeeConfigDecoder, FEE_CONFIG_DISCRIMINATOR as AMM_DISCRIMINATOR } from "../../src/ammsdk/generated/accounts/feeConfig";
import { getFeeConfigEncoder } from "../../src/pumpsdk/generated/accounts/feeConfig";
import { address } from "@solana/kit";

const idl = await Bun.file("idl/pumpfees.idl.json").json();
const curveIdl = await Bun.file("idl/pumpfun.idl.json").json();
const ammIdl = await Bun.file("idl/pumpswap.idl.json").json();
const layout = (fields: any[]) => fields.map(({ name, type }) => ({ name, type }));

test("fee account layouts embedded in Pump and PumpSwap match the official fees IDL", () => {
  const feeAccount = idl.accounts.find((entry: any) => entry.name === "FeeConfig");
  const feeType = idl.types.find((entry: any) => entry.name === "FeeConfig");
  expect(feeAccount).toBeDefined();
  expect(feeType).toBeDefined();
  for (const embedded of [curveIdl, ammIdl]) {
    expect(embedded.accounts.find((entry: any) => entry.name === "FeeConfig")?.discriminator).toEqual(feeAccount.discriminator);
    expect(layout(embedded.types.find((entry: any) => entry.name === "FeeConfig")?.type.fields)).toEqual(layout(feeType.type.fields));
    for (const typeName of ["FeeTier", "Fees"]) {
      expect(layout(embedded.types.find((entry: any) => entry.name === typeName)?.type.fields))
        .toEqual(layout(idl.types.find((entry: any) => entry.name === typeName)?.type.fields));
    }
  }
  expect([...CURVE_DISCRIMINATOR]).toEqual(feeAccount.discriminator);
  expect([...AMM_DISCRIMINATOR]).toEqual(feeAccount.discriminator);
  const bytes = getFeeConfigEncoder().encode({ bump: 0, admin: address("11111111111111111111111111111111"),
    flatFees: { lpFeeBps: 1n, protocolFeeBps: 2n, creatorFeeBps: 3n },
    feeTiers: [], stableFeeTiers: [], exoticFlatFees: { lpFeeBps: 0n, protocolFeeBps: 0n, creatorFeeBps: 0n } });
  expect(getCurveFeeConfigDecoder().decode(bytes).flatFees.protocolFeeBps).toBe(2n);
  expect(getAmmFeeConfigDecoder().decode(bytes).flatFees.creatorFeeBps).toBe(3n);
});
