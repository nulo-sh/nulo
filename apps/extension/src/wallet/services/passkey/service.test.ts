/**
 * Budget pins: the PATH-B window ceiling must cover the two-leg WebAuthn
 * worst case (PRF-on-get authenticators re-run a full `get` leg after
 * `create`), i.e. 2 × PASSKEY_TIMEOUT + slack. The pins target the budget
 * CONTRACT: the derivation relationship AND the value the consumer actually
 * hands the WindowManager — either a constant regression or a hard-coded
 * `timeoutMs` at the call site reds.
 */
import { beforeEach, describe, expect, test, vi } from "vitest"
import { FakeBrowserApi, MockClock } from "@nulo/wallet-core/testing"
import { UserRejectedError } from "@nulo/extension-messaging/errors"
import { PasskeyCredential } from "@nulo/wallet-crypto"
import type { ILogger } from "@/wallet/logger"
import { WindowManager } from "@/wallet/services/window-manager/window-manager"
import { PasskeyService, PASSKEY_TIMEOUT } from "./service"

const noopLogger = { log: () => {} } as unknown as ILogger

describe("PasskeyService PATH-B window budget", () => {
	test("openAndAwait receives a budget covering the two-leg ceremony worst case", async () => {
		const openAndAwait = vi.fn(() => ({
			id: "h1",
			promise: Promise.resolve({ kind: "credential" }),
		}))
		const windowManager = { openAndAwait } as unknown as WindowManager
		const service = new PasskeyService(noopLogger, windowManager)
		vi.spyOn(chrome.runtime, "getURL").mockReturnValue("chrome-extension://x/passkey.html")

		await service.createKey("uh-1", "Profile")

		expect(openAndAwait).toHaveBeenCalledTimes(1)
		const opts = (openAndAwait.mock.calls[0] as unknown[])[0] as { timeoutMs: number }
		expect(opts.timeoutMs).toBe(2 * PASSKEY_TIMEOUT + 60_000)
	})

	// (No separate constant-relationship pin: an earlier draft asserted
	// `2*T + slack > 2*T`, a tautology. The consumer pin above is the real
	// discriminator — it observes the value the WindowManager actually
	// receives, so a hard-coded regression at the call site reds too.)
})

describe("PasskeyService window placement", () => {
	test("the passkey window is not a dApp window: it stays centered", async () => {
		const openAndAwait = vi.fn((_opts: unknown) => ({ handleId: "h1", promise: Promise.resolve({ kind: "credential" }) }))
		const service = new PasskeyService(noopLogger, { openAndAwait } as unknown as WindowManager)
		vi.spyOn(chrome.runtime, "getURL").mockReturnValue("chrome-extension://x/passkey.html")

		await service.createKey("uh-1", "Profile")

		expect(openAndAwait).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "passkey", width: 500, height: 800, placement: "center" }),
		)
	})
})

