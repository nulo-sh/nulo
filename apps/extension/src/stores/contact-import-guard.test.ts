import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createContactImportGuard, IMPORT_LOCK_HOLD_MS } from "./contact-import-guard"

let guard: ReturnType<typeof createContactImportGuard>

beforeEach(() => {
	vi.useFakeTimers()
	guard = createContactImportGuard()
})
afterEach(() => {
	vi.useRealTimers()
})

const state = () => ({ running: guard.contactImports.value.size, holds: guard.lockHeldByImport.value })

describe("contact import guard", () => {
	test("an import holds Lock for two minutes, then still runs but no longer holds", () => {
		guard.beginContactImport()
		expect(state()).toEqual({ running: 1, holds: true })
		vi.advanceTimersByTime(IMPORT_LOCK_HOLD_MS - 1)
		expect(state()).toEqual({ running: 1, holds: true })
		vi.advanceTimersByTime(1)
		expect(state()).toEqual({ running: 1, holds: false })
	})

	test("control: an import that ends before its deadline releases at once, and its timer changes nothing later", () => {
		const end = guard.beginContactImport()
		end()
		expect(state()).toEqual({ running: 0, holds: false })
		vi.advanceTimersByTime(IMPORT_LOCK_HOLD_MS)
		expect(state()).toEqual({ running: 0, holds: false })
		expect(vi.getTimerCount()).toBe(0)
	})

	test("an import begun while another runs never extends the hold past the first one's two minutes", () => {
		const endFirst = guard.beginContactImport()
		vi.advanceTimersByTime(119_000)
		const endSecond = guard.beginContactImport()
		vi.advanceTimersByTime(1_000)
		expect(state()).toEqual({ running: 2, holds: false })
		endFirst()
		expect(state()).toEqual({ running: 1, holds: false })
		endSecond()
		expect(state()).toEqual({ running: 0, holds: false })
	})

	test("the hold ends with the last running import, and each end removes only its own entry", () => {
		const endFirst = guard.beginContactImport()
		const endSecond = guard.beginContactImport()
		endSecond()
		endSecond()
		expect(state()).toEqual({ running: 1, holds: true })
		endFirst()
		expect(state()).toEqual({ running: 0, holds: false })
		expect(vi.getTimerCount()).toBe(0)
	})

	test("an import begun after the others ended holds afresh", () => {
		guard.beginContactImport()()
		const end = guard.beginContactImport()
		vi.advanceTimersByTime(IMPORT_LOCK_HOLD_MS - 1)
		expect(state()).toEqual({ running: 1, holds: true })
		end()
	})

	test("after the seal, a sealed import's late end and the old timer touch nothing a newer import holds", () => {
		const endSealed = guard.beginContactImport()
		vi.advanceTimersByTime(60_000)
		guard.resetContactImports()
		expect(state()).toEqual({ running: 0, holds: false })
		expect(vi.getTimerCount()).toBe(0)

		guard.beginContactImport()
		endSealed()
		vi.advanceTimersByTime(IMPORT_LOCK_HOLD_MS - 1)
		expect(state()).toEqual({ running: 1, holds: true })
		vi.advanceTimersByTime(1)
		expect(state()).toEqual({ running: 1, holds: false })
	})
})
