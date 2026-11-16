import type { GasBalances } from "@/wallet/services/execution/models"

/** The shown execute fixture's Fee Juice, which the balances store answers with in an armed build.
 *  Every read sits behind `E2E_EXECUTE_FIXTURE`. Never in `./execute-fixture-gate`: the store's chunk
 *  is shared, and a gate imported there no longer folds away in a release build. */
export const fixtureGas: { value: GasBalances | undefined } = { value: undefined }
