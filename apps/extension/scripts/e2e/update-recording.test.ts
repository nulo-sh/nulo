import { describe, expect, test } from "vitest"
import type { StoredShapeName } from "@/wallet/storage/stored-shapes"
import { committedBaseline } from "@/wallet/storage/stored-shapes/baseline"
import { type Recording, readRecording, recordingProblems } from "../../tests/e2e/fixtures/update/recording"
import { RELEASE_DIGESTS, RELEASE_TRAITS, releaseTraits } from "../../tests/e2e/fixtures/update/release"
import {
	isLoopbackUrl,
	loopbackOrigins,
	namedHostCount,
	type ReleaseReads,
	readsProblems,
	SESSION_MARGIN_MS,
} from "../../tests/e2e/fixtures/update/release-reads"
import { missingFamilies } from "../../tests/e2e/fixtures/update/verify"

/** One stored key per committed golden's family, plus the engine's version key no golden carries, as
 *  a populated install holds them, but `without`. */
function storedFamilies(...without: StoredShapeName[]): Record<string, unknown> {
	const goldens = committedBaseline().goldens.filter((golden) => golden.id.endsWith(".minimal") && !without.includes(golden.shape))
	return { "nulo:schema:version": 1, ...Object.fromEntries(goldens.map((golden) => [golden.key, "row"])) }
}

const SEALED = storedFamilies("uiActiveAccount")
const PLAINTEXT = storedFamilies("uiSelectedAccount", "networkSeeded")
const DIALS = ["http://localhost:13022", "http://localhost:8080"]
const recording = (entries: Record<string, unknown>, extra: Partial<Recording> = {}): Recording => ({
	tag: "v1.0.0",
	browser: "chrome",
	entries,
	...extra,
})

describe("release traits", () => {
	test("every release with reviewed digests has reviewed traits, and none has traits alone", () => {
		expect(Object.keys(RELEASE_TRAITS).sort()).toEqual(Object.keys(RELEASE_DIGESTS).sort())
	})

	test("refuses a tag with no reviewed traits", () => {
		expect(() => releaseTraits("v9.9.9")).toThrow("no reviewed traits for v9.9.9")
	})
})

describe("missingFamilies", () => {
	test("a plaintext release holds its selection in plaintext, a sealing one in the sealed row and its offer record", () => {
		expect(missingFamilies(PLAINTEXT, "plaintext")).toEqual([])
		expect(missingFamilies(SEALED, "sealed")).toEqual([])
		expect(missingFamilies(SEALED, "plaintext")).toEqual(["uiActiveAccount"])
		expect(missingFamilies(PLAINTEXT, "sealed")).toEqual(["networkSeeded", "uiSelectedAccount"])
	})
})

describe("recordingProblems", () => {
	test("the committed v0.31.0 recording replays as a plaintext release's, and as no sealing one's", () => {
		const v031 = readRecording("v0.31.0") as Recording
		expect(recordingProblems(v031, "v0.31.0", "plaintext")).toEqual([])
		expect(recordingProblems(v031, "v0.31.0", "sealed")).toEqual([
			"the recording of v0.31.0 holds no networkSeeded, uiSelectedAccount: record it again",
			"the recording of v0.31.0 names no loopback dials: record it again",
		])
	})

	test("a sealing release's recording must hold its selection row and name loopback dials", () => {
		expect(recordingProblems(recording(SEALED, { dials: DIALS }), "v1.0.0", "sealed")).toEqual([])
		const noSelection = storedFamilies("uiActiveAccount", "uiSelectedAccount")
		expect(recordingProblems(recording(noSelection, { dials: DIALS }), "v1.0.0", "sealed")).toEqual([
			"the recording of v1.0.0 holds no uiSelectedAccount: record it again",
		])
		for (const dials of [undefined, [], ["https://example.com:443"], ["http://localhost:13022/path"]]) {
			expect(recordingProblems(recording(SEALED, { dials }), "v1.0.0", "sealed")).toEqual([
				"the recording of v1.0.0 names no loopback dials: record it again",
			])
		}
	})

	test("refuses a recording of another release or browser, and dials on a plaintext release's", () => {
		const other = recording(PLAINTEXT, { tag: "v0.31.0", browser: "firefox", dials: DIALS })
		expect(recordingProblems(other, "v1.0.0", "plaintext")).toEqual([
			"the recording names v0.31.0, not v1.0.0",
			"the recording was made from firefox, not Chrome",
			"a plaintext release's recording names no dials: the replay moves its endpoints itself",
		])
	})
})

