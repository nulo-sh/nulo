/**
 * Shared profile-activation bootstrap. Replaces the `initNetworks` + `initAccount`
 * + transaction-service + isLogined-flip chain that previously lived inline in
 * `popup/app.vue`. Both the popup and the onboarding tab call this so the same
 * orchestration runs in both shells.
 *
 * Scope is deliberately narrow: this composable owns the "profile is now active"
 * sequence and nothing else. Routing decisions, reconnect watchers, manager
 * teardown on unmount — all stay in the calling shell. Trying to encompass the
 * entire popup bootstrap here produces a leaky abstraction.
 */

import { shallowReactive } from "vue"
import { managers, initTransactionService } from "@/utils/core"
import { AccountServiceClient } from "@/wallet/services/account/client"
import { NetworkServiceClient } from "@/wallet/services/network/client"
import type { ProfileInfo } from "@/wallet/services/profile/client"
import { useAppStore } from "@/stores/app.store"
import { createRunFence } from "@/composables/runFence"
import { setLastActiveProfileId } from "@/utils/lastActiveProfile"
import { runsUnattended, runUnattended } from "@/composables/useStaleNetwork"
import { ensureDefaultAccountOrWait } from "@/composables/internal/default-account"

/**
 * Single-flight the activation core per profile id, module-level so it
 * coordinates across composable instances AND across the two entry points
 * (`bootstrapActiveProfile` from the `onActiveProfileChanged` event, and
 * `hydrateKnownProfile` from import-timeout recovery). Both `initNetworks` and
 * `initAccount` disconnect + REPLACE the shared `managers.network`/`.account`
 * clients; two concurrent runs for the same profile stomped each other — the
 * recovery bootstrap replaced a client the original was mid-use of, so the
 * original threw and mis-routed to "needs unlock". A same-profile caller whose
 * run is still the current generation joins it instead of starting its own.
 */
const inFlightBootstraps = new Map<string, { isCurrent: () => boolean; promise: Promise<void> }>()

/**
 * Generation fence: per-id single-flight covers same-profile recovery,
 * but a DIFFERENT profile activating mid-bootstrap (a rapid switch) would still
 * run its own init and stomp the shared clients while the older run continues.
 * Every new bootstrap and every lock bump this counter, and `initNetworks`/`initAccount` fence
 * EACH shared-state mutation on it — a superseded run stops before disconnecting/
 * replacing the winner's dynamically-referenced `managers.*` client or writing
 * stale network/account state. Joining also requires the in-flight run to still
 * be the current generation, so a re-activation of a superseded profile starts
 * fresh rather than adopting an aborted run.
 */
const bootstrapFence = createRunFence()

/** Counts `supersedeProfileActivations` calls. The shell fences a failure's publication on its own
 *  event sequence, which a supersede does not move. */
let supersessions = 0

/** After this, no activation whose core run started or was joined earlier sets `isLogined`,
 *  whatever its last read of the session answered, and those runs abandon their network and
 *  account setup. An event-driven one that then fails resolves `false` instead of reporting it. */
export function supersedeProfileActivations(): void {
	bootstrapFence.invalidate()
	supersessions++
}

/** Profile ids of the event-driven activations (`bootstrapActiveProfile`), counted from entry to
 *  settlement. `inFlightBootstraps` cannot answer this: it clears before the final session read.
 *  Reactive, so a wait can watch one settle. */
const activating = shallowReactive(new Map<string, number>())

async function trackActivation(profileId: string, run: () => Promise<boolean>): Promise<boolean> {
	const epoch = supersessions
	activating.set(profileId, (activating.get(profileId) ?? 0) + 1)
	try {
		return await run()
	} catch (err) {
		if (supersessions !== epoch) return false
		throw err
	} finally {
		const left = (activating.get(profileId) ?? 1) - 1
		if (left > 0) activating.set(profileId, left)
		else activating.delete(profileId)
	}
}

/** Whether an event-driven activation of `profileId` is still running. Reactive. */
export function isActivating(profileId: string): boolean {
	return activating.has(profileId)
}

/** Whether any event-driven activation is still running. Reactive. */
export function isAnyActivating(): boolean {
	return activating.size > 0
}

/** Whether an event-driven activation of a profile other than `profileId` is still running. */
export function isActivatingOtherThan(profileId: string): boolean {
	for (const id of activating.keys()) if (id !== profileId) return true
	return false
}

/** A quarantined chain's rows are never shown or used: the takeover owns the screen. */
function clearQuarantinedAccounts(appStore: ReturnType<typeof useAppStore>): void {
	appStore.accounts = []
	appStore.account = undefined
}