describe("PasskeyService PATH B requests", () => {
	const data = { credentialId: "cred-1", prfOutput: "cHJm" } as never
	const UNLOCK = { step: "unlock", profileName: "Alice" } as const
	let browser: FakeBrowserApi
	let log: ReturnType<typeof vi.fn>
	let service: PasskeyService
	let removed: ReturnType<typeof vi.spyOn>

	/** Macrotask flush: lets the WindowManager's getLastFocused → create chain land. */
	const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
	const windows = () => browser.windows as unknown as { creates: { url: string }[]; closeByUser: (id: number) => void }
	const requestIdOf = (n: number) => new URL(windows().creates[n].url.replace("#", "")).searchParams.get("requestId") as string
	/** Holds `PasskeyCredential.create` until the returned release runs. */
	function holdMaterialization(): () => void {
		let release!: () => void
		const held = new Promise<void>((resolve) => {
			release = resolve
		})
		vi.mocked(PasskeyCredential.create).mockImplementationOnce(async () => {
			await held
			return { id: "cred-1" } as never
		})
		return release
	}

	beforeEach(() => {
		browser = new FakeBrowserApi()
		browser.reset()
		log = vi.fn()
		const logger = { log } as unknown as ILogger
		service = new PasskeyService(logger, new WindowManager(browser.windows, new MockClock(), logger))
		removed = vi.spyOn(browser.windows, "remove")
		vi.spyOn(chrome.runtime, "getURL").mockImplementation((path: string) => `chrome-extension://x/${path}`)
		vi.spyOn(PasskeyCredential, "create").mockResolvedValue({ id: "cred-1" } as never)
	})

	test("the step gets the credential, and the window stays open until the step says how it ended", async () => {
		const owner = service.getKey("cred-1", UNLOCK)
		await flush()
		const id = requestIdOf(0)
		expect(await service.getPendingRequest(id)).toEqual({ mode: "get", credentialId: "cred-1", step: "unlock", profileName: "Alice" })

		const answered = service.resolvePasskeyRequest(id, data)
		const { credential, finish } = await owner
		expect(credential).toEqual({ id: "cred-1" })
		expect(removed).not.toHaveBeenCalled()

		finish("done")
		finish("failed")
		await expect(answered).resolves.toBe("done")
		expect(removed).not.toHaveBeenCalled()
		await expect(service.getPendingRequest(id)).rejects.toThrow("Invalid request id")
	})

	test("a newer request replaces the open window: the first step is told the user moved on", async () => {
		const first = service.getKey(undefined, UNLOCK).catch((err: unknown) => err)
		await flush()
		const firstId = requestIdOf(0)
		const second = service.createKey("uh-1", "Profile")
		await flush()

		expect(await first).toBeInstanceOf(UserRejectedError)
		expect(removed).toHaveBeenCalledWith(1000)
		await expect(service.getPendingRequest(firstId)).rejects.toThrow("Invalid request id")
		expect(await service.getPendingRequest(requestIdOf(1))).toMatchObject({ mode: "create", userHandle: "uh-1", step: "create" })

		await service.rejectPasskeyRequest(requestIdOf(1))
		await expect(second).rejects.toBeInstanceOf(UserRejectedError)
	})

	test("closing the window is a user cancel, not a raw string", async () => {
		const owner = service.getKey(undefined, UNLOCK)
		await flush()
		windows().closeByUser(1000)
		await expect(owner).rejects.toBeInstanceOf(UserRejectedError)
	})

	test("the window's cancel rejects its step and closes the window", async () => {
		const owner = service.getKey(undefined, UNLOCK)
		await flush()
		await service.rejectPasskeyRequest(requestIdOf(0))
		await expect(owner).rejects.toBeInstanceOf(UserRejectedError)
		expect(removed).toHaveBeenCalledWith(1000)
	})

	test("a late answer for a replaced request is refused and builds no credential", async () => {
		const first = service.getKey(undefined, UNLOCK).catch((err: unknown) => err)
		await flush()
		const firstId = requestIdOf(0)
		const second = service.getKey(undefined, UNLOCK)
		await flush()
		expect(await first).toBeInstanceOf(UserRejectedError)

		await expect(service.resolvePasskeyRequest(firstId, data)).rejects.toThrow("Invalid request id")
		await expect(service.rejectPasskeyRequest(firstId)).rejects.toThrow("Invalid request id")
		expect(PasskeyCredential.create).not.toHaveBeenCalled()

		const answered = service.resolvePasskeyRequest(requestIdOf(1), data)
		;(await second).finish("failed")
		await expect(answered).resolves.toBe("failed")
	})

	test("while the credential is built, a close still rejects the step at once and nothing is handed over", async () => {
		const release = holdMaterialization()
		const owner = service.getKey(undefined, UNLOCK).catch((err: unknown) => err)
		await flush()
		const answered = service.resolvePasskeyRequest(requestIdOf(0), data)

		windows().closeByUser(1000)
		expect(await owner).toBeInstanceOf(UserRejectedError)

		release()
		await expect(answered).resolves.toBe("failed")
	})

	test("while the credential is built, a newer request still replaces it and nothing is handed over", async () => {
		const release = holdMaterialization()
		const owner = service.getKey(undefined, UNLOCK).catch((err: unknown) => err)
		await flush()
		const answered = service.resolvePasskeyRequest(requestIdOf(0), data)

		void service.getKey(undefined, UNLOCK).catch(() => undefined)
		expect(await owner).toBeInstanceOf(UserRejectedError)
		expect(removed).toHaveBeenCalledWith(1000)

		release()
		await expect(answered).resolves.toBe("failed")
	})

	test("a second answer is refused at once while the first hands over exactly once and finishes", async () => {
		const release = holdMaterialization()
		const owner = service.getKey(undefined, UNLOCK)
		await flush()
		const id = requestIdOf(0)
		const answered = service.resolvePasskeyRequest(id, data)

		await expect(service.resolvePasskeyRequest(id, data)).rejects.toThrow("Invalid request id")
		release()
		const { finish } = await owner
		finish("done")
		await expect(answered).resolves.toBe("done")
		expect(PasskeyCredential.create).toHaveBeenCalledTimes(1)
	})

	test("an answer that builds no credential rejects the step at once and closes the window", async () => {
		const bad = new Error("bad PRF output")
		vi.mocked(PasskeyCredential.create).mockRejectedValueOnce(bad)
		const owner = service.getKey(undefined, UNLOCK).catch((err: unknown) => err)
		await flush()

		await expect(service.resolvePasskeyRequest(requestIdOf(0), data)).resolves.toBe("failed")
		expect(await owner).toBe(bad)
		expect(removed).toHaveBeenCalledWith(1000)
	})

	test("the popup comes back after a step that finished, never after one that failed or was cancelled", async () => {
		const fired: string[] = []
		let armed = 0
		const logger = { log } as unknown as ILogger
		service = new PasskeyService(logger, new WindowManager(browser.windows, new MockClock(), logger), () => {
			const step = ++armed
			return async () => {
				fired.push(`step ${step}`)
			}
		})
		for (const outcome of ["done", "failed"] as const) {
			const owner = service.getKey("cred-1", UNLOCK)
			await flush()
			const answered = service.resolvePasskeyRequest(requestIdOf(armed - 1), data)
			;(await owner).finish(outcome)
			await expect(answered).resolves.toBe(outcome)
		}
		const cancelled = service.getKey("cred-1", UNLOCK)
		await flush()
		await service.rejectPasskeyRequest(requestIdOf(2))
		await expect(cancelled).rejects.toBeInstanceOf(UserRejectedError)

		expect(armed).toBe(3)
		expect(fired).toEqual(["step 1"])
	})

	test("no log line carries a request id or a credential id", async () => {
		const resolved = service.getKey(undefined, UNLOCK)
		await flush()
		const resolvedId = requestIdOf(0)
		const answered = service.resolvePasskeyRequest(resolvedId, data)
		;(await resolved).finish("done")
		await answered
		const cancelled = service.getKey(undefined, UNLOCK)
		await flush()
		const cancelledId = requestIdOf(1)
		await service.rejectPasskeyRequest(cancelledId)
		await expect(cancelled).rejects.toBeInstanceOf(UserRejectedError)

		const lines = JSON.stringify(log.mock.calls)
		for (const secret of [resolvedId, cancelledId, "cred-1"]) expect(lines).not.toContain(secret)
	})
})