const NOW = 1_800_000_000_000
const account = (address: string) => ({ address })

/** Reads of a release that stores exactly `SEALED`'s rows: one per family it reads. */
function reads(over: Partial<ReleaseReads> = {}): ReleaseReads {
	const one = [{}]
	return {
		profileId: "p",
		selection: "0xa",
		preferences: { pins: {}, picks: { app: {}, send: {} } },
		networks: [{}],
		accounts: [account("0xa")],
		rows: {
			contacts: one,
			dappSessions: [{ expiry: NOW + SESSION_MARGIN_MS + 1 }],
			txs: one,
			journal: one,
			tokens: one,
			fpcs: one,
			tokenBalances: one,
			incomingTransfers: one,
			incomingTrust: one,
		},
		...over,
	}
}

describe("readsProblems", () => {
	test("accepts reads that count every stored row and name a selection among their accounts", () => {
		expect(readsProblems(reads(), SEALED, NOW)).toEqual([])
	})

	test("refuses a root read back short, no selection, a selection of no account, and an expiring session", () => {
		const short = reads({ accounts: [account("0xa"), account("0xb")] })
		expect(readsProblems(short, SEALED, NOW)).toEqual(["accounts: the release read 2 of the 1 rows it stores"])
		expect(readsProblems(reads({ selection: undefined }), SEALED, NOW)).toEqual([
			"the release's selection (none) names none of its accounts",
		])
		expect(readsProblems(reads({ selection: "0xc" }), SEALED, NOW)).toEqual(["the release's selection 0xc names none of its accounts"])
		const expiry = NOW + SESSION_MARGIN_MS - 1
		const expiring = reads()
		expiring.rows.dappSessions = [{ expiry }]
		expect(readsProblems(expiring, SEALED, NOW)).toEqual([
			`a dApp session expires ${new Date(expiry).toISOString()}: record the release again`,
		])
	})
})

describe("loopbackOrigins", () => {
	test("names each loopback origin once, sorted, and no other host", () => {
		const rows = {
			networks: [{ endpoints: [{ rpcUrl: "http://localhost:13022" }, { rpcUrl: "https://node.example.com/v1/k" }] }],
			txs: [{ submittedEndpointUrl: "http://localhost:13022/" }],
			sessions: [{ url: "http://127.0.0.1:25908/app" }, { url: "http://localhost.example.com:80" }],
		}
		expect(loopbackOrigins(rows)).toEqual(["http://127.0.0.1:25908", "http://localhost:13022"])
	})
})

describe("isLoopbackUrl and namedHostCount", () => {
	test("a URL is on this machine by its host, not by a prefix of it", () => {
		expect(isLoopbackUrl("http://127.0.0.1:4000/0")).toBe(true)
		expect(isLoopbackUrl("http://localhost:8080")).toBe(true)
		expect(isLoopbackUrl("http://localhost.example.com")).toBe(false)
		expect(isLoopbackUrl("not a url")).toBe(false)
	})

	test("counts each moved host a value still names, once", () => {
		const moved = ["https://node.example.com/v1/k", "https://node.example.com/v2/j", "https://other.example.org/"]
		expect(namedHostCount({ endpoints: [{ rpcUrl: "http://127.0.0.1:4000/0" }] }, moved)).toBe(0)
		expect(namedHostCount({ txs: [{ endpoint: "https://node.example.com/v1/k" }], note: "node.example.com" }, moved)).toBe(1)
	})
})
