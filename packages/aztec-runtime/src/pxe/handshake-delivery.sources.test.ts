/**
 * Three upstream behaviours make a sync of an account the PXE holds no keys for lose that
 * account's handshake-delivered notes: a third party's note is handshake-delivered by default, the
 * PXE syncs such an account with only a warning, and the HandshakeRegistry sync moves its cursor
 * past every handshake it could not decrypt. The import e2e (`helpers/handshake-import.ts`) relies
 * on the first to exercise the loss; an Aztec bump that changes any of them needs a fresh look.
 */
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { describe, expect, test } from "vitest"

const require = createRequire(import.meta.url)
const dest = join(dirname(require.resolve("@aztec-labs/pxe/client/bundle")), "..", "..", "..")
const read = (...path: string[]) => readFileSync(join(dest, ...path), "utf8")

describe("@aztec-labs/pxe handshake-delivery sources", () => {
	test("with no wallet hook, a note from another PXE is tagged through a non-interactive handshake", () => {
		expect(read("hooks", "resolve_tagging_secret_strategy.js")).toMatch(
			/DEFAULT_TAGGING_SECRET_STRATEGY = \{\s*type: 'non-interactive-handshake'\s*\}/,
		)
	})

	test("a sync scoped to an account without keys only warns", () => {
		expect(read("logs", "log_service.js")).toContain("due to unknown address preimage")
	})
})

describe("@aztec-labs/standard-contracts HandshakeRegistry sync source", () => {
	test("the cursor advances past every scanned handshake, decrypted or not", () => {
		const artifact = join(dirname(require.resolve("@aztec-labs/standard-contracts/data")), "..", "artifacts", "HandshakeRegistry.json")
		const { file_map } = JSON.parse(readFileSync(artifact, "utf8")) as { file_map: Record<string, { path: string; source: string }> }
		const sync = Object.values(file_map).find((file) => file.path.endsWith("handshake_registry_contract/src/sync/mod.nr"))
		expect(sync?.source).toMatch(/let _ = AES128::decrypt\([\s\S]*?\}\);\s*cursor\.advance\(anchor_block_header\);/)
	})
})
