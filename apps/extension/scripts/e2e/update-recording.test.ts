import { describe, expect, test } from "vitest"
import type { StoredShapeName } from "@/wallet/storage/stored-shapes"
import { committedBaseline } from "@/wallet/storage/stored-shapes/baseline"
import { type Recording, readRecording, recordingProblems } from "../../tests/e2e/fixtures/update/recording"
import { RELEASE_DIGESTS, RELEASE_TRAITS, releaseTraits } from "../../tests/e2e/fixtures/update/release"
import {
	firstAccount,
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

	const sealing = Object.keys(RELEASE_TRAITS).filter((tag) => releaseTraits(tag).storage === "sealed")

	test.each(sealing)("the committed %s recording replays as a sealing release's, and names no URL off this machine", (tag) => {
		const committed = readRecording(tag)
		expect(committed, `no recording of ${tag}`).toBeDefined()
		expect(recordingProblems(committed as Recording, tag, "sealed")).toEqual([])
		// Counted, never listed: an outside endpoint may carry a provider's key. Only plaintext is read.
		const urls = JSON.stringify(committed).match(/\bhttps?:\/\/[^"\s\\]+/g) ?? []
		expect(urls.length).toBeGreaterThan(0)
		expect(urls.filter((url) => !isLoopbackUrl(url)).length).toBe(0)
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
const TESTNET = 685146337
const DIAL = "http://127.0.0.1:4000"
const FIRST = { address: "0xa", chainId: TESTNET, index: 0 }
const SECOND = { address: "0xb", chainId: TESTNET, index: 1 }
/** `SEALED` with a second Testnet account's row. */
const TWO_ACCOUNTS = { ...SEALED, [`nulo:core:accounts@["account","p",${TESTNET},"0xb"]`]: "row" }

/** Reads of a release that stores exactly `TWO_ACCOUNTS`' rows, its second account selected. */
function reads(over: Partial<ReleaseReads> = {}): ReleaseReads {
	const one = [{}]
	return {
		profileId: "p",
		selection: SECOND.address,
		preferences: { pins: {}, picks: { app: {}, send: {} } },
		networks: [{ kind: "testnet", chainId: TESTNET, endpoints: [{ rpcUrl: `${DIAL}/0` }] }],
		accounts: [FIRST, SECOND],
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
	test("accepts reads that count every stored row, select a Testnet account but the first, and dial every origin", () => {
		expect(readsProblems(reads(), TWO_ACCOUNTS, [DIAL], NOW)).toEqual([])
	})

	test("refuses a root read back short", () => {
		const extra = reads({ accounts: [FIRST, SECOND, { address: "0xc", chainId: TESTNET, index: 2 }] })
		expect(readsProblems(extra, TWO_ACCOUNTS, [DIAL], NOW)).toEqual(["accounts: the release read 3 of the 2 rows it stores"])
	})

	test("refuses no selection, one of no Testnet account, and the first one, which a popup that read none opens on", () => {
		expect(readsProblems(reads({ selection: undefined }), TWO_ACCOUNTS, [DIAL], NOW)).toEqual([
			"the release's selection (none) names none of its Testnet accounts",
		])
		expect(readsProblems(reads({ selection: "0xc" }), TWO_ACCOUNTS, [DIAL], NOW)).toEqual([
			"the release's selection 0xc names none of its Testnet accounts",
		])
		expect(readsProblems(reads({ selection: FIRST.address }), TWO_ACCOUNTS, [DIAL], NOW)).toEqual([
			"the release's selection is Testnet's first account, which a popup that read none opens on too: record it again",
		])
	})

	test("refuses a loopback origin the rows name that the recording does not dial, and an expiring session", () => {
		expect(readsProblems(reads(), TWO_ACCOUNTS, ["http://127.0.0.1:4001"], NOW)).toEqual([
			`the release's rows name ${DIAL}, which the recording does not dial`,
		])
		const expiry = NOW + SESSION_MARGIN_MS - 1
		const expiring = reads()
		expiring.rows.dappSessions = [{ expiry }]
		expect(readsProblems(expiring, TWO_ACCOUNTS, [DIAL], NOW)).toEqual([
			`a dApp session expires ${new Date(expiry).toISOString()}: record the release again`,
		])
	})
})

describe("firstAccount", () => {
	test("orders by index, then address", () => {
		const b0 = { address: "0xb", chainId: 1, index: 0 }
		const a0 = { address: "0xa", chainId: 1, index: 0 }
		expect(firstAccount([SECOND, b0, a0])).toBe(a0)
		expect(firstAccount([])).toBeUndefined()
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
