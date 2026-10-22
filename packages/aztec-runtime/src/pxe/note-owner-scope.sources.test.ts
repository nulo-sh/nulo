/**
 * The incoming receipts read a contract's notes by the account's scope with no owner filter. That
 * yields only the account's own receipt notes because the PXE's own sync never stores a
 * receipt-class note under a scope lacking its owner's key: it syncs one scope at a time, its key
 * oracle refuses keys outside the run's scopes, and every class that decodes a receipt derives the
 * nullifier from the owner's key, without which discovery stores nothing. A bump that changes any
 * of these needs a fresh look at those reads.
 */
import { readFileSync } from "node:fs"
import { resolvePackageAsset } from "@nulo/resolve-asset"
import { describe, expect, test } from "vitest"

const read = (pkg: string, path: string) => readFileSync(resolvePackageAsset(pkg, path, { from: import.meta.url }), "utf8")

/** Rules match code only, so a rule that survives only in a comment fails. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")

/** Throws when `from` is absent, so a control never runs on the shipped text by accident. */
function mutate(source: string, from: string | RegExp, to: string): string {
	const out = source.replace(from, to)
	if (out === source) throw new Error(`mutation target not found: ${from}`)
	return out
}

function expectPinned(rule: RegExp | ((text: string) => boolean), shipped: string, mutants: string[]) {
	const holds = typeof rule === "function" ? rule : (text: string) => rule.test(text)
	expect(holds(code(shipped))).toBe(true)
	for (const mutant of mutants) expect(holds(code(mutant))).toBe(false)
}

