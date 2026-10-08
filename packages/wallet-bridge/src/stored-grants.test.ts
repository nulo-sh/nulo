/**
 * Stored grants are re-projected on read: every shape the wallet writes reads back unchanged, and
 * every malformed grant refuses the whole read with the projector's fixed text.
 */
import { describe, expect, test } from "vitest"
import { ValidationError } from "@nulo/extension-messaging/errors"
import type { Capability } from "./capabilities"
import { projectKnownCapability, projectStoredGrants } from "./capability-negotiation"

const A = `0x${"0a".repeat(32)}`
const B = `0x${"0b".repeat(32)}`
const listed = [{ contract: A, function: "transfer" }]

/** One valid request per known type, keyed by type so a new type fails to compile here. */
const VALID: Record<Capability["type"], Record<string, unknown>> = {
	accounts: { type: "accounts", canGet: true, canCreateAuthWit: true, accounts: [{ alias: "Main", item: A }, { item: B }] },
	contracts: { type: "contracts", contracts: [A, B], canRegister: true, canGetMetadata: false },
	contractClasses: { type: "contractClasses", classes: "*", canGetMetadata: true },
	simulation: { type: "simulation", transactions: { scope: listed }, utilities: { scope: "*" } },
	transaction: { type: "transaction", scope: listed },
	data: { type: "data", addressBook: true, privateEvents: { contracts: [A] } },
}

function refusal(records: unknown[]): { threw: unknown; message: string } | "read" {
	try {
		projectStoredGrants(records)
		return "read"
	} catch (error) {
		return { threw: (error as Error).constructor, message: (error as Error).message }
	}
}

describe("projectStoredGrants", () => {
	test.each(Object.entries(VALID))("a stored %s grant the wallet wrote reads back unchanged", (_type, request) => {
		const record = { capability: projectKnownCapability(request), grantedAt: 7 }
		expect(projectStoredGrants([record])).toEqual([record])
	})

	test("a capability of no known type passes untouched, and no grants read as none", () => {
		const records = [
			{ capability: { type: "future", anything: [1] }, grantedAt: 1 },
			{ capability: "x", grantedAt: 1 },
		]
		expect(projectStoredGrants(records)).toEqual(records)
		expect(projectStoredGrants(undefined)).toEqual([])
	})

	test.each([
		["a record that is not an object", "grant", "Malformed capability"],
		["a record without a capability", { grantedAt: 1 }, "Malformed capability"],
		[
			"a contracts list that is not an array",
			{ capability: { type: "contracts", contracts: {}, canRegister: true } },
			"Malformed contracts capability",
		],
		["a null scope pattern", { capability: { type: "transaction", scope: [null] } }, "Malformed transaction capability"],
		[
			"an element String() cannot convert",
			{ capability: { type: "data", privateEvents: { contracts: [{ toString: 1 }] } } },
			"Malformed data capability",
		],
		[
			"a malformed address",
			{ capability: { type: "transaction", scope: [{ contract: "0x1234", function: "transfer" }] } },
			"Malformed transaction capability",
		],
	])("%s refuses the read", (_label, record, message) => {
		expect(refusal([record])).toEqual({ threw: ValidationError, message })
	})

	test("one malformed record refuses the whole read, the valid grants beside it included", () => {
		const valid = { capability: projectKnownCapability(VALID.transaction), grantedAt: 1 }
		const bad = { capability: { type: "transaction", scope: [null] }, grantedAt: 1 }
		expect(refusal([valid, bad])).toEqual({ threw: ValidationError, message: "Malformed transaction capability" })
		expect(refusal([valid])).toBe("read")
	})
})
