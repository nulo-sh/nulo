/**
 * The rest of the handshake-note import matrix: the Settings delete and a passkey profile. Both
 * reach the same `clearProfileState` and the same import as the pooled row, so they run locally
 * only: CI skips them, and the passkey row also needs the export ceremony that CI's virtual
 * authenticator does not resolve (`passkey-backup.test.ts`).
 *
 * @requires-proverless — formal marker scanned by scripts/e2e/agent.sh; the projection gate exists
 * only in a proverless-armed build.
 */
import { inject } from "vitest"
import type { AztecTestConfig } from "../fixtures/aztec"
import { test } from "../fixtures/extension"
import { type ImportRow, importRowName, runHandshakeImport } from "../helpers/handshake-import"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const ROWS: readonly ImportRow[] = [
	{ credential: "password", deleteFrom: "settings" },
	{ credential: "passkey", deleteFrom: "lock-view" },
]

for (const row of ROWS) {
	test.skipIf(!aztecConfig || process.env.CI === "true")(
		importRowName(row),
		{ timeout: 900_000, retry: 0 },
		async ({ freshExtensionPerTest: ctx }) => {
			if (!aztecConfig) throw new Error("unreachable: skipIf guards")
			await runHandshakeImport(ctx, aztecConfig, row)
		},
	)
}
