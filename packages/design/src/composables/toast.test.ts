import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SUCCESS_TOAST_MS, type ToastOptions, useToast } from "./toast"

describe("useToast", () => {
	beforeEach(() => vi.useFakeTimers())
	afterEach(() => {
		// Reset the module-scope singleton between tests.
		useToast().closeToast()
		vi.useRealTimers()
	})

	it("a success is visible at 5.9 s and gone at 6 s", () => {
		const { toast, openToast } = useToast()
		openToast({ kind: "success", label: "Copied" })
		expect(SUCCESS_TOAST_MS).toBe(6_000)
		vi.advanceTimersByTime(5_900)
		expect(toast.value).toMatchObject({ kind: "success", label: "Copied" })
		vi.advanceTimersByTime(100)
		expect(toast.value).toBeNull()
	})

	it("a hold at 2 s stops the timer; a release resumes the remaining 4 s", () => {
		const { toast, openToast, holdToast } = useToast()
		openToast({ kind: "success", label: "Held" })
		vi.advanceTimersByTime(2_000)
		holdToast(true)
		vi.advanceTimersByTime(60_000)
		expect(toast.value).not.toBeNull()
		holdToast(false)
		vi.advanceTimersByTime(3_999)
		expect(toast.value).not.toBeNull()
		vi.advanceTimersByTime(1)
		expect(toast.value).toBeNull()
	})

	it("a repeated hold or release changes nothing", () => {
		const { toast, openToast, holdToast } = useToast()
		openToast({ kind: "success", label: "Held" })
		vi.advanceTimersByTime(1_000)
		holdToast(true)
		vi.advanceTimersByTime(1_000)
		holdToast(true)
		vi.advanceTimersByTime(1_000)
		holdToast(false)
		vi.advanceTimersByTime(2_000)
		holdToast(false)
		vi.advanceTimersByTime(2_999)
		expect(toast.value).not.toBeNull()
		vi.advanceTimersByTime(1)
		expect(toast.value).toBeNull()
	})

	it("an error has no timer and stays after any time, held or not", () => {
		const { toast, openToast, holdToast } = useToast()
		openToast({ kind: "error", label: "Failed" })
		vi.advanceTimersByTime(600_000)
		holdToast(true)
		holdToast(false)
		vi.advanceTimersByTime(600_000)
		expect(toast.value).toMatchObject({ kind: "error", label: "Failed" })
	})

	it("an info keeps its kind and, like an error, stays after any time, held or not", () => {
		const { toast, openToast, holdToast } = useToast()
		openToast({ kind: "info", label: "Checking" })
		expect(toast.value?.kind).toBe("info")
		vi.advanceTimersByTime(600_000)
		holdToast(true)
		holdToast(false)
		vi.advanceTimersByTime(600_000)
		expect(toast.value).toMatchObject({ kind: "info", label: "Checking" })
	})

	it("a missing or unknown kind is an error", () => {
		const { toast, openToast } = useToast()
		openToast({ label: "Unknown" } as unknown as ToastOptions)
		expect(toast.value?.kind).toBe("error")
		vi.advanceTimersByTime(600_000)
		expect(toast.value).not.toBeNull()
		openToast({ kind: "warning", label: "Odd" } as unknown as ToastOptions)
		expect(toast.value?.kind).toBe("error")
	})

	it("a new open replaces the current one, clears its timer and gets a new id", () => {
		const { toast, openToast } = useToast()
		openToast({ kind: "success", label: "First" })
		const first = toast.value?.id
		vi.advanceTimersByTime(5_000)
		openToast({ kind: "success", label: "First" })
		expect(toast.value?.id).not.toBe(first)
		vi.advanceTimersByTime(5_999)
		expect(toast.value).toMatchObject({ label: "First" })
		vi.advanceTimersByTime(1)
		expect(toast.value).toBeNull()
	})

	it("a hold taken on the old snack does not carry into the replacement", () => {
		const { toast, openToast, holdToast } = useToast()
		openToast({ kind: "success", label: "First" })
		holdToast(true)
		openToast({ kind: "success", label: "Second" })
		vi.advanceTimersByTime(6_000)
		expect(toast.value).toBeNull()
	})

	it("closeToast clears the hold and is a no-op on nothing", () => {
		const { toast, openToast, closeToast, holdToast } = useToast()
		closeToast()
		expect(toast.value).toBeNull()
		openToast({ kind: "success", label: "X" })
		holdToast(true)
		closeToast()
		expect(toast.value).toBeNull()
		openToast({ kind: "success", label: "Y" })
		holdToast(false)
		vi.advanceTimersByTime(5_999)
		expect(toast.value).toMatchObject({ label: "Y" })
		vi.advanceTimersByTime(1)
		expect(toast.value).toBeNull()
	})

	it("an update relabels the open snack in place: same id, kind and timer", () => {
		const { toast, openToast, updateToast } = useToast()
		const id = openToast({ kind: "success", label: "One" })
		expect(toast.value?.id).toBe(id)
		vi.advanceTimersByTime(5_000)
		updateToast(id, "Two")
		expect(toast.value).toMatchObject({ id, kind: "success", label: "Two" })
		vi.advanceTimersByTime(1_000)
		expect(toast.value).toBeNull()
	})

	it("an update after a close or a replacement changes nothing and opens nothing", () => {
		const { toast, openToast, updateToast, closeToast } = useToast()
		const closed = openToast({ kind: "info", label: "Importing" })
		closeToast()
		updateToast(closed, "Importing again")
		expect(toast.value).toBeNull()
		const replaced = openToast({ kind: "info", label: "Importing" })
		const next = openToast({ kind: "success", label: "Copied" })
		updateToast(replaced, "Importing again")
		expect(toast.value).toMatchObject({ id: next, label: "Copied" })
	})

	it("carries the sub line and the action through", () => {
		const { toast, openToast } = useToast()
		const onSelect = vi.fn()
		openToast({ kind: "success", label: "Sent", sub: "1 TST to 0x1234…5678", action: { label: "View", onSelect } })
		expect(toast.value).toMatchObject({ sub: "1 TST to 0x1234…5678", action: { label: "View" } })
		expect(toast.value?.action?.onSelect).toBe(onSelect)
	})

	it("is a singleton: two useToast() instances share the same toast ref", () => {
		const a = useToast()
		const b = useToast()
		expect(a.toast).toBe(b.toast)
		a.openToast({ kind: "success", label: "Shared" })
		expect(b.toast.value).toMatchObject({ label: "Shared" })
		b.closeToast()
		expect(a.toast.value).toBeNull()
	})
})
