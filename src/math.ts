/**
 * Legacy math utilities - re-exported from utils/slippage.ts for backward compatibility.
 * @deprecated Import directly from utils/slippage.ts or use the new recipe functions instead.
 */

export { percentToBps as pctToBps, addSlippage as computeSlippageIn, subSlippage as computeSlippageOut } from "./utils/slippage";
