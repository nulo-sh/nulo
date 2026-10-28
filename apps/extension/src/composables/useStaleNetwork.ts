/**
 * The popup's side of a stale network: the reset running on any network, a custom node that did
 * not answer, and the reset's lifecycle (start, the resume at each unlock, completion and its
 * notice). Receives a connected client; the shell owns connect and disconnect and calls `dispose`.
 */
import { computed, type InjectionKey, type Ref, ref, shallowReactive, shallowRef } from "vue"
import {
	ERR_NODE_UNREACHABLE,
	type NetworkResetServiceClient,
	type ResetConfirmation,
	type ResetNotice,
	type StaleNetworkChanged,
	type StaleNetworkView,
} from "@/wallet/services/network-reset/client"

export type StaleNetworkClient = Pick<
	NetworkResetServiceClient,
	"getStaleNetwork" | "getPendingReset" | "resetStaleNetwork" | "takeResetNotice" | "onStaleNetworkChanged" | "onDisconnected"
>

/** What the screen showed, which the service compares with a fresh view before a first run. */
export const confirmationOf = (view: StaleNetworkView): ResetConfirmation => ({
	networkReset: view.cause.networkReset,
	addressesMoved: view.cause.addressesMoved,
	accountCount: view.accounts.length,
	unmovableCount: view.unmovable.length,
	switchToSeedNode: view.switchToSeedNode,
	probedEndpoint: view.probedEndpoint,
})

/** No account row on the chain, hidden or imported: the profile never opened the network, since
 *  opening one creates Account 1 and accounts can only be hidden, so it holds no account or history
 *  of the user's. */
export const neverOpened = (view: StaleNetworkView): boolean => view.accounts.length === 0 && view.unmovable.length === 0

/** A never-opened network resets behind A4c with no toast, whatever the cause: it has no address
 *  to warn about. Never one that would switch the user's own node to Nulo's: only A1, confirmed,
 *  may do that. */
export function runsUnattended(view: StaleNetworkView): boolean {
	return neverOpened(view) && !view.switchToSeedNode && !view.blocked && !view.reset && !view.heldBy && !view.otherPending
}

/** A paused reset's imported accounts can be exported before deleting the network: from a password
 *  profile only, as Settings' account export, and only those whose key the journal holds. */
export const exportsHeld = (view: StaleNetworkView | null | undefined, profileType: string | undefined): boolean =>
	profileType === "password" && (view?.reset?.heldImported?.length ?? 0) > 0

const errorCode = (error: unknown) => (error instanceof Error ? error.message.split(":")[0] : "")

/**
 * Starts `view`'s reset and resolves when it ends: true when it completed, false when it failed,
 * was refused, or the worker went away mid-run (its journal then resumes at the next unlock).
 */
export function runResetToEnd(client: StaleNetworkClient, view: StaleNetworkView): Promise<boolean> {
	return new Promise((resolve) => {
		const settle = (completed: boolean) => {
			client.onStaleNetworkChanged.remove(onChanged)
			client.onDisconnected.remove(onGone)
			resolve(completed)
		}
		const onChanged = (e: StaleNetworkChanged) => {
			if (e.networkId === view.networkId && (e.completed || e.failed)) settle(!!e.completed)
		}
		const onGone = () => settle(false)
		client.onStaleNetworkChanged.add(onChanged)
		client.onDisconnected.add(onGone)
		client.resetStaleNetwork(view.networkId, confirmationOf(view)).catch(() => settle(false))
	})
}

/** This document's automatic runs (A2), one entry per caller. Module scope: the bootstrap and the
 *  switch both start one, and the shell's instance skips their events, whichever started it. */
const unattended = shallowReactive<StaleNetworkView[]>([])

/**
 * A network the profile never opened: reset behind A4c, with no other screen and no toast.
 * `settle` runs once the run ends, A4c still up, so the route never shows the stale row.
 */
export async function runUnattended(
	client: StaleNetworkClient,
	view: StaleNetworkView,
	settle: (completed: boolean) => Promise<unknown> = async () => {},
): Promise<boolean> {
	unattended.push(view)
	try {
		const completed = await runResetToEnd(client, view)
		await settle(completed)
		return completed
	} finally {
		unattended.splice(unattended.indexOf(view), 1)
	}
}

