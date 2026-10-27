import { deferred } from "@nulo/wallet-core/utils"
import { describe, expect, test } from "vitest"
import { reactive, ref } from "vue"
import type { ToastState } from "@/composables/toast"
import { createLockedState, watchLockStart } from "./locked-state"
import { createScopeEpochHandlers } from "./scope-epoch"

const p1 = { id: "p1" }
const p2 = { id: "p2" }
const p3 = { id: "p3" }

function shell(profiles = [p1], { lastActiveId = "p1" as string | undefined, routeName = "popup-auth" } = {}) {
	const store = reactive({
		isLogined: true,
		open: "p1",
		selected: p1 as { id: string } | undefined,
		chooser: false,
		lastActiveId,
		routeName,
		scopeEpoch: 0,
		profiles,
		activity: 3,
		inFlight: 1,
		imports: 1,
		popups: 1,
	})
	const toast = ref<ToastState | null>({ id: 1, kind: "success", label: "Received 5 USDC" })
	const routes: string[] = []
	const { onLocked } = createScopeEpochHandlers({
		bumpEpoch: () => {
			store.scopeEpoch++
		},
		toast,
		closeToast: () => {
			toast.value = null
		},
	})
	const locked = createLockedState<{ id: string }>({
		closePopups: () => {
			store.popups = 0
		},
		onLocked,
		markLocked: () => {
			store.isLogined = false
		},
		clearActivity: () => {
			store.activity = 0
		},
		resetInFlight: () => {
			store.inFlight = 0
		},
		resetContactImports: () => {
			store.imports = 0
		},
		openProfileId: () => (store.isLogined ? store.open : undefined),
		cachedProfiles: () => store.profiles,
		setProfiles: (next) => {
			store.profiles = next
		},
		route: (path) => routes.push(path),
		selectedId: () => store.selected?.id,
		select: (profile) => {
			store.selected = profile
		},
		readLastActiveId: async () => store.lastActiveId,
		routeName: () => store.routeName,
		openChooser: () => {
			store.chooser = true
		},
	})
	return { store, toast, routes, onLocked, ...locked }
}

function expectSealed(s: ReturnType<typeof shell>) {
	expect(s.toast.value).toBeNull()
	expect(s.store.scopeEpoch).toBeGreaterThan(0)
	expect(s.store).toMatchObject({ isLogined: false, activity: 0, inFlight: 0, imports: 0, popups: 0 })
}

describe("a session opened without a lock", () => {
	test("clears the import entries an earlier session left, and seals nothing else", () => {
		const s = shell()
		s.onSessionOpened("p1")
		expect(s.store).toMatchObject({ isLogined: true, activity: 3, inFlight: 1, imports: 0, popups: 1 })
		expect(s.toast.value).not.toBeNull()
		expect(s.routes).toEqual([])
	})

	test("closes every sheet when it opens over the lock screen or another profile", () => {
		const locked = shell()
		locked.store.isLogined = false
		locked.onSessionOpened("p1")
		expect(locked.store.popups).toBe(0)

		const other = shell()
		other.onSessionOpened("p2")
		expect(other.store.popups).toBe(0)
	})

	test("keeps the sheets of a page that needs no profile, whose flow owns them", () => {
		for (const routeName of ["popup-import", "popup-profile-new", "popup-register"]) {
			const s = shell([p1], { routeName })
			s.store.isLogined = false
			s.onSessionOpened("p2")
			expect(s.store.popups).toBe(1)
		}
	})
})

describe("the lock event", () => {
	test("seals the popup before its profile lookup answers, and lands once it does", async () => {
		const s = shell()
		const lookup = deferred<{ id: string }[]>()
		const done = s.onLockEvent(
			() => lookup.promise,
			() => true,
		)

		expectSealed(s)
		expect(s.routes).toEqual([])

		lookup.resolve([])
		await done
		expect(s.store.profiles).toEqual([])
		expect(s.routes).toEqual(["/popup/register"])
	})

	test("a newer profile event supersedes the landing, never the seal", async () => {
		const s = shell()
		const lookup = deferred<{ id: string }[]>()
		let current = true
		const done = s.onLockEvent(
			() => lookup.promise,
			() => current,
		)
		expectSealed(s)

		current = false
		lookup.resolve([])
		await done
		expect(s.store.profiles).toEqual([p1])
		expect(s.routes).toEqual([])
	})

	test("a rejected lookup lands on the cached list", async () => {
		const s = shell()
		const lookup = deferred<{ id: string }[]>()
		const done = s.onLockEvent(
			() => lookup.promise,
			() => true,
		)
		lookup.reject(new Error("port closed"))
		await done
		expectSealed(s)
		expect(s.routes).toEqual(["/popup/auth"])
	})
})

