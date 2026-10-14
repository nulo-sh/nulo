import { computed, reactive, ref } from "vue"

/** How long running contacts imports keep Lock disabled; after it, Lock asks before stopping them. */
export const IMPORT_LOCK_HOLD_MS = 120_000

/**
 * The window's running contacts imports, one entry each, so overlapping imports never end each
 * other's entry. The hold belongs to the window: it starts with the first running import and an
 * import that begins meanwhile does not restart it, so Lock is never held for more than two minutes
 * in a row.
 */
export function createContactImportGuard() {
	const running = reactive(new Set<symbol>())
	const holding = ref(false)
	let holdTimer: ReturnType<typeof setTimeout> | undefined

	const releaseHold = () => {
		clearTimeout(holdTimer)
		holdTimer = undefined
		holding.value = false
	}

	/** Registers a running import; the returned `end` removes only its own entry, and is a no-op after
	 *  the seal reset the guard. */
	const beginContactImport = (): (() => void) => {
		const id = Symbol("contact import")
		if (running.size === 0) {
			holding.value = true
			holdTimer = setTimeout(() => {
				holdTimer = undefined
				holding.value = false
			}, IMPORT_LOCK_HOLD_MS)
		}
		running.add(id)
		return () => {
			if (!running.delete(id)) return
			if (running.size === 0) releaseHold()
		}
	}

	/** The lock seal: an import whose session ended may still be awaiting the PXE, and must not hold
	 *  Lock in the next session. */
	const resetContactImports = () => {
		running.clear()
		releaseHold()
	}

	return {
		// A getter, not state: the set holds no data the store's state should carry.
		contactImports: computed((): ReadonlySet<symbol> => running),
		lockHeldByImport: computed(() => holding.value),
		beginContactImport,
		resetContactImports,
	}
}