export interface StaleNetworkDeps {
	client: StaleNetworkClient
	/** The logged-in profile and its active network; undefined before a session, and in a dApp
	 *  window, which the takeover never covers. */
	scope: () => { profileId: string; networkId: string } | undefined
	/** Re-reads the active network's view into the store. */
	syncActive: (networkId: string) => Promise<unknown>
	/** The store's view of the active network, as the bootstrap or the last read left it. */
	staleActive: () => StaleNetworkView | null
	/** The active network's reset completed: re-read its row, assign it, await the account load.
	 *  `live` turns false once the session or profile that saw the completion has ended. */
	onCompleted: (networkId: string, live: () => boolean) => Promise<void>
	announce: (notice: ResetNotice) => void
}

/** What one session or profile owns. `clear` replaces it, so work begun under an ended one writes
 *  nothing once it resumes and holds back nothing of the next. */
class Session {
	reads = 0
	/** Completions of the active network whose account load has not ended. Until it ends, A4 stays
	 *  and the notice waits. */
	completions = 0
	private completing: Promise<void> = Promise.resolve()
	private claimed = new Set<string>()

	/** True once per network: the completion event and the resume's catch-up both try, one runs. */
	claim(networkId: string): boolean {
		if (this.claimed.has(networkId)) return false
		this.claimed.add(networkId)
		return true
	}

	async hold(done: Promise<void>): Promise<void> {
		this.completions++
		this.completing = Promise.all([this.completing, done.catch(() => {})]).then(() => {})
		try {
			await done
		} finally {
			this.completions--
		}
	}

	/** Resolves once every completion held so far, and any held meanwhile, has settled. */
	async settled(): Promise<void> {
		for (let seen = this.completing; ; seen = this.completing) {
			await seen
			if (seen === this.completing) return
		}
	}
}

/** `run`'s failure rejects while `live` holds. Once a lock or a switch ends the session, the failure
 *  belongs to the ended session and resolves, logged at debug as `line`. */
async function whileLive(live: () => boolean, run: Promise<void>, line: string): Promise<void> {
	try {
		await run
	} catch (error) {
		if (live()) throw error
		console.debug(line, { error })
	}
}

async function syncActiveIfStale(deps: StaleNetworkDeps): Promise<void> {
	const scope = deps.scope()
	if (scope && deps.staleActive()?.networkId === scope.networkId) await deps.syncActive(scope.networkId)
}

