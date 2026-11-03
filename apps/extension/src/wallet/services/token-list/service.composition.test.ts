// @vitest-environment node
// Node, not jsdom: the fetch fake answers with real `Response` streams, which the size cap reads.
/**
 * Composition test: the REAL TokenListService and LegalAcceptanceService in one ServiceCollection,
 * on FakeBrowserApi storage and alarms, against a scripted `fetch` and per-run Ed25519 keys. No PXE,
 * no bb, no network. See `apps/extension/tests/COMPOSITION-TESTS.md`.
 */
import { BUNDLED_TOKEN_CLASS_IDS, type PinnedKey, SEQUENCE_FLOOR } from "@nulo/token-list"
import { importSeed, publicKeyOf, signEnvelope } from "@nulo/token-list/envelope"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { fakeBrowser } from "@webext-core/fake-browser"
import { afterEach, describe, expect, test, vi } from "vitest"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { LegalAcceptanceService } from "@/wallet/services/legal/service"
import {
	FAILURE_BACKOFF_MS,
	type FetchLike,
	type RefreshOutcome,
	TOKEN_LIST_REFRESH_ALARM_NAME,
	TokenListService,
	type TokenListSnapshot,
	decodeTokenListState,
	nextAttemptAt,
} from "./service"

const URL = "https://tokens.example/v1/list.json"
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const T0 = 1_760_000_000_000
const aboveFloor = (n: number) => SEQUENCE_FLOOR + n
const FLAGGED = [{ chainId: 7, address: `0x${"2".padStart(64, "0")}` }]

async function signer(keyId = "nulo-ci-1") {
	const seed = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("")
	const privateKey = await importSeed(seed)
	const pinned: PinnedKey = { keyId, publicKey: await publicKeyOf(privateKey) }
	const sign = async (sequence: number, symbol = "USDC") => {
		const payload = {
			format: "nulo-token-list/1",
			sequence,
			issuedAt: new Date(T0).toISOString(),
			tokens: [
				{
					chainId: 7,
					address: `0x${"1".padStart(64, "0")}`,
					classId: BUNDLED_TOKEN_CLASS_IDS[0],
					symbol,
					decimals: 6,
					name: "Test",
				},
			],
			flagged: FLAGGED,
		}
		return JSON.stringify(await signEnvelope(new TextEncoder().encode(JSON.stringify(payload)), privateKey, keyId))
	}
	return { pinned, sign }
}

/** `"stall"` answers only when the request is aborted. */
type Served = { body: string; status?: number } | Error | "stall"

function scriptedFetch(answers: Served[]) {
	const calls: { url: string; init: RequestInit }[] = []
	const fetchFn: FetchLike = async (url, init) => {
		calls.push({ url, init })
		const answer = answers.shift() ?? new Error("no scripted answer")
		if (answer instanceof Error) throw answer
		if (answer === "stall") {
			return new Promise<Response>((_, reject) =>
				init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
			)
		}
		return new Response(answer.body, { status: answer.status ?? 200 })
	}
	return { fetchFn, calls }
}

async function makeHarness(opts: { keys: PinnedKey[]; answers?: Served[]; api?: FakeBrowserApi; accepted?: boolean }) {
	const api = opts.api ?? new FakeBrowserApi()
	if (!opts.api) api.reset()
	const clock = { now: T0 }
	const logger = new LoggerStore(new ConfigStore())
	const outcomes: unknown[] = []
	vi.spyOn(logger, "log").mockImplementation((_source, _level, message, data) => {
		if (message === "token list refresh") outcomes.push((data as { outcome: unknown }).outcome)
	})
	const legal = new LegalAcceptanceService(logger, api, () => clock.now)
	if (opts.accepted) await legal.accept("onboarding")
	const net = scriptedFetch(opts.answers ?? [])
	const service = new TokenListService(logger, api, {
		getSource: async () => ({ url: URL, keys: opts.keys }),
		fetchFn: net.fetchFn,
		now: () => clock.now,
		random: () => 0.5,
	})
	const changes: TokenListSnapshot[] = []
	service.onListChanged.add((snapshot) => changes.push(snapshot))
	const collection = new ServiceCollection()
	collection.add(legal)
	collection.add(service)
	await collection.start()
	await service.booted
	const stored = async () => JSON.parse((await api.storage.local.get("nulo:core:token-list"))["nulo:core:token-list"] as string)
	const alarm = () => fakeBrowser.alarms.get(TOKEN_LIST_REFRESH_ALARM_NAME)
	return { api, legal, service, clock, calls: net.calls, changes, outcomes, stored, alarm }
}

afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe("TokenListService admission", () => {
	test("requests nothing before the Terms are accepted, then fetches on acceptance with no credentials, referrer or HTTP cache", async () => {
		const { pinned, sign } = await signer()
		const h = await makeHarness({ keys: [pinned], answers: [{ body: await sign(aboveFloor(10)) }] })
		await h.service.onAlarmTick()
		expect(await h.service.refresh()).toBe("terms-not-current")
		expect(h.calls).toEqual([])
		expect(await h.alarm()).toBeUndefined()

		await h.legal.accept("onboarding")
		await vi.waitFor(() => expect(h.service.getSnapshot()?.sequence).toBe(aboveFloor(10)))

		expect(h.calls).toEqual([
			{
				url: URL,
				init: expect.objectContaining({ credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", cache: "no-store" }),
			},
		])
		expect(h.calls[0].init.headers).toBeUndefined()
		expect(h.service.getSnapshot()).toMatchObject({ sequence: aboveFloor(10), flagged: FLAGGED })
		expect(h.changes.map((c) => c.sequence)).toEqual([aboveFloor(10)])
	})
})

describe("TokenListService commit", () => {
	test("keeps the held list against an equal, a lower and a forged sequence", async () => {
		const { pinned, sign } = await signer()
		const forger = await signer()
		const h = await makeHarness({
			keys: [pinned],
			accepted: true,
			answers: [
				{ body: await sign(aboveFloor(10)) },
				{ body: await sign(aboveFloor(10), "SAME") },
				{ body: await sign(aboveFloor(9), "OLD") },
				{ body: await forger.sign(aboveFloor(99)) },
			],
		})
		expect(h.service.getSnapshot()?.sequence).toBe(aboveFloor(10))
		const kept = (await h.stored()).envelope
		const results = []
		for (let i = 0; i < 3; i++) results.push(await h.service.refresh())
		expect(results).toEqual(["unchanged", "older-sequence", "refused"])

		expect((await h.stored()).envelope).toBe(kept)
		expect(h.service.getSnapshot()?.entries[0].symbol).toBe("USDC")
		expect(h.changes.map((c) => c.sequence)).toEqual([aboveFloor(10)])
		expect(h.outcomes).toEqual(["accepted", "unchanged", "older-sequence", "refused"])
		expect((await h.stored()).failures).toBe(2)
	})

	test("drops a stored list whose key is no longer pinned, and refetches at boot", async () => {
		const old = await signer("nulo-ci-1")
		const next = await signer("nulo-ci-2")
		const first = await makeHarness({ keys: [old.pinned], accepted: true, answers: [{ body: await old.sign(aboveFloor(10)) }] })
		expect(first.service.getSnapshot()?.sequence).toBe(aboveFloor(10))

		const h = await makeHarness({ keys: [next.pinned], api: first.api, answers: [{ body: await next.sign(aboveFloor(5)) }] })
		expect(h.calls).toHaveLength(1)
		expect(h.service.getSnapshot()).toMatchObject({ sequence: aboveFloor(5), keyId: "nulo-ci-2" })
	})

	test("drops a stored list whose payload no longer matches its signature, and refetches at boot", async () => {
		const { pinned, sign } = await signer()
		const first = await makeHarness({ keys: [pinned], accepted: true, answers: [{ body: await sign(aboveFloor(10)) }] })
		const state = await first.stored()
		const swapped = { ...JSON.parse(state.envelope), payload: JSON.parse(await sign(aboveFloor(10), "EVIL")).payload }
		await first.api.storage.local.set({ "nulo:core:token-list": JSON.stringify({ ...state, envelope: JSON.stringify(swapped) }) })

		const h = await makeHarness({ keys: [pinned], api: first.api, answers: [{ body: await sign(aboveFloor(11)) }] })
		expect(h.calls).toHaveLength(1)
		expect(h.service.getSnapshot()).toMatchObject({ sequence: aboveFloor(11), entries: [expect.objectContaining({ symbol: "USDC" })] })
	})

	test("a fresh install refuses a list below the compiled floor, keeps nothing, and takes one at the floor at its next deadline", async () => {
		const { pinned, sign } = await signer()
		const below = { body: await sign(SEQUENCE_FLOOR - 1) }
		const h = await makeHarness({ keys: [pinned], accepted: true, answers: [below, { body: await sign(SEQUENCE_FLOOR) }] })
		expect(h.calls).toHaveLength(1)
		expect(h.outcomes).toEqual(["refused"])
		expect(h.service.getSnapshot()).toBeUndefined()
		expect(await h.stored()).toEqual({ failures: 1, nextAttemptAt: T0 + FAILURE_BACKOFF_MS[0] })

		h.clock.now = T0 + FAILURE_BACKOFF_MS[0]
		await h.service.onAlarmTick()
		expect(h.service.getSnapshot()?.sequence).toBe(SEQUENCE_FLOOR)
		expect(h.outcomes).toEqual(["refused", "accepted"])
	})

	test("drops a stored list below the compiled floor despite a pending deadline, and refetches at boot", async () => {
		const { pinned, sign } = await signer()
		const api = new FakeBrowserApi()
		api.reset()
		const store = async (sequence: number) => {
			const state = { envelope: await sign(sequence), failures: 0, nextAttemptAt: T0 + HOUR }
			await api.storage.local.set({ "nulo:core:token-list": JSON.stringify(state) })
		}
		await store(SEQUENCE_FLOOR)
		const kept = await makeHarness({ keys: [pinned], api, accepted: true })
		expect(kept.calls).toEqual([])
		expect(kept.service.getSnapshot()?.sequence).toBe(SEQUENCE_FLOOR)

		await store(SEQUENCE_FLOOR - 1)
		const h = await makeHarness({ keys: [pinned], api, answers: [{ body: await sign(aboveFloor(1)) }] })
		expect(h.calls).toHaveLength(1)
		expect(h.service.getSnapshot()?.sequence).toBe(aboveFloor(1))
		expect(h.outcomes).toEqual(["accepted"])
	})

	test("refuses a body over 64 KiB without keeping it", async () => {
		const { pinned, sign } = await signer()
		const h = await makeHarness({
			keys: [pinned],
			accepted: true,
			answers: [{ body: await sign(aboveFloor(10)) }, { body: "x".repeat(64 * 1024 + 1) }],
		})
		await h.service.refresh()
		expect(h.service.getSnapshot()?.sequence).toBe(aboveFloor(10))
		expect(h.outcomes).toEqual(["accepted", "oversize"])
	})
})

describe("TokenListService timing", () => {
	test("one deadline: six hours plus jitter after a list, the backoff ladder after failures", async () => {
		const { pinned, sign } = await signer()
		const h = await makeHarness({
			keys: [pinned],
			accepted: true,
			answers: [{ body: await sign(aboveFloor(10)) }, new TypeError("offline"), { body: "", status: 503 }],
		})
		const regular = T0 + 6 * HOUR + 15 * MINUTE
		expect((await h.stored()).nextAttemptAt).toBe(regular)
		expect((await h.alarm())?.scheduledTime).toBe(regular)

		expect(await h.service.refresh()).toBe("network")
		expect((await h.stored()).nextAttemptAt).toBe(T0 + FAILURE_BACKOFF_MS[0])
		expect(await h.service.refresh()).toBe("http-status")
		expect(await h.stored()).toMatchObject({ failures: 2, nextAttemptAt: T0 + FAILURE_BACKOFF_MS[1] })
		expect((await h.alarm())?.scheduledTime).toBe(T0 + FAILURE_BACKOFF_MS[1])
	})

	test("boot honours a pending backoff, and runs once it has passed", async () => {
		const { pinned, sign } = await signer()
		const first = await makeHarness({ keys: [pinned], accepted: true, answers: [new TypeError("offline")] })
		expect((await first.stored()).nextAttemptAt).toBe(T0 + FAILURE_BACKOFF_MS[0])

		const waiting = await makeHarness({ keys: [pinned], api: first.api, answers: [{ body: await sign(aboveFloor(10)) }] })
		expect(waiting.calls).toEqual([])
		expect((await waiting.alarm())?.scheduledTime).toBe(T0 + FAILURE_BACKOFF_MS[0])

		waiting.clock.now = T0 + FAILURE_BACKOFF_MS[0]
		await waiting.service.onAlarmTick()
		expect(waiting.service.getSnapshot()?.sequence).toBe(aboveFloor(10))
	})

	test("an alarm tick after the boot refresh has finished waits for the deadline that refresh set", async () => {
		const { pinned, sign } = await signer()
		const h = await makeHarness({
			keys: [pinned],
			accepted: true,
			answers: [{ body: "", status: 503 }, { body: await sign(aboveFloor(10)) }],
		})
		expect(h.calls).toHaveLength(1)

		await h.service.onAlarmTick()
		expect(h.calls).toHaveLength(1)
		expect((await h.stored()).failures).toBe(1)
	})

	test("a download that stalls is abandoned after 10 s and counts as a failure", async () => {
		const { pinned, sign } = await signer()
		const h = await makeHarness({ keys: [pinned], accepted: true, answers: [{ body: await sign(aboveFloor(10)) }, "stall"] })
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		const pending = h.service.refresh()
		await vi.advanceTimersByTimeAsync(10_000)
		await pending

		expect(h.outcomes).toEqual(["accepted", "network"])
		expect(await h.stored()).toMatchObject({ failures: 1, nextAttemptAt: T0 + FAILURE_BACKOFF_MS[0] })
	})

	test("a usable answer waits six hours plus up to half an hour", () => {
		expect(nextAttemptAt("accepted", 0, T0, () => 0)).toBe(T0 + 6 * HOUR)
		expect(nextAttemptAt("unchanged", 0, T0, () => 1 - Number.EPSILON)).toBe(T0 + 6 * HOUR + 30 * MINUTE - 1)
	})

	test("a stored deadline up to 26 hours away reads as written, one past it reads as due", () => {
		const read = (due: number) => decodeTokenListState({ nextAttemptAt: due, failures: 0 }, T0).nextAttemptAt
		expect(read(T0 + 26 * HOUR)).toBe(T0 + 26 * HOUR)
		expect(read(T0 + 26 * HOUR + 1)).toBeUndefined()
	})

	test("every deadline the service writes reads back as written", () => {
		const failed: RefreshOutcome[] = ["older-sequence", "refused", "oversize", "http-status", "network"]
		const written = [
			...(["accepted", "unchanged", "verify-unsupported"] as const).map((outcome) =>
				nextAttemptAt(outcome, 0, T0, () => 1 - Number.EPSILON),
			),
			...failed.flatMap((outcome) => [1, 2, 3, 4, 5, 6].map((failures) => nextAttemptAt(outcome, failures, T0, () => 0))),
		]
		for (const due of written) expect(decodeTokenListState({ nextAttemptAt: due, failures: 0 }, T0).nextAttemptAt).toBe(due)
	})

	test("a runtime without Ed25519 waits the regular six hours instead of retrying", async () => {
		const { pinned, sign } = await signer()
		const body = await sign(aboveFloor(10))
		vi.spyOn(crypto.subtle, "importKey").mockRejectedValue(Object.assign(new Error("no Ed25519"), { name: "NotSupportedError" }))
		const h = await makeHarness({ keys: [pinned], accepted: true, answers: [{ body }] })
		expect(h.service.getSnapshot()).toBeUndefined()
		expect(await h.stored()).toMatchObject({ failures: 0, nextAttemptAt: T0 + 6 * HOUR + 15 * MINUTE })
	})

	test("overlapping triggers share one request and its result", async () => {
		const { pinned, sign } = await signer()
		const h = await makeHarness({ keys: [pinned], answers: [{ body: await sign(aboveFloor(10)) }] })
		await h.legal.accept("onboarding")
		const [first, , second] = await Promise.all([h.service.refresh(), h.service.onAlarmTick(), h.service.refresh()])
		expect(h.calls).toHaveLength(1)
		expect([first, second]).toEqual(["accepted", "accepted"])
	})
})

describe("TokenListService — a failed state read never feeds a write", () => {
	const KEY = "nulo:core:token-list"

	/** Counts reads of the stored state; each `arm()` makes the next one reject. */
	function stateReads(api: FakeBrowserApi) {
		const area = api.storage.local
		const realGet = area.get.bind(area)
		const reads = {
			count: 0,
			armed: false,
			arm: () => {
				reads.armed = true
			},
		}
		vi.spyOn(area, "get").mockImplementation(async (...args: Parameters<typeof area.get>) => {
			if (args[0] === KEY) {
				reads.count++
				if (reads.armed) {
					reads.armed = false
					throw new Error("IO error")
				}
			}
			return realGet(...args)
		})
		return reads
	}

	test("a refresh whose read fails fetches and writes nothing, and the next one runs", async () => {
		const { pinned, sign } = await signer()
		const h = await makeHarness({
			keys: [pinned],
			accepted: true,
			answers: [{ body: await sign(aboveFloor(10)) }, { body: await sign(aboveFloor(10)) }],
		})
		const kept = (await h.stored()).envelope
		const reads = stateReads(h.api)

		reads.arm()
		expect(await h.service.refresh()).toBe("error")
		expect(h.calls).toHaveLength(1)
		expect((await h.stored()).envelope).toBe(kept)

		await h.service.refresh()
		expect(h.calls).toHaveLength(2)
		expect(h.outcomes).toEqual(["accepted", "unchanged"])
		expect((await h.stored()).envelope).toBe(kept)
	})

	test("after a failed boot read, a refresh adopts the stored list from one read and refuses an older one", async () => {
		const { pinned, sign } = await signer()
		const first = await makeHarness({ keys: [pinned], accepted: true, answers: [{ body: await sign(aboveFloor(10)) }] })
		const kept = (await first.stored()).envelope
		const reads = stateReads(first.api)
		reads.arm()

		const h = await makeHarness({ keys: [pinned], api: first.api, answers: [{ body: await sign(aboveFloor(9), "OLD") }] })
		expect(h.service.getSnapshot()).toBeUndefined()
		const before = reads.count
		await h.service.refresh()

		expect(reads.count - before).toBe(1)
		expect(h.outcomes).toEqual(["older-sequence"])
		expect(h.service.getSnapshot()).toMatchObject({ sequence: aboveFloor(10), entries: [expect.objectContaining({ symbol: "USDC" })] })
		expect(h.changes.map((c) => c.sequence)).toEqual([aboveFloor(10)])
		expect((await h.stored()).envelope).toBe(kept)
	})
})
