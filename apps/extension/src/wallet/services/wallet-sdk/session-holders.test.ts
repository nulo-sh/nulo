/**
 * The one teardown of what a live session owns, and the fence around it: every holder on the
 * registry is seeded and must be cleared, and every other field of the handler's state names why
 * it is not session-owned.
 */
import { deferred } from "@nulo/wallet-core/utils"
import { describe, expect, test } from "vitest"
import { createSdkHandlerState } from "./background"
import { SessionHolders } from "./session-holders"
import { fakeSdkPorts } from "./test-ports"

type Holder = Exclude<keyof SessionHolders, "end">

/** Gives one holder state for a session, and reads whether it still holds any. */
type Probe = { seed: (h: SessionHolders, id: string) => void; holds: (h: SessionHolders, id: string) => boolean }

function probes(running: Promise<void>): Record<Holder, Probe> {
	return {
		sessionProfiles: { seed: (h, id) => h.sessionProfiles.set(id, `profile-${id}`), holds: (h, id) => h.sessionProfiles.has(id) },
		sessionQueues: { seed: (h, id) => h.sessionQueues.set(id, Promise.resolve()), holds: (h, id) => h.sessionQueues.has(id) },
		establishmentStatus: {
			seed: (h, id) => h.establishmentStatus.set(id, Promise.resolve(true)),
			holds: (h, id) => h.establishmentStatus.has(id),
		},
		holds: { seed: (h, id) => void h.holds.open(id, `hash-${id}`), holds: (h, id) => h.holds.get(id) !== undefined },
		// A running operation and one waiting behind it: `waiting` reads 0 only once the lane is dropped.
		decryptLocks: {
			seed: (h, id) => {
				void h.decryptLocks.withLock(id, () => running)
				void h.decryptLocks.withLock(id, () => undefined)
			},
			holds: (h, id) => h.decryptLocks.waiting(id) > 0,
		},
	}
}

/** Every field of the handler's state beside the registry, and why its life is not the session's. */
const NOT_SESSION_OWNED: Record<string, string> = {
	sessions: "the registry itself",
	pendingVerification: "keyed by discovery request id; its tombstones outlive the session",
	pendingDiscoveryPromises: "keyed by (origin, chainId)",
	dedupeWaiters: "keyed by (origin, chainId)",
	bridge: "keyed by request id, until its connect window closes",
	admission: "keyed by request id; a session's end reaches it through its own onSessionGone",
	late: "handler-lifetime references",
}

describe("SessionHolders", () => {
	test("end clears one session from every holder, drops its hold as wallet_refused, and leaves the other", async () => {
		const running = deferred()
		const holders = new SessionHolders()
		const table = Object.entries(probes(running.promise))
		for (const id of ["a", "b"]) for (const [, probe] of table) probe.seed(holders, id)
		for (const [name, probe] of table) expect({ name, a: probe.holds(holders, "a") }).toEqual({ name, a: true })
		const holdA = holders.holds.get("a")

		holders.end("a")

		for (const [name, probe] of table) {
			expect({ name, a: probe.holds(holders, "a"), b: probe.holds(holders, "b") }).toEqual({ name, a: false, b: true })
		}
		await expect(holdA?.outcome).resolves.toBe("wallet_refused")
		expect(holders.holds.unsettled().map((hold) => hold.sessionId)).toEqual(["b"])
		running.resolve()
	})

	test("every holder on the registry is one the teardown test seeds", () => {
		expect(Object.keys(new SessionHolders()).sort()).toEqual(Object.keys(probes(Promise.resolve())).sort())
	})

	test("every other field of the handler's state is listed as not session-owned", () => {
		expect(Object.keys(createSdkHandlerState(fakeSdkPorts())).sort()).toEqual(Object.keys(NOT_SESSION_OWNED).sort())
	})
})