export function useStaleNetwork(deps: StaleNetworkDeps) {
	/** The view of the network whose reset another document runs, or a paused one this one resumed. */
	const observed: Ref<StaleNetworkView | null> = ref(null)
	/** Automatic runs started before the last `clear`: their settling holds back nothing of the next. */
	const ended = shallowRef<ReadonlySet<StaleNetworkView>>(new Set())
	const ownRuns = () => unattended.filter((v) => !ended.value.has(v))
	const isOwnRun = (networkId: string) => ownRuns().some((v) => v.networkId === networkId)
	/** The view of the network whose reset runs, whatever network is active (A4, or the loader). */
	const running = computed(() => observed.value ?? ownRuns()[0] ?? null)
	/** The network whose custom node did not answer the last start (R4). */
	const nodeDown: Ref<string | null> = ref(null)
	const starting = ref(false)
	let session = new Session()
	let disposed = false
	const live = (s: Session) => s === session && !disposed

	const syncRunning = async (s: Session) => {
		const read = ++s.reads
		const pending = await deps.client.getPendingReset()
		const next = pending?.running && !isOwnRun(pending.networkId) ? await deps.client.getStaleNetwork(pending.networkId) : null
		if (live(s) && read === s.reads && s.completions === 0) observed.value = next
	}

	/** Taking a notice consumes it; the worker hands one only to the profile still active. */
	const takeNotice = async (s: Session, profileId: string) => {
		if (!live(s)) return
		const notice = await deps.client.takeResetNotice(profileId)
		await s.settled()
		if (notice && live(s)) deps.announce(notice)
	}

	/** Re-reads the view of the network active now: after a switch, the event's network is not it. */
	const syncLive = async (s: Session, profileId: string) => {
		const now = deps.scope()
		if (live(s) && now?.profileId === profileId) await deps.syncActive(now.networkId)
	}

	/** A refusal re-reads the active view, which then says why; an unanswered custom node is R4. */
	const refused = async (view: StaleNetworkView, error: unknown) => {
		if (errorCode(error) === ERR_NODE_UNREACHABLE) nodeDown.value = view.networkId
		const scope = deps.scope()
		if (scope) await deps.syncActive(scope.networkId)
	}

	/** Starts or resumes `view`'s reset. */
	const start = async (view: StaleNetworkView) => {
		if (starting.value) return
		const s = session
		starting.value = true
		nodeDown.value = null
		try {
			await deps.client.resetStaleNetwork(view.networkId, confirmationOf(view))
		} catch (error) {
			if (!live(s)) return
			await refused(view, error)
		} finally {
			if (live(s)) starting.value = false
		}
		await syncRunning(s)
	}

	/** A completion that reached this popup before its session began found no scope, and the
	 *  bootstrap that read the active network as stale loaded no account: finish it here. */
	const catchUp = async (s: Session) => {
		const now = deps.scope()
		if (!now || deps.staleActive()?.networkId !== now.networkId) return
		if ((await deps.client.getStaleNetwork(now.networkId)) || !live(s) || !s.claim(now.networkId)) return
		await s.hold(deps.onCompleted(now.networkId, () => live(s)))
	}

	const resumeIn = async (s: Session, profileId: string) => {
		const pending = await deps.client.getPendingReset()
		const paused = pending && !pending.running ? await deps.client.getStaleNetwork(pending.networkId) : null
		if (!live(s)) return
		if (paused) await start(paused)
		await syncRunning(s)
		if (pending?.networkId !== deps.scope()?.networkId) await catchUp(s)
		// A run pending at the unlock announces its own completion, once its account load ends: the
		// worker writes the notice before the completion reaches this popup.
		if (!pending) await takeNotice(s, profileId)
	}

	/** At each unlock and reconnect of `profileId`: resumes a paused reset on any network, shows a
	 *  run in flight, and finishes and announces a completion no popup took. */
	const resume = (profileId: string) => {
		const s = session
		return whileLive(() => live(s), resumeIn(s, profileId), "stale-network resume ended with its session")
	}

	/** Re-reads the active network's view while it is stale: adding, renaming or deleting a network
	 *  changes its name or which row holds its new chain (R2). */
	const refresh = () => {
		const s = session
		return whileLive(() => live(s), syncActiveIfStale(deps), "stale-network refresh ended with its session")
	}

	/** Ends what the ended session or profile showed and owned. */
	const clear = () => {
		session = new Session()
		ended.value = new Set(unattended)
		observed.value = null
		nodeDown.value = null
		starting.value = false
	}

	/** The scope an event belongs to, if this popup acts on it. */
	const scopeOf = (e: StaleNetworkChanged) => {
		const scope = deps.scope()
		return !disposed && scope?.profileId === e.profileId && !isOwnRun(e.networkId) ? scope : undefined
	}

	const onChanged = async (e: StaleNetworkChanged) => {
		const scope = scopeOf(e)
		if (!scope) return
		const s = session
		// A4 stays up until the account load ends, so the route and the toast never meet an empty Home.
		if (e.completed && e.networkId === scope.networkId && s.claim(e.networkId))
			await s.hold(deps.onCompleted(e.networkId, () => live(s)))
		await syncRunning(s)
		await syncLive(s, scope.profileId)
		if (e.completed) await takeNotice(s, scope.profileId)
	}
	deps.client.onStaleNetworkChanged.add(onChanged)

	const dispose = () => {
		disposed = true
		deps.client.onStaleNetworkChanged.remove(onChanged)
	}

	return { running, nodeDown, starting, start, resume, refresh, clear, dispose }
}

export type StaleNetwork = ReturnType<typeof useStaleNetwork>

export const STALE_NETWORK_KEY: InjectionKey<StaleNetwork> = Symbol("stale-network")