/** Persists the resolved active network (the restored-active and fallback branches alike), then
 *  reads its stale view. A network the profile never opened resets here, behind the unlock, and
 *  the re-keyed row replaces the stale one (A2). */
async function settleActiveNetwork(
	appStore: ReturnType<typeof useAppStore>,
	network: NetworkServiceClient,
	networkId: string,
	isCurrent: () => boolean,
): Promise<void> {
	await network.setActiveNetwork(networkId)
	if (!isCurrent()) return
	const view = await appStore.syncStaleNetwork(networkId)
	if (!view || !runsUnattended(view) || !isCurrent()) return
	const completed = await runUnattended(managers.networkReset, view)
	if (!isCurrent()) return
	if (completed) {
		const nets = await network.getNetworks()
		if (!isCurrent()) return
		appStore.networks = nets
		appStore.network = nets.find((n) => n.id === networkId) ?? appStore.network
	}
	// A failed run leaves its journal, which R1 shows.
	await appStore.syncStaleNetwork(networkId)
}

/** `run` plus `settled`, which rethrows its failure. It attaches to the run at once, so a failure
 *  that lands before the caller awaits it is never an unhandled rejection; one nobody awaits is dropped. */
function awaitLater<Run extends { promise: Promise<void> }>(run: Run): Run & { settled: () => Promise<void> } {
	const failure = run.promise.then(
		() => undefined,
		(error: unknown) => ({ error }),
	)
	const settled = async () => {
		const failed = await failure
		if (failed) throw failed.error
	}
	return { ...run, settled }
}

