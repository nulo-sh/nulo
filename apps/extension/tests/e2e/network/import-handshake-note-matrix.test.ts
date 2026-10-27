/**
 * The rest of the handshake-note import matrix. The passkey row is the one PR-lane restore, into
 * the PXE, of a backup a passkey profile made. The Settings row reaches the same purge and import
 * as the pooled row (`import-handshake-note.test.ts`), differing only in where the delete starts,
 * so CI skips it.
 *
 * @requires-proverless — formal marker scanned by scripts/e2e/agent.sh; the projection gate exists
 * only in a proverless-armed build.
 */
import { inject } from "vitest"
import type { AztecTestConfig } from "../fixtures/aztec"
import { test } from "../fixtures/extension"
import { type ImportRow, importRowName, runHandshakeImport } from "../helpers/handshake-import"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const ROWS: readonly { row: ImportRow; inCi: boolean }[] = [
	{ row: { credential: "password", deleteFrom: "settings" }, inCi: false },
	{ row: { credential: "passkey", deleteFrom: "lock-view" }, inCi: true },
]

for (const { row, inCi } of ROWS) {
	test.skipIf(!aztecConfig || (!inCi && process.env.CI === "true"))(
		importRowName(row),
		{ timeout: 900_000, retry: 0 },
		async ({ freshExtensionPerTest: ctx }) => {
			if (!aztecConfig) throw new Error("unreachable: skipIf guards")
			await runHandshakeImport(ctx, aztecConfig, row)
		},
	)
}
