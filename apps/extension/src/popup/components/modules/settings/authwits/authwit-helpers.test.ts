import { describe, expect, test } from "vitest"
import { type AuthwitContent, authwitAction } from "./authwit-helpers"

const ADDRESS = `0x${"1b".repeat(32)}`
const call = (method: unknown): AuthwitContent => ({ kind: "call", caller: ADDRESS, contract: ADDRESS, method }) as AuthwitContent

describe("authwitAction", () => {
	test.each([
		["transfer_in_public", "Transfer"],
		["burn_public", "Burn"],
		["approve", "Approve"],
		["_private_transfer", "Private"],
	])("a call row's %j reads %j", (method, action) => {
		expect(authwitAction(call(method))).toBe(action)
	})

	test("a method with a bidi override reads without it", () => {
		expect(authwitAction(call("trans‮fer_in_public"))).toBe("Transfer")
	})

	test.each([
		["an encoded call with a name", { kind: "encoded_call", caller: ADDRESS, to: ADDRESS, selector: "0x12345678", name: "transfer" }],
		["an intent", { kind: "intent", consumer: ADDRESS, intent: [] }],
		["a message hash", { kind: "message_hash", messageHash: ADDRESS }],
		["a call with no method", { kind: "call", caller: ADDRESS, contract: ADDRESS }],
		["a call whose method is all underscores", { kind: "call", caller: ADDRESS, contract: ADDRESS, method: "__" }],
	])("%s names no action", (_case, content) => {
		expect(authwitAction(content as AuthwitContent)).toBeNull()
	})
})