export function useProfileBootstrap() {
	const appStore = useAppStore()

	/** Replaces the inline `initNetworks` in popup/app.vue. `isCurrent` is
	 *  checked after every await and before every shared-state mutation so a
	 *  superseded bootstrap stops instead of replacing the winner's `managers.network`
	 *  (read dynamically here) or writing stale networks. Standalone callers omit it. */
	const initNetworks = async (isCurrent: () => boolean = () => true) => {
		if (!isCurrent()) return
		appStore.networks = []
		appStore.network = undefined

		managers.network?.disconnect()
		const network = new NetworkServiceClient()
		managers.network = network

		const nets = await network.getOrInitNetworks()
		if (!isCurrent()) return // a newer activation took over — don't write stale networks
		appStore.networks = nets

		// The helper fences internally, but the await boundary itself yields a
		// microtask — a new activation can bump the generation between the
		// helper's last check and this resumption, so re-fence before writing.
		const resolved = await resolveActiveNetwork(network, isCurrent)
		if (resolved === "superseded" || !isCurrent()) return
		appStore.network = resolved

		if (appStore.network) {
			await settleActiveNetwork(appStore, network, appStore.network.id, isCurrent)
			if (!isCurrent()) return
		}
		appStore.syncNetworkStatus()
	}

	/** The stored active network if present, else the profile's PRIMARY network (else the
	 *  first known one). "superseded" means a newer activation took over mid-await — the
	 *  caller must stop without writing; it is distinct from undefined (no networks). */
	const resolveActiveNetwork = async (network: NetworkServiceClient, isCurrent: () => boolean) => {
		const active = await network.getActiveNetwork()
		if (!isCurrent()) return "superseded" as const
		if (active) return active
		// No active pointer (e.g. a freshly IMPORTED profile — its active-network selection isn't
		// restored yet; that's item 1b). Fall back to the profile's PRIMARY network from the
		// service — single-sourced from the `isPrimaryActive` seed, so it can't diverge from a fresh
		// profile's default the way a hardcoded `kind` check would when the primary seed moves.
		const primary = await network.getPrimaryNetwork()
		if (!isCurrent()) return "superseded" as const
		return primary ?? appStore.networks[0]
	}

	/** Replaces the inline `initAccount` in popup/app.vue. Fenced like initNetworks. */
	const initAccount = async (isCurrent: () => boolean = () => true) => {
		if (!isCurrent() || !appStore.profile || !appStore.network) return
		const profileId = appStore.profile.id
		const { id: networkId, chainId } = appStore.network
		managers.account?.disconnect()
		const account = new AccountServiceClient()
		managers.account = account
		if (appStore.staleNetwork?.networkId === networkId) return clearQuarantinedAccounts(appStore)
		await ensureDefaultAccountOrWait(account, profileId, chainId, () => isCurrent() && appStore.markNetworkInactive(networkId))
		if (!isCurrent()) return
		const accounts = await account.getAccounts(profileId, chainId, true)
		if (!isCurrent()) return
		appStore.accounts = accounts
		await appStore.setupActiveAccount()
	}

	/**
	 * The shared activation core (network + account + tx-service + sync).
	 * It is single-flighted per profile id, so a concurrent caller for the same profile
	 * (recovery vs. the original event bootstrap) joins the in-flight run rather
	 * than kicking off a second one that replaces the shared managers mid-use.
	 */
	const runBootstrapCore = (profileId: string): { isCurrent: () => boolean; promise: Promise<void> } => {
		const existing = inFlightBootstraps.get(profileId)
		// Join only a STILL-CURRENT same-profile run (same-profile recovery). A run
		// that a newer activation already superseded is aborting, so re-activating
		// this profile must start fresh rather than adopt it.
		if (existing?.isCurrent()) return existing
		// A new bootstrap supersedes any older in-flight one (of ANY profile).
		const isCurrent = bootstrapFence.begin()
		const promise = (async () => {
			await initNetworks(isCurrent)
			if (!isCurrent()) return
			await initAccount(isCurrent)
			if (!isCurrent()) return
			initTransactionService(appStore.onTxAdded, appStore.onTxUpdated)
			await appStore.syncTransactions()
		})().finally(() => {
			// Identity-guard: only clear the slot if it still holds THIS run.
			if (inFlightBootstraps.get(profileId)?.promise === promise) inFlightBootstraps.delete(profileId)
		})
		const run = { isCurrent, promise }
		inFlightBootstraps.set(profileId, run)
		return run
	}

	/**
	 * Bootstrap a freshly-activated profile. Mirrors the truthy branch of
	 * popup/app.vue's `onActiveProfileChanged(profile)` — minus the routing
	 * decisions and `popupStore.closeAll()` which stay in the calling shell.
	 */
	const bootstrapActiveProfile = (profile: ProfileInfo): Promise<boolean> => trackActivation(profile.id, () => runActivation(profile))

	const runActivation = async (profile: ProfileInfo): Promise<boolean> => {
		appStore.profile = profile
		// Supersede at entry: kick off / join the core SYNCHRONOUSLY, before
		// the getProfiles await, so this activation's generation is bumped up front
		// — an older bootstrap is fenced immediately, not only once control reaches
		// runBootstrapCore after the await. (No await between the profile assignment
		// and this call, so no other activation can interleave in that window.)
		const core = awaitLater(runBootstrapCore(profile.id))

		// Refresh the in-memory list so the profile switcher + any other
		// consumer sees adds (backup-import activates a restored profile)
		// and updates (rename).
		appStore.profiles = await managers.profile.getProfiles()

		// Settled after the list lands, so a lock's supersede still turns the core's failure into `false`.
		await core.settled()

		// The lock must win. The re-read sees a lock that completed before it ran; the fence covers
		// the one that ran right after it: the service mutex orders the calls, not when the popup
		// receives their results, so its "active" can arrive after the lock event sealed the popup.
		const stillActive = (await managers.profile.getActiveProfile())?.id === profile.id && core.isCurrent()
		if (stillActive) {
			// Unlocking the same profile changes no profile id, so nothing else
			// re-reads the in-flight rows the lock emptied.
			void appStore.refreshInFlight({ invalidate: true })
			appStore.isLogined = true
			// A session the passkey window opened has no page left to record it, and the lock screen
			// preselects from this. Not awaited: a preference never holds the session check.
			void setLastActiveProfileId(profile.id).catch(() => undefined)
		}
		return stillActive
	}

	/**
	 * Initial load of an already-active profile. Mirrors the
	 * `getActiveProfile()` branch of `loadProfile()` in popup/app.vue.
	 * Returns the active profile if one exists (and was bootstrapped), or null if
	 * there is none or a lock or a newer activation superseded the run.
	 */
	const hydrateKnownProfile = async (): Promise<ProfileInfo | null> => {
		const activeProfile = await managers.profile.getActiveProfile()
		if (!activeProfile) return null

		appStore.profile = activeProfile
		// Join the in-flight event-driven bootstrap for this profile instead
		// of racing a second network/account init that replaces its clients.
		const core = runBootstrapCore(activeProfile.id)
		await core.promise

		// Same lock-wins guard as bootstrapActiveProfile: don't flip isLogined if the
		// session was cleared/switched mid-hydrate. isSessionChecked is set either way
		// (the session WAS checked); a stale isLogined=true is the only harmful write.
		const stillActive = (await managers.profile.getActiveProfile())?.id === activeProfile.id
		const current = core.isCurrent()
		if (current && stillActive) {
			void appStore.refreshInFlight({ invalidate: true })
			appStore.isLogined = true
		}
		appStore.isSessionChecked = true

		return current ? activeProfile : null
	}

	return { bootstrapActiveProfile, hydrateKnownProfile, initNetworks, initAccount }
}
