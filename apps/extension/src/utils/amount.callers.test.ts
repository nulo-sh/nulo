import { readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, test } from "vitest"
import { callsTo } from "../../scripts/type-roles/source-code"
import { REPO_ROOT, sourceFiles, TEST_FILE } from "../../scripts/type-roles/source-scan"

/**
 * Which amounts read compact: every capped call whose token the wallet knows. Read call by call: a
 * new call fails here until someone picks its kind, and an option other than `{ compact: true }` is
 * refused.
 */

const SRC = "apps/extension/src"
/** File → [compact calls, plain calls]. The snack's plain call is its uncapped full amount. */
const CALLS: Record<string, [number, number]> = {
	"components/composite/activity/TransactionIncomingCard.vue": [1, 0],
	"popup/components/modules/general/BalanceView.vue": [2, 0],
	"popup/components/modules/general/RecentActivityView.vue": [2, 0],
	"popup/components/modules/general/TokenCard.vue": [3, 0],
	"popup/pages/journal/[id].vue": [1, 0],
	// The fiat hero's whole dollars are exact, so their decimals 0 are no guess.
	"utils/hero-fit.ts": [3, 0],
	"utils/journal-state.ts": [1, 0],
	"utils/snack-amount.ts": [1, 1],
	"popup/components/modules/activity/TransactionCard.vue": [1, 0],
	"popup/pages/received/[id].vue": [1, 0],
	"popup/pages/tx/[id].vue": [1, 0],
}

/** [compact, plain]: plain has no fourth argument, compact passes exactly `{ compact: true }`. */
function kinds(text: string, file = "inline.ts"): [number, number] {
	// A file holds a call only if it spells the name, or a template hides a letter behind a `&#`
	// reference, which the compiler decodes.
	if (!text.includes("balanceFormatted") && !text.includes("&#")) return [0, 0]
	let compact = 0
	let plain = 0
	for (const { args } of callsTo(file, text, /\bbalanceFormatted$/)) {
		if (args.length <= 3) plain++
		else if (args.length === 4 && args[3]?.getText() === "{ compact: true }") compact++
		else throw new Error(`unsupported option in balanceFormatted(${args.map((arg) => arg.getText()).join(", ")})`)
	}
	return [compact, plain]
}

describe("balanceFormatted's callers", () => {
	test("every known-token capped amount reads compact", () => {
		const found: Record<string, [number, number]> = {}
		for (const file of sourceFiles({ roots: [SRC], exts: ["ts", "vue"], skip: [TEST_FILE] })) {
			const path = relative(SRC, file)
			const [compact, plain] = kinds(readFileSync(join(REPO_ROOT, file), "utf8"), path)
			if (compact + plain > 0) found[path] = [compact, plain]
		}
		expect(found).toEqual(CALLS)
	})

	test("a call split over lines is read whole", () => {
		const split = "return balanceFormatted(\n\tamount,\n\tdecimals,\n\t8,\n\t{ compact: true },\n).value\n"
		expect(kinds(split)).toEqual([1, 0])
		expect(kinds("\t// `balanceFormatted(raw, decimals, length)`.\n\t/**\n\t * balanceFormatted(x)\n\t */\n")).toEqual([0, 0])
		expect(kinds("const a = balanceFormatted(f(x), d, 8).value\n")).toEqual([0, 1])
	})

	test("a parenthesis in a string or a comment inside a call is not the call's end", () => {
		expect(kinds('balanceFormatted(a, ")", 8 /* ) */, { compact: true })')).toEqual([1, 0])
	})

	test("a call a template spells with a character reference is read", () => {
		const template = '<template><span :title="&#98;alanceFormatted(a, d, 8, { compact: true })" /></template>'
		expect(kinds(template, "x.vue")).toEqual([1, 0])
	})

	test.each([
		"balanceFormatted(a, d, 8, opts)",
		'balanceFormatted(a, d, 8, { "compact": true })',
		"balanceFormatted(a, d, 8, { compact: false })",
	])("an option other than { compact: true } is refused: %s", (call) => {
		expect(() => kinds(call)).toThrow("unsupported")
	})
})
