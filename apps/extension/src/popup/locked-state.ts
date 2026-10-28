import { watch } from "vue"
import { lockScreenProfile } from "./lock-screen-profile"

/** Pages that need no selected profile, as the route guard leaves them without one. */
const PROFILE_FREE_ROUTES: ReadonlySet<string> = new Set(["popup-register", "popup-import", "popup-profile-new"])

/** Whether `name` is a page that needs no selected profile, whose flow owns the window. */
export const isProfileFreeRoute = (name: unknown) => typeof name === "string" && PROFILE_FREE_ROUTES.has(name)

/** How a check of the window's selected profile against the stored list ended. */
export type SelectionCheck = "present" | "followed" | "superseded" | "unread"

export interface LockedStateShell<P> {
	closePopups: () => void
	/** Ends what a lock ends in the shell: the scope epoch, any snack, the network-switch run. */
	onLocked: () => void
	/** Clears the shell's logged-in mark, and supersedes every activation in flight so none sets it again. */
	markLocked: () => void
	clearActivity: () => void
	resetInFlight: () => void
	resetContactImports: () => void
	/** The profile this window shows unlocked, if any. */
	openProfileId: () => string | undefined
	cachedProfiles: () => P[]
	setProfiles: (profiles: P[]) => void
	route: (path: string) => void
	selectedId: () => string | undefined
	select: (profile: P | undefined) => void
	readLastActiveId: () => Promise<string | undefined>
	routeName: () => string | undefined
	openChooser: () => void
}

/** The seal runs before anything awaits, so no snack stays up and no late result presents while
 *  a lock looks up where to land. */