describe("@aztec-labs/pxe scope sources", () => {
	test("the key oracle refuses a key no account in the run's scopes holds", () => {
		const oracle = read("@aztec-labs/pxe", "dest/contract_function_simulator/oracle/utility_execution_oracle.js")
		const rule =
			/async getKeyValidationRequest\(pkMHash, _keyIndex\)\s*\{\s*let hasAccess = false;\s*for\s*\(let i = 0; i < this\.scopes\.length && !hasAccess; i\+\+\)\s*\{\s*if \(await this\.keyStore\.accountHasKey\(this\.scopes\[i\], pkMHash\)\)\s*\{\s*hasAccess = true;\s*\}\s*\}\s*if \(!hasAccess\)\s*\{\s*throw new Error\(/
		expectPinned(rule, oracle, [
			mutate(oracle, "throw new Error(`Key validation request denied", "// throw new Error(`Key validation request denied"),
			mutate(
				oracle,
				/async getKeyValidationRequest\(pkMHash, _keyIndex\) \{[\s\S]*?return this\.keyStore\.getKeyValidationRequest\(pkMHash, this\.contractAddress\);\s*\}/,
				"/* $& */ async getKeyValidationRequest(pkMHash, _keyIndex) { return this.keyStore.getKeyValidationRequest(pkMHash, this.contractAddress); }",
			),
		])
	})

	test("a contract's state syncs one scope at a time", () => {
		const helpers = read("@aztec-labs/pxe", "dest/contract/helpers.js")
		const call = /utilityExecutor\(syncStateFunctionCall, \[\s*scope\s*\]\)/
		const rule =
			/export async function syncScope\(contractAddress, contractStore, contractClassService, anchorBlockHeader, functionToInvokeAfterSync, utilityExecutor, scope\)\s*\{\s*if \(isSkipSyncContract\(contractAddress\)\)\s*\{\s*return;\s*\}\s*const classId = await contractClassService\.getCurrentClassId\(contractAddress, anchorBlockHeader\);\s*if \(!classId\)\s*\{\s*throw new Error\(`[^`]*`\);\s*\}\s*const syncStateFunctionCall = await contractStore\.getFunctionCall\('sync_state', \[\s*scope\s*\], contractAddress, classId\);\s*if \(functionToInvokeAfterSync && functionToInvokeAfterSync\.equals\(syncStateFunctionCall\.selector\)\)\s*\{\s*throw new Error\('[^']*'\);\s*\}\s*await utilityExecutor\(syncStateFunctionCall, \[\s*scope\s*\]\);\s*\}/
		expectPinned(rule, helpers, [
			mutate(helpers, call, "utilityExecutor(syncStateFunctionCall, scopes)"),
			mutate(helpers, "export async function syncScope(", "export async function syncScopes("),
			mutate(
				helpers,
				/await utilityExecutor\(syncStateFunctionCall, \[\s*scope\s*\]\);/,
				"if (false) { $& } await utilityExecutor(syncStateFunctionCall, scopes);",
			),
			`${mutate(helpers, call, "utilityExecutor(syncStateFunctionCall, [])")}
async function unusedHelper(utilityExecutor, syncStateFunctionCall, scope) {
    await utilityExecutor(syncStateFunctionCall, [
        scope
    ]);
}
`,
		])

		const service = read("@aztec-labs/pxe", "dest/contract/contract_sync_service.js")
		const perScope =
			/async #startSyncIfNeeded\(contractAddress, functionToInvokeAfterSync, utilityExecutor, anchorBlockHeader, changeSetId, scopes\)\s*\{\s*const scopesToSync = scopes\.filter\(\(scope\)=>!this\.syncedContracts\.has\(toKey\(contractAddress, scope\)\)\);\s*if \(scopesToSync\.length > 0\)\s*\{\s*this\.log\.debug\(`[^`]*`\);\s*const syncNullifiersPromise = this\.#syncNoteNullifiers\(contractAddress, anchorBlockHeader, changeSetId, scopesToSync\);\s*const syncSlot = new Semaphore\(MAX_CONCURRENT_SCOPE_SYNCS\);\s*for \(const scope of scopesToSync\)\s*\{\s*const key = toKey\(contractAddress, scope\);\s*const syncScopePromise = runBounded\(syncSlot, \(\)=>syncScope\(contractAddress, this\.contractStore, this\.contractClassService, anchorBlockHeader, functionToInvokeAfterSync, utilityExecutor, scope\)\);/
		expectPinned(perScope, service, [
			mutate(service, "utilityExecutor, scope));", "utilityExecutor, scopesToSync));"),
			mutate(
				service,
				"const syncSlot = new Semaphore(MAX_CONCURRENT_SCOPE_SYNCS);",
				"$& await syncScopes(contractAddress, scopesToSync);",
			),
		])
	})
})

/** The bundled classes whose notes decode an amount, so they are the only notes that become receipts. */
const RECEIPT_CLASSES = [
	["aztec-standards Token", "@aztec-foundation/aztec-standards", "artifacts/target/token_contract-Token.json"],
	["noir-contracts Token", "@aztec-labs/noir-contracts.js", "artifacts/token_contract-Token.json"],
	["PrivateFPC", "@alejoamiras/private-fee-juice", "target/private_contract-PrivateFPC.json"],
] as const

function embeddedSource(pkg: string, path: string, suffix: string): string {
	const { file_map } = JSON.parse(read(pkg, path)) as { file_map: Record<string, { path: string; source: string }> }
	const files = Object.values(file_map).filter((file) => file.path.replaceAll("\\", "/").endsWith(suffix))
	expect(files).toHaveLength(1)
	return files[0].source
}

describe("receipt-class aztec-nr sources", () => {
	test.each(RECEIPT_CLASSES)("%s stores a UintNote only where its owner's key is in scope", (_name, pkg, path) => {
		const note = embeddedSource(pkg, path, "uint-note/src/uint_note.nr")
		const ownerKey =
			/unconstrained fn compute_nullifier_unconstrained\(\s*self,\s*owner: AztecAddress,\s*note_hash_for_nullification: Field,?\s*\)\s*->\s*Option<Field>\s*\{\s*try_get_public_keys\(owner\)\.map\(\|public_keys\|\s*\{\s*let owner_npk_m_hash = public_keys\.npk_m_hash;\s*let secret = get_nhk_app\(owner_npk_m_hash\);\s*compute_note_nullifier\(note_hash_for_nullification, \[secret\]\)/
		expectPinned(ownerKey, note, [mutate(note, "let secret = get_nhk_app(owner_npk_m_hash);", "let secret = 0;")])

		const discovery = embeddedSource(pkg, path, "aztec/src/messages/discovery/nonce_discovery.nr")
		const discoveryFn =
			/unconstrained fn attempt_note_nonce_discovery\((?:(?!\n\s*(?:pub(?:\(crate\))?\s+)?(?:unconstrained\s+)?fn\b)[\s\S])*/
		const gate =
			/if maybe_inner_nullifier_for_i\.is_none\(\)\s*\{\s*aztecnr_warn_log_format!\(\s*"[^"]*",?\s*\)\(\s*\[unique_note_hash_for_i, note_type_id, owner\.to_field\(\)\],?\s*\);\s*\}\s*else\s*\{\s*discovered_notes\.push\(/
		/** The vector is declared, pushed once in the gate's else, and returned; any other use is a new way in. */
		const gated = (text: string) => {
			const body = text.match(discoveryFn)?.[0] ?? ""
			return gate.test(body) && body.match(/\bdiscovered_notes\b/g)?.length === 3
		}
		expectPinned(gated, discovery, [
			mutate(discovery, /(if maybe_inner_nullifier_for_i\.is_none\(\) \{)/, "$1\n discovered_notes.push(note);"),
			mutate(discovery, /(if maybe_inner_nullifier_for_i\.is_none\(\) \{)/, "$1\n if false {} else { discovered_notes.push(note); }"),
			mutate(
				discovery,
				"if maybe_inner_nullifier_for_i.is_none() {",
				"if !maybe_inner_nullifier_for_i.is_some() { discovered_notes.push(note); }\n$&",
			),
			`${mutate(discovery, "if maybe_inner_nullifier_for_i.is_none() {", "if false {")}
unconstrained fn sibling() {
    if maybe_inner_nullifier_for_i.is_none() {
    } else {
        discovered_notes.push(note);
    }
}
`,
		])
	})
})