describe("a list that no longer holds the selected profile", () => {
	const lockedShell = (...args: Parameters<typeof shell>) => {
		const s = shell(...args)
		s.store.isLogined = false
		return s
	}

	test("the lock event selects the last active profile, else the only one, else lets the window choose", async () => {
		const lastActive = shell([p1, p2, p3], { lastActiveId: "p3" })
		await lastActive.onLockEvent(
			async () => [p2, p3],
			() => true,
		)
		expect(lastActive.store.selected).toEqual(p3)
		expect([lastActive.routes, lastActive.store.chooser]).toEqual([["/popup/auth"], false])

		const only = shell([p1, p2])
		await only.onLockEvent(
			async () => [p2],
			() => true,
		)
		expect(only.store.selected).toEqual(p2)

		const none = shell([p1, p2, p3])
		await none.onLockEvent(
			async () => [p2, p3],
			() => true,
		)
		expect(none.store.selected).toBeUndefined()
		expect([none.routes, none.store.chooser]).toEqual([["/popup/auth"], true])
	})

	test("the lock event keeps a selection the list still holds, and lands on register when the list is empty", async () => {
		const kept = shell([p1, p2], { lastActiveId: "p2" })
		await kept.onLockEvent(
			async () => [p1, p2],
			() => true,
		)
		expect([kept.store.selected, kept.store.chooser]).toEqual([p1, false])

		const empty = shell()
		await empty.onLockEvent(
			async () => [],
			() => true,
		)
		expect(empty.store.selected).toBeUndefined()
		expect(empty.routes).toEqual(["/popup/register"])

		const none = shell([p1, p2])
		none.store.selected = undefined
		await none.onLockEvent(
			async () => [p2],
			() => true,
		)
		expect([none.store.selected, none.store.chooser, none.routes]).toEqual([undefined, false, ["/popup/auth"]])
	})

	test("a locked window's check closes its sheets and lands it as a lock does, and says the profile was followed", async () => {
		const s = lockedShell([p1, p2], { routeName: "popup-settings-security-reset" })
		expect(
			await s.checkSelection(
				async () => [p2],
				() => true,
			),
		).toBe("followed")
		expect([s.store.selected, s.store.profiles, s.routes, s.store.popups]).toEqual([p2, [p2], ["/popup/auth"], 0])

		const last = lockedShell()
		expect(
			await last.checkSelection(
				async () => [],
				() => true,
			),
		).toBe("followed")
		expect([last.store.selected, last.routes]).toEqual([undefined, ["/popup/register"]])
	})

	test("a window with no selection checks too: the deletion that leaves no profile lands it on register", async () => {
		const s = lockedShell([p2])
		s.store.selected = undefined
		expect(
			await s.checkSelection(
				async () => [],
				() => true,
			),
		).toBe("followed")
		expect(s.routes).toEqual(["/popup/register"])
	})

	test("on a page that needs no profile, the check changes the selection and nothing else", async () => {
		const s = lockedShell([p1, p2], { routeName: "popup-profile-new" })
		expect(
			await s.checkSelection(
				async () => [p2],
				() => true,
			),
		).toBe("followed")
		expect([s.store.selected, s.routes, s.store.chooser, s.store.popups]).toEqual([p2, [], false, 1])
	})

	test("a selection still listed, a lock, an unlock or another selection meanwhile, and a failed read change nothing", async () => {
		const present = lockedShell([p1, p2])
		expect(
			await present.checkSelection(
				async () => [p1, p2],
				() => true,
			),
		).toBe("present")

		const unlocked = lockedShell()
		const read = deferred<{ id: string }[]>()
		const pending = unlocked.checkSelection(
			() => read.promise,
			() => true,
		)
		unlocked.store.isLogined = true
		read.resolve([p2])
		expect(await pending).toBe("superseded")

		const moved = lockedShell([p1, p2, p3])
		const movedRead = deferred<{ id: string }[]>()
		const movedPending = moved.checkSelection(
			() => movedRead.promise,
			() => true,
		)
		moved.store.selected = p3
		movedRead.resolve([p2, p3])
		expect(await movedPending).toBe("superseded")

		const locked = lockedShell()
		expect(
			await locked.checkSelection(
				async () => [p2],
				() => false,
			),
		).toBe("superseded")

		const failed = lockedShell()
		expect(
			await failed.checkSelection(
				async () => Promise.reject(new Error("port closed")),
				() => true,
			),
		).toBe("unread")

		for (const s of [present, unlocked, moved, locked, failed]) expect([s.routes, s.store.popups]).toEqual([[], 1])
		expect([present.store.selected, unlocked.store.selected, moved.store.selected]).toEqual([p1, p1, p3])
	})
})

describe("the header's Lock", () => {
	test("closes the snack and moves the epoch in the same tick as the mark", () => {
		const s = shell()
		const stop = watchLockStart(() => s.store.isLogined, s.onLocked)
		s.store.isLogined = false
		expect(s.toast.value).toBeNull()
		expect(s.store.scopeEpoch).toBe(1)
		stop()
	})

	test("an unlock moves nothing", () => {
		const s = shell()
		s.store.isLogined = false
		const stop = watchLockStart(() => s.store.isLogined, s.onLocked)
		s.store.isLogined = true
		expect(s.toast.value).not.toBeNull()
		expect(s.store.scopeEpoch).toBe(0)
		stop()
	})
})
