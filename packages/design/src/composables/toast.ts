// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { type Ref, ref } from "vue"

/** How long a success stays open; an info or an error stays until it is closed. */
export const SUCCESS_TOAST_MS = 2_000

/** `info`: an outcome still open, neither a success nor a failure. */
export type ToastKind = "success" | "info" | "error"

export interface ToastAction {
	label: string
	/** Runs after the snack has closed. */
	onSelect: () => void
}

export interface ToastOptions {
	kind: ToastKind
	label: string
	sub?: string
	action?: ToastAction
}

export interface ToastState extends ToastOptions {
	/** Grows on every open, so the same text opened twice renders twice. */
	id: number
}

// Module-scope singleton: ONE transient toast across all useToast() callers AND the region that
// renders it. A second module-level copy would split this ref — a toast opened via one copy would
// not show in a region driven by the other. The extension's composables/toast.{js,d.ts} re-export
// from here so all consumers share this single ref.
const toast: Ref<ToastState | null | undefined> = ref()
let nextId = 0
let closeTm: ReturnType<typeof setTimeout> | undefined
let deadline = 0
let remaining = 0
let held = false

const clearTimer = () => {
	clearTimeout(closeTm)
	closeTm = undefined
	remaining = 0
}

const armTimer = (ms: number) => {
	deadline = Date.now() + ms
	closeTm = setTimeout(() => {
		closeTm = undefined
		toast.value = null
	}, ms)
}

/**
 * One snack at a time. A success closes itself after {@link SUCCESS_TOAST_MS} and waits while
 * the pointer or focus is on it (the region reports that through `holdToast`); an info or an error
 * stays until it is closed. Any other kind is treated as an error, so a message of unknown class
 * never leaves on its own.
 */
export const useToast = () => {
	/** Returns the snack's id, for `updateToast`. */
	const openToast = (options: ToastOptions): number => {
		clearTimer()
		held = false
		const kind: ToastKind = options.kind === "success" || options.kind === "info" ? options.kind : "error"
		toast.value = { ...options, kind, id: ++nextId }
		if (kind === "success") armTimer(SUCCESS_TOAST_MS)
		return nextId
	}

	/** Relabels snack `id` in place, keeping its id and timer, so its card neither leaves nor enters.
	 *  Once that snack is closed or replaced this does nothing: nothing an update does re-opens it. */
	const updateToast = (id: number, label: string) => {
		if (toast.value?.id === id) toast.value = { ...toast.value, label }
	}

	const closeToast = () => {
		clearTimer()
		held = false
		toast.value = null
	}

	/** Pauses a success's close timer while `hold` is true and resumes the remainder after. Repeating
	 *  the same report changes nothing. */
	const holdToast = (hold: boolean) => {
		if (hold === held) return
		held = hold
		if (toast.value?.kind !== "success") return
		if (hold) {
			if (closeTm === undefined) return
			remaining = Math.max(0, deadline - Date.now())
			clearTimeout(closeTm)
			closeTm = undefined
			return
		}
		armTimer(remaining)
	}

	return { toast, openToast, updateToast, closeToast, holdToast }
}