export function createLockedState<P extends { id: string }>(shell: LockedStateShell<P>) {
	const seal = () => {
		shell.closePopups()
		shell.onLocked()
		shell.markLocked()
		// Switching profiles runs through lock/unlock, so a switch deliberately starts cold.
		shell.clearActivity()
		// The lock cancels the running sends, but the cancel events do not reach this popup; left
		// in place, the rows would refuse every pick on the lock screen.
		shell.resetInFlight()
		shell.resetContactImports()
	}
	/** A selection `profiles` no longer holds gives way to the lock screen's profile; with none to
	 *  presume, the window chooses. No selection stays none, for the route guard to fill. */
	const reselect = (profiles: P[], lastActiveId: string | undefined) => {
		const selected = shell.selectedId()
		if (selected === undefined || profiles.some((p) => p.id === selected)) return false
		const next = lockScreenProfile(profiles, lastActiveId)
		shell.select(next)
		return next === undefined && profiles.length > 0
	}
	const land = (profiles: P[], lastActiveId?: string) => {
		shell.setProfiles(profiles)
		const choose = reselect(profiles, lastActiveId)
		shell.route(profiles.length ? "/popup/auth" : "/popup/register")
		if (choose) shell.openChooser()
	}
	/** Lands a window whose selection is gone. A page that needs no profile only changes the
	 *  selection, as its flow owns the window; any other drops its sheets and lands as a lock does. */
	const follow = (profiles: P[], lastActiveId: string | undefined) => {
		if (PROFILE_FREE_ROUTES.has(shell.routeName() ?? "")) {
			shell.setProfiles(profiles)
			reselect(profiles, lastActiveId)
			return
		}
		shell.closePopups()
		land(profiles, lastActiveId)
	}

	/** Entered where the lock is already known and nothing is left to read. */
	const enter = (profiles: P[]) => {
		seal()
		land(profiles)
	}

	/**
	 * The lock event. A transport rejection of the lookup (worker churn at the moment of a lock)
	 * lands on the cached list, which is enough to pick auth or register; a newer profile event
	 * supersedes the landing, never the seal.
	 */
	const onLockEvent = async (readProfiles: () => Promise<P[]>, isCurrent: () => boolean) => {
		seal()
		// Started with the list but awaited only when the selection is gone: a storage read can queue
		// behind a purge's writes, and a landing that needs no pick never waits for it.
		const lastActiveId = shell.readLastActiveId().catch(() => undefined)
		let profiles = shell.cachedProfiles()
		try {
			profiles = await readProfiles()
		} catch {}
		if (!isCurrent()) return
		const selected = shell.selectedId()
		if (selected === undefined || !profiles.length || profiles.some((p) => p.id === selected)) {
			land(profiles)
			return
		}
		// Past the wait the list is read again, as another profile may have gone meanwhile, and a
		// selection or a page the window moved to meanwhile stands.
		const pick = await lastActiveId
		try {
			profiles = await readProfiles()
		} catch {}
		if (isCurrent() && shell.selectedId() === selected) follow(profiles, pick)
	}

	/**
	 * A locked window's selected profile may be gone: deleted in another window, which closes no
	 * session here, or refused by an action as an unknown id. Gone, the window drops the sheets it
	 * held for it and lands as a lock does, unless it is on a page that needs no profile. A lock, an
	 * unlock or another selection meanwhile supersedes the check.
	 */
	const checkSelection = async (readProfiles: () => Promise<P[]>, isCurrent: () => boolean): Promise<SelectionCheck> => {
		const selected = shell.selectedId()
		const lastActiveId = await shell.readLastActiveId().catch(() => undefined)
		let profiles: P[]
		try {
			profiles = await readProfiles()
		} catch {
			return "unread"
		}
		if (!isCurrent() || shell.openProfileId() !== undefined || shell.selectedId() !== selected) return "superseded"
		// With no selection, only an empty list leaves the window something to follow.
		if (selected === undefined ? profiles.length > 0 : profiles.some((p) => p.id === selected)) return "present"
		follow(profiles, lastActiveId)
		return "followed"
	}

	/**
	 * A deletion while locked closes no session, so no lock event lands the window; one of the open
	 * profile closes its session first, and the lock event lands it. The deletion of the selection
	 * drops its sheets at once, whichever follower lands the window, and checks; a lock screen with no
	 * selection checks at every deletion, as the one that leaves no profile sends it to register.
	 */
	const onProfileDeleted = (deletedId: string | undefined, readProfiles: () => Promise<P[]>, isCurrent: () => boolean) => {
		if (shell.openProfileId() !== undefined) return
		const selected = shell.selectedId()
		if (selected === undefined ? shell.routeName() !== "popup-auth" : deletedId !== selected) return
		if (selected !== undefined && !PROFILE_FREE_ROUTES.has(shell.routeName() ?? "")) shell.closePopups()
		return checkSelection(readProfiles, isCurrent)
	}

	/** A session opened without a lock before it (a password change re-opens one). An import fenced to
	 *  the session it replaced may still await the PXE, and must not hold Lock in this one. No sheet of
	 *  the lock screen or of another profile stays over the profile it opens; a re-open of the profile
	 *  this window already shows keeps what it has open, and so does a page that needs no profile,
	 *  whose sheets belong to its own flow. */
	const onSessionOpened = (profileId: string) => {
		shell.resetContactImports()
		if (shell.openProfileId() === profileId || PROFILE_FREE_ROUTES.has(shell.routeName() ?? "")) return
		shell.closePopups()
	}

	return { enter, onLockEvent, checkSelection, onProfileDeleted, onSessionOpened }
}

/** A lock control (the header chip or Lock now) marks the popup locked before the worker answers its
 *  Lock, and the snack and the epoch go with that mark: `flush: "sync"`, so nothing settling in the
 *  next microtask sees either. Under a lock event's seal it runs a second time, which changes
 *  nothing: the epoch only has to move, and the snack is already closed. */
export function watchLockStart(isLogined: () => boolean, onLocked: () => void) {
	return watch(
		isLogined,
		(logged, was) => {
			if (was && !logged) onLocked()
		},
		{ flush: "sync" },
	)
}
