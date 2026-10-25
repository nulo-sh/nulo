import { describe, expect, test } from "vitest"
import { REMEMBERED_REQUESTS, createApprovalFilter } from "./approval-filter"

const request = (requestId: string) => ({
	origin: "content-script",
	type: "discovery-request",
	content: { type: "aztec-wallet-discovery", requestId, appId: "app", chainInfo: { chainId: "1", version: "1" } },
})
const approval = (sessionId: string) => ({ origin: "background", type: "discovery-approved", sessionId, content: {} })

describe("createApprovalFilter", () => {
	test("an approval for a discovery this document sent passes, and passes again when repeated", () => {
		const filter = createApprovalFilter()
		filter.sent(request("mine"))
		expect(filter.admits(approval("mine"))).toBe(true)
		expect(filter.admits(approval("mine"))).toBe(true)
	})

	test("an approval for any other id is dropped", () => {
		const filter = createApprovalFilter()
		filter.sent(request("mine"))
		expect(filter.admits(approval("theirs"))).toBe(false)
		expect(createApprovalFilter().admits(approval("mine"))).toBe(false)
	})

	test("the next document's filter drops an approval the navigated-away document passed, and passes its own", () => {
		const before = createApprovalFilter()
		before.sent(request("allowed"))
		expect(before.admits(approval("allowed"))).toBe(true)

		const after = createApprovalFilter()
		after.sent(request("fresh"))
		expect(after.admits(approval("allowed"))).toBe(false)
		expect(after.admits(approval("fresh"))).toBe(true)
	})

	test("the record keeps the newest request ids only", () => {
		const filter = createApprovalFilter()
		for (let i = 0; i <= REMEMBERED_REQUESTS; i++) filter.sent(request(`r${i}`))
		expect(filter.admits(approval("r0"))).toBe(false)
		expect(filter.admits(approval("r1"))).toBe(true)
		expect(filter.admits(approval(`r${REMEMBERED_REQUESTS}`))).toBe(true)
	})

	test("a request sent again counts as the newest", () => {
		const filter = createApprovalFilter()
		filter.sent(request("again"))
		for (let i = 1; i < REMEMBERED_REQUESTS; i++) filter.sent(request(`r${i}`))
		filter.sent(request("again"))
		filter.sent(request("one-more"))
		expect(filter.admits(approval("again"))).toBe(true)
		expect(filter.admits(approval("r1"))).toBe(false)
	})

	test("every other background message passes untouched (control)", () => {
		const filter = createApprovalFilter()
		for (const type of ["key-exchange-response", "secure-response", "session-disconnected", "pong"]) {
			expect(filter.admits({ origin: "background", type, sessionId: "unseen" })).toBe(true)
		}
	})
})
