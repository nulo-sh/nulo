/**
 * A handshake-delivered note survives a full-backup import of a password profile deleted from the
 * lock view. The scenario and why it is deterministic: `helpers/handshake-import.ts`.
 *
 * @requires-proverless — formal marker scanned by scripts/e2e/agent.sh; the projection gate exists
 * only in a proverless-armed build.
 */
import { expect, inject } from "vitest"
import type { AztecTestConfig } from "../fixtures/aztec"
import { test } from "../fixtures/extension"
import { type ImportRow, importRowName, runHandshakeImport } from "../helpers/handshake-import"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const ROW: ImportRow = { credential: "password", deleteFrom: "lock-view" }

test("agent-runner contract: a live sandbox must be configured (no false skip)", () => {
	expect(aztecConfig).toBeDefined()
})

test.skipIf(!aztecConfig)(importRowName(ROW), { timeout: 900_000, retry: 0 }, async ({ freshExtensionPerTest: ctx }) => {
	if (!aztecConfig) throw new Error("unreachable: skipIf guards")
	await runHandshakeImport(ctx, aztecConfig, ROW)
})
