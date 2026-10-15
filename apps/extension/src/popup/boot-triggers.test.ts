/**
 * What starts a boot run, against the real profile client: a service that never says Ready must end
 * in the mount run's verdict, and a worker refusing ports while it starts must not start runs that
 * supersede it.
 */
import { describe, expect, test, vi } from "vitest"
import { ProfileServiceClient } from "@/wallet/services/profile/client"
import { PROFILE_SERVICE_NAME } from "@/wallet/services/profile/spec"
import { LOOKUP_DEADLINE_MS } from "./auth-guard"
import { resolveBootSession } from "./boot-session"
import { createBootTriggers } from "./boot-triggers"
import { emitPortDisconnect, portRegistry } from "../../tests/vitest.setup"

function triggers(client: ProfileServiceClient, routerReady: () => Promise<unknown> = async () => undefined) {
	const runs: boolean[] = []
	const replay = vi.fn()
	const readSettings = vi.fn(() => new Promise<void>(() => {}))
	let runBoot = async ({ reconnect }: { reconnect: boolean }) => void runs.push(reconnect)
	const boot = createBootTriggers({
		client,
		routerReady,
		readSettings,
		runBoot: (opts) => runBoot(opts),
		replay,
	})
	return {
		boot,
		runs,
		replay,
		readSettings,
		setRun: (fn: typeof runBoot) => {
			runBoot = fn
		},
	}
}

describe("boot triggers", () => {
	test("mount starts the check without waiting for Ready or the settings, whether the first navigation resolves or fails", async () => {
		for (const routerReady of [async () => undefined, async () => Promise.reject(new Error("navigation failed"))]) {
			portRegistry().holdReady = true
			const client = new ProfileServiceClient()
			void client.connect()
			const t = triggers(client, routerReady)
			await t.boot.mount()
			expect(t.readSettings).toHaveBeenCalledTimes(1)
			expect(t.runs).toEqual([false])
			expect(t.replay).toHaveBeenCalledTimes(1)
			t.boot.dispose()
			client.disconnect()
		}
	})

	test("a drop of a Ready port starts a run; a close before Ready and a Ready start none", async () => {
		portRegistry().holdReady = true
		const client = new ProfileServiceClient()
		const t = triggers(client)
		await t.boot.mount()
		void client.connect()

		emitPortDisconnect(PROFILE_SERVICE_NAME)
		await new Promise((r) => setTimeout(r, 300))
		expect(t.runs).toEqual([false])

		portRegistry().ready(PROFILE_SERVICE_NAME)
		await vi.waitFor(() => expect(t.replay).toHaveBeenCalledTimes(2))
		expect(t.runs).toEqual([false])

		emitPortDisconnect(PROFILE_SERVICE_NAME)
		await vi.waitFor(() => expect(t.runs).toEqual([false, true]))
		await vi.waitFor(() => expect(t.replay).toHaveBeenCalledTimes(3))
		t.boot.dispose()
		client.disconnect()
	})

	test("with a service that never says Ready, the mount's run is the only one and ends unreachable at the lookup deadline", async () => {
		vi.useFakeTimers()
		try {
			portRegistry().holdReady = true
			const client = new ProfileServiceClient()
			const t = triggers(client)
			const verdicts: string[] = []
			t.setRun(async ({ reconnect }) => {
				t.runs.push(reconnect)
				const result = await resolveBootSession({
					getProfiles: () => client.getProfiles(),
					getActiveProfile: () => client.getActiveProfile(),
					bootstrap: async () => true,
					lastActiveProfileId: async () => undefined,
					isCurrent: () => true,
				})
				verdicts.push(result.kind)
			})
			const mounted = t.boot.mount()
			// The worker refuses each port while it starts.
			for (let i = 0; i < 20; i++) {
				await vi.advanceTimersByTimeAsync(300)
				emitPortDisconnect(PROFILE_SERVICE_NAME)
			}
			await vi.advanceTimersByTimeAsync(LOOKUP_DEADLINE_MS)
			await mounted
			expect(t.runs).toEqual([false])
			expect(verdicts).toEqual(["unreachable"])
			expect(portRegistry().posted).toEqual([])
			t.boot.dispose()
			client.disconnect()
		} finally {
			vi.useRealTimers()
		}
	})
})
