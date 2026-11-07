import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { LogLevel } from "@nulo/wallet-core/logger"
import type { RequestCapture } from "./request-log"
import { browserOf, buildRequestReport, requestReportFileName } from "./request-report"

const T0 = Date.UTC(2026, 10, 7, 12, 0, 0)
const CONTEXT = { walletVersion: "1.2.8", browser: "Chrome 131", networkName: "Local network" }

/** A refused send as the capture holds it: scrubbed text, one tagged line, the envelope it was answered. */
const CAPTURE: RequestCapture = {
	walletTraceId: "1a2b3c4d",
	method: "sendTx",
	originHost: "localhost:5174",
	chainId: 31337,
	startedAt: T0,
	endedAt: T0 + 1_840,
	journalId: "0123456789abcdef",
	journalStage: "failed",
	stages: [
		{ kind: "journal", stage: "journal created", start: T0 + 12, end: T0 + 15 },
		{ kind: "journal", stage: "journal pending", start: T0 + 15, end: T0 + 1_820 },
		{
			kind: "estimate",
			stage: "fee estimate",
			start: T0 + 40,
			end: T0 + 1_790,
			outcome: "failed: Scope violation: call name does not match selector's function",
		},
		{ kind: "journal", stage: "journal failed", start: T0 + 1_820, outcome: "scope_refused" },
		{ kind: "request", stage: "request sendTx", start: T0, end: T0 + 1_840, outcome: "failed 4100 SCOPE_VIOLATION" },
	],
	lines: [
		{
			at: T0 + 1_830,
			context: "sw",
			source: "wallet-sdk",
			level: LogLevel.Debug,
			text: 'Method sendTx failed for session 7f3e {"code":4100,"message":"This request is outside the permissions you gave this app.","data":{"walletErrorCode":"SCOPE_VIOLATION"}} {"walletTraceId":"1a2b3c4d"}',
		},
	],
	dropped: 0,
	bytes: 0,
	journalError: "Scope violation: call name does not match selector's function",
	envelope: {
		code: 4100,
		message: "This request is outside the permissions you gave this app.",
		data: { walletErrorCode: "SCOPE_VIOLATION", walletTraceId: "1a2b3c4d" },
	},
}

describe("buildRequestReport", () => {
	test("matches the golden file byte for byte", () => {
		const golden = readFileSync(join(import.meta.dirname, "request-report.golden.txt"), "utf8")
		expect(buildRequestReport(CAPTURE, CONTEXT)).toBe(golden)
		expect(requestReportFileName(CAPTURE.walletTraceId)).toBe("nulo-request-1a2b3c4d.txt")
	})

	test("renders neither an ANSI escape nor a bidi override held in an outcome or a network name", () => {
		const stages = [{ kind: "task" as const, stage: "Simulating", start: T0, end: T0 + 1, outcome: "failed: \u001b[2J‮boom" }]
		const text = buildRequestReport({ ...CAPTURE, stages }, { ...CONTEXT, networkName: "Local‮\u001b]0;x\u0007" })
		const codes = [...text].map((c) => c.codePointAt(0) ?? 0)
		const unsafe = (c: number) => (c < 0x20 && c !== 0x0a) || c === 0x7f || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)
		expect(codes.filter(unsafe)).toEqual([])
		expect(text).toContain("failed: [2Jboom")
	})

	test("a request with no answer yet ends with (no answer yet)", () => {
		const text = buildRequestReport({ ...CAPTURE, envelope: undefined, endedAt: undefined }, { ...CONTEXT, networkName: undefined })
		expect(text.endsWith("Error envelope\n(no answer yet)\n")).toBe(true)
		expect(text).toContain("Network: unknown\n")
	})

	test.each([
		["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "Chrome 131"],
		["Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0", "Firefox 132"],
		["curl/8", "unknown"],
	])("reads the browser from %s", (agent, browser) => {
		expect(browserOf(agent)).toBe(browser)
	})
})
