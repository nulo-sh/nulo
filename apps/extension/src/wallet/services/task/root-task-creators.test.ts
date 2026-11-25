import { readFileSync } from "node:fs"
import { join, relative } from "node:path"
import type ts from "typescript"
import { describe, expect, test } from "vitest"
import { callsTo } from "../../../../scripts/type-roles/source-code"
import { REPO_ROOT, sourceFiles, TEST_FILE } from "../../../../scripts/type-roles/source-scan"

/**
 * A root task's owner decides which profile's list it joins, and typecheck accepts any string or
 * `undefined` there. This pins who creates roots and refuses a literal `undefined` owner. Textual
 * on purpose: an owner read from the wrong profile passes it, so the behavioural tests stay the
 * proof, and a new creator is a deliberate edit of `CREATORS`.
 */

const SRC = "apps/extension/src"

const CREATORS = [
	"wallet/services/auth-registry/service.ts",
	"wallet/services/execution/fee/fee-strategy.ts",
	"wallet/services/execution/service.ts",
	"wallet/services/execution/transfer-executor.ts",
	"wallet/services/execution/tx-request-builder.ts",
	"wallet/services/token-balance/balance-job-queue.ts",
	"wallet/services/token/service.ts",
]

interface Call {
	site: string
	args: readonly ts.Expression[]
}

function rootCallsIn(file: { path: string; text: string }): Call[] {
	return callsTo(file.path, file.text, /\b(?:startNewTask|createNewTask)$/).map(({ line, args }) => ({
		site: `${file.path}:${line}`,
		args,
	}))
}

const namesAnOwner = (call: Call) => call.args[0] !== undefined && call.args[0].getText().trim() !== "undefined"

const files = sourceFiles({ roots: [SRC], exts: ["ts", "vue"], skip: [TEST_FILE] })
	.map((file) => ({ path: relative(SRC, file), text: readFileSync(join(REPO_ROOT, file), "utf8") }))
	.filter((file) => !file.path.startsWith("wallet/services/task/"))

describe("every root task names the profile it belongs to", () => {
	const calls = files.flatMap(rootCallsIn)

	test("a literal undefined owner is caught, and a named one passes", () => {
		const [refused, named] = rootCallsIn({
			path: "x.ts",
			text: "tasks.startNewTask(undefined, step)\nthis.tasks.createNewTask(fence.profileId, step)",
		})
		expect(refused && namesAnOwner(refused)).toBe(false)
		expect(named && namesAnOwner(named)).toBe(true)
		expect(named?.site).toBe("x.ts:2")
	})

	test("the files that create root tasks are exactly the ones reasoned about", () => {
		expect([...new Set(calls.map((call) => call.site.replace(/:\d+$/, "")))].sort()).toEqual(CREATORS)
	})

	test("no call passes a literal undefined as its owner", () => {
		expect(calls.filter((call) => !namesAnOwner(call)).map((call) => call.site)).toEqual([])
	})
})
