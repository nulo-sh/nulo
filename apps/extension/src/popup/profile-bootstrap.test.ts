/**
 * A/B interleaving pins for the shell's bootstrap outcome channel: a run
 * superseded mid-await must commit nothing — neither the failure record, its
 * clear, nor the toast.
 */
import { deferred } from "@nulo/wallet-core/utils"
import { describe, expect, test, vi } from "vitest"
import { runFencedBootstrap, type FencedBootstrapDeps } from "./profile-bootstrap"

function makeDeps(over: Partial<FencedBootstrapDeps> = {}) {
	const setFailure = vi.fn()
	const toast = vi.fn()
	const deps: FencedBootstrapDeps = {
		profileId: "pA",
		bootstrap: async () => {},
		isCurrent: () => true,
		setFailure,
		readFailure: () => null,
		shouldToast: () => true,
		toast,
		...over,
	}
	return { deps, setFailure, toast }
}

describe("runFencedBootstrap", () => {
	test("current success clears the failure record", async () => {
		const h = makeDeps()
		await runFencedBootstrap(h.deps)
		expect(h.setFailure).toHaveBeenCalledWith(null)
		expect(h.toast).not.toHaveBeenCalled()
	})

	test("current failure writes the identity-keyed record and toasts", async () => {
		const h = makeDeps({ bootstrap: async () => Promise.reject(new Error("boom")) })
		vi.spyOn(console, "error").mockImplementation(() => {})
		await runFencedBootstrap(h.deps)
		expect(h.setFailure).toHaveBeenCalledWith({ profileId: "pA", message: "boom" })
		expect(h.toast).toHaveBeenCalled()
	})

	test("STALE success (B superseded A mid-await) does not clear B's record", async () => {
		const gate = deferred()
		let current = true
		const h = makeDeps({ bootstrap: () => gate.promise, isCurrent: () => current })
		const run = runFencedBootstrap(h.deps)
		current = false // B's event bumped the seq while A awaited
		gate.resolve()
		await run
		expect(h.setFailure).not.toHaveBeenCalled()
	})

	test("STALE failure (B superseded A mid-await) writes nothing and never toasts", async () => {
		const gate = deferred()
		let current = true
		const h = makeDeps({ bootstrap: () => gate.promise, isCurrent: () => current })
		vi.spyOn(console, "error").mockImplementation(() => {})
		const run = runFencedBootstrap(h.deps)
		current = false
		gate.reject(new Error("late A failure"))
		await run
		expect(h.setFailure).not.toHaveBeenCalled()
		expect(h.toast).not.toHaveBeenCalled()
	})

	test("current failure with shouldToast false stays silent but still records", async () => {
		const h = makeDeps({
			bootstrap: async () => Promise.reject(new Error("x")),
			shouldToast: () => false,
		})
		vi.spyOn(console, "error").mockImplementation(() => {})
		await runFencedBootstrap(h.deps)
		expect(h.setFailure).toHaveBeenCalledWith({ profileId: "pA", message: "x" })
		expect(h.toast).not.toHaveBeenCalled()
	})

	test("non-Error rejection is stringified into the record", async () => {
		const h = makeDeps({ bootstrap: async () => Promise.reject("raw string") })
		vi.spyOn(console, "error").mockImplementation(() => {})
		await runFencedBootstrap(h.deps)
		expect(h.setFailure).toHaveBeenCalledWith({ profileId: "pA", message: "raw string" })
	})

	describe("an earlier failure record at entry", () => {
		/** A record channel the run reads and writes, and what it held when the bootstrap started. */
		type FailureRecord = { profileId: string; message: string } | null
		function withRecord(initial: FailureRecord) {
			let record = initial
			let atBootstrap: FailureRecord | undefined
			const h = makeDeps({
				readFailure: () => record,
				setFailure: (next) => {
					record = next
				},
				bootstrap: () => {
					atBootstrap = record
					return deferred().promise
				},
			})
			return { h, atBootstrap: () => atBootstrap }
		}

		test("its own profile's record is retired before the bootstrap starts", () => {
			const r = withRecord({ profileId: "pA", message: "earlier" })
			void runFencedBootstrap(r.h.deps)
			expect(r.atBootstrap()).toBeNull()
		})

		test("control: another profile's record stays", () => {
			const r = withRecord({ profileId: "pB", message: "theirs" })
			void runFencedBootstrap(r.h.deps)
			expect(r.atBootstrap()).toEqual({ profileId: "pB", message: "theirs" })
		})
	})
})
