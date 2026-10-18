import { computed, type ComputedRef, ref, type Ref, watch } from "vue"
import {
	type FeeScope,
	feeScopeKey,
	type GasBalances,
	isLiveFeeScope,
	type LiveFeeIdentity,
	liveFeeScope,
	type RegisteredFpc,
} from "@/popup/components/modules/send/fee-helpers"
import { type BalanceScope, EnsureSuperseded, type SubscribeCaps, type useBalancesStore } from "@/stores/balances.store"

type BalancesStore = Pick<ReturnType<typeof useBalancesStore>, "subscribe" | "ensure" | "entry">

/** The snapshot's hooks into the card's rule book, always for a whole identity. `L` is whatever a
 *  read hands the commit. */
export interface SnapshotSelection<L> {
	/** Whether a mount reads past the store's TTL. */
	forceRefresh(): boolean
	/** The saved selection, read before the lease; null once `isCurrent()` is false after the read. */
	load(scope: BalanceScope, isCurrent: () => boolean): Promise<L | null>
	/** The recovery's read, for the committed identity. */
	reload(scope: BalanceScope): Promise<L>
	/** Runs inside the commit, after the snapshot's refs are written and before the gate opens. */
	reconcile(load: L, scope: BalanceScope): void
}

export type FeeSnapshotFailure = "degraded" | "init" | null

interface SnapshotCtx<L> {
	props: LiveFeeIdentity
	store: BalancesStore
	selection: () => SnapshotSelection<L>
	accountUnusable: Ref<boolean>
	isInitComplete: Ref<boolean>
	gasBalances: Ref<GasBalances | undefined>
	registeredFpcs: Ref<RegisteredFpc[]>
	committedScope: Ref<BalanceScope | null>
	readingKey: Ref<string | null>
	isLoading: Ref<boolean>
	failure: Ref<FeeSnapshotFailure>
	// Plain fields, never reactive: a watcher source that reads one must not gain a dependency.
	isMounted: boolean
	runSeq: number
	loadingRun: number
	readingRun: number
	committedKey: string | null
	subscription: { release: () => void } | null
	subscribedKey: string | null
}

const CONTEXT = Symbol("fee-snapshot")

/** This card's capabilities: both legs, backoff retry while mounted, no
 *  tx-settle refresh and no peek — exactly its pre-store traffic.
 *  `txRefresh` must stay off for every subscriber sharing this key while the card is mounted: a
 *  settle-triggered forced read can outrank the mount's forced read, which then returns without
 *  committing, and `commitFromEntry` copies `gas.verified` without reading `entry.stale` — so Send
 *  could resolve on the pre-refresh figure. Turning it on needs a wake on the newer run's commit. */
const CARD_CAPS: SubscribeCaps = { legs: ["gas", "fpc"], retry: true, txRefresh: false, peek: false }

const scopeIsLiveIdentity = (props: LiveFeeIdentity, scope: FeeScope | null) => Boolean(scope) && isLiveFeeScope(props, scope as FeeScope)

/** Unmounting counts: either way the run no longer owns the card. */
const identityDrifted = <L>(ctx: SnapshotCtx<L>, scope: FeeScope) => !ctx.isMounted || !isLiveFeeScope(ctx.props, scope)

/** Re-lease on every identity change: the old key must not stay subscribed —
 *  and store-retrying — after the card moves on. Subscribe the NEW key BEFORE
 *  releasing the old: a same-profile switch must not transit zero subscribers,
 *  which would fire the store's last-release fence and abandon the old
 *  identity's still-joinable flights (the A→B→A flap would re-issue its RPC).
 *  The store resets backoff attempts on the new key's 0→1 retry-capable
 *  transition, reproducing today's fresh-identity-fresh-backoff rule. */
function subscribeTo<L>(ctx: SnapshotCtx<L>, scope: BalanceScope, reqKey: string) {
	if (ctx.subscribedKey === reqKey) return
	const previous = ctx.subscription
	ctx.subscription = ctx.store.subscribe(scope, CARD_CAPS)
	ctx.subscribedKey = reqKey
	previous?.release()
}

function releaseSubscription<L>(ctx: SnapshotCtx<L>) {
	ctx.subscription?.release()
	ctx.subscription = null
	ctx.subscribedKey = null
}

/**
 * The SNAPSHOT COMMIT (synchronous): copies the store entry into local refs —
 * never live-binds — then reconciles the selection and opens the gate. Order
 * matters and is preserved verbatim from the pre-store init: refs commit
 * BEFORE the reconcile (on a first load the still-closed gate means `methods`
 * resolves against undefined balances), and the gate opens after — degraded
 * included (holding it closed on failure was the frozen-Confirm bug).
 */
function commitFromEntry<L>(ctx: SnapshotCtx<L>, scope: BalanceScope, reqKey: string, load: L) {
	const entry = ctx.store.entry(scope)
	if (!entry) return

	// UNKNOWN (undefined) on any failed balance read, never a fabricated zero
	// and never a stale last-good figure — self-paid derivation fails closed.
	// `verified` is exactly that: cleared by every failed refresh. The store
	// retains last-good FPC data per key, matching the old lastGoodFpcKey rule.
	ctx.gasBalances.value = entry.gas.verified
	ctx.registeredFpcs.value = entry.fpc.data ?? []

	ctx.selection().reconcile(load, scope)

	// The gate opens on EVERY settled init — degraded included.
	ctx.committedKey = reqKey
	ctx.committedScope.value = scope
	ctx.isInitComplete.value = true

	ctx.accountUnusable.value = entry.gas.accountUnusable === true
	const degraded = entry.gas.status === "degraded" || entry.fpc.status === "degraded"
	if (degraded) {
		console.error("Fee init degraded", entry.gas.lastError, entry.fpc.lastError)
		ctx.failure.value = "degraded"
	} else {
		ctx.failure.value = null
	}
}

/** The store fetches the legs with per-leg isolation, timeout, and raw-promise
 *  reuse; ensure settles when both requested legs settle, ready OR degraded.
 *  False means a superseded ensure — a profile switch fenced the run out and
 *  the new identity's own init covers it: no degraded state, no notice (the
 *  caller's drift guard cannot observe a rejection). Other failures propagate. */
async function ensureLegsSettled<L>(ctx: SnapshotCtx<L>, scope: BalanceScope) {
	try {
		await ctx.store.ensure(scope, { legs: ["gas", "fpc"], forceRefresh: ctx.selection().forceRefresh() })
		return true
	} catch (e) {
		if (e instanceof EnsureSuperseded) return false
		throw e
	}
}

/** Opens a run for the live identity: its scope and key, or null for an identity-less mount. */
function beginRun<L>(ctx: SnapshotCtx<L>, myRun: number) {
	const { props } = ctx
	if (!props.profile || !props.network || !props.account) {
		// An identity-less mount holds no subscription: the release kills the
		// store's retry loop for the key it held.
		releaseSubscription(ctx)
		return null
	}

	// Snapshot the identity this run targets (profile+network+account). A
	// prop change during the awaits fires a fresh init; this run's commit is
	// discarded by the drift guard below rather than applied to the new
	// identity.
	// chainId is part of the STORE key, so it must be part of this card's
	// identity too — else a chainId change under a stable networkId keeps
	// the old key's lease while ensure populates the new one.
	// The identity checks above make every field of the scope present.
	const scope = liveFeeScope(props) as BalanceScope
	const reqKey = feeScopeKey(scope)

	// Close the derivation gate only when no snapshot is committed for THIS
	// identity: first loads and identity switches must not derive against
	// partially-resolved state, but a same-identity background refresh keeps
	// the committed snapshot live (re-arming unconditionally made Confirm
	// oscillate disabled for the length of every retry's in-flight window).
	if (ctx.committedKey !== reqKey) ctx.isInitComplete.value = false
	ctx.readingRun = myRun
	ctx.readingKey.value = reqKey
	return { scope, reqKey }
}

async function runSnapshot<L>(ctx: SnapshotCtx<L>): Promise<void> {
	if (!ctx.isMounted) return
	const myRun = ++ctx.runSeq
	try {
		const run = beginRun(ctx, myRun)
		if (!run) return
		const { scope, reqKey } = run

		const read = await ctx.selection().load(scope, () => myRun === ctx.runSeq && ctx.isMounted)
		if (!read) return

		// Re-validate AFTER the storage await, BEFORE taking the lease: a
		// mid-await identity change means a fresh run owns the new state —
		// subscribing here would re-lease a key this run no longer represents.
		if (identityDrifted(ctx, scope)) return

		ctx.loadingRun = myRun
		ctx.isLoading.value = true
		subscribeTo(ctx, scope, reqKey)
		if (!(await ensureLegsSettled(ctx, scope))) return
		// Discard if the profile/network/chain/account switched mid-flight or a
		// newer run took over. Everything past this guard is synchronous (no
		// awaits), so the commit is atomic against the checked state.
		if (myRun !== ctx.runSeq || identityDrifted(ctx, scope)) return

		commitFromEntry(ctx, scope, reqKey, read)
	} catch (e) {
		// Deliberately does NOT open `isInitComplete`: an exception here may
		// have fired mid-commit, and deriving settings from a half-written
		// snapshot would break the resolved-state invariant the gate exists
		// for. The state is degraded-with-notice, never silently frozen — the
		// identity watcher is the re-entry path. A superseded run's failure
		// belongs to an identity no longer on screen.
		console.error("Failed to init", { error: e })
		if (myRun !== ctx.runSeq || !ctx.isMounted) return
		ctx.failure.value = "init"
	} finally {
		// Only the run that owns the loading flag may clear it — a superseded
		// run's finally must not blank a newer run's in-flight spinner.
		if (ctx.loadingRun === myRun) ctx.isLoading.value = false
		if (ctx.readingRun === myRun) ctx.readingKey.value = null
	}
}

const recommitStillValid = <L>(ctx: SnapshotCtx<L>, scope: BalanceScope) => {
	if (!ctx.props.network || !ctx.props.account) return false
	return isLiveFeeScope(ctx.props, scope)
}

async function recommit<L>(ctx: SnapshotCtx<L>): Promise<void> {
	const scope = ctx.committedScope.value
	if (!scope || !ctx.isMounted) return
	// The recovery targets the committed identity; if props moved on, the
	// identity watcher owns it.
	if (!recommitStillValid(ctx, scope)) return
	const load = await ctx.selection().reload(scope)
	// Re-validate AFTER the await: an identity switch during the storage read
	// must not let this late commit re-open the gate with the OLD identity's
	// data (the switch closed it; only the new identity's init may commit).
	if (!ctx.isMounted || ctx.committedScope.value !== scope || !recommitStillValid(ctx, scope)) return
	commitFromEntry(ctx, scope, feeScopeKey(scope), load)
}

/**
 * The fee card's balance snapshot: the store lease, the run that reads and commits it, and the gate
 * that keeps settings off a partial one. Runs supersede each other (`runSeq`): a superseded run's
 * late read must not re-apply its pre-fill over a newer run's, or the user's, selection, and its
 * finally must not clear a newer run's flags. `dispose()` is terminal.
 */
export function useFeeSnapshot<L>(
	props: LiveFeeIdentity,
	{ store, selection, accountUnusable }: { store: BalancesStore; selection: () => SnapshotSelection<L>; accountUnusable: Ref<boolean> },
) {
	const ctx: SnapshotCtx<L> = {
		props,
		store,
		selection,
		accountUnusable,
		/** Gates settings derivation: false while a run for a new identity is in flight, and true
		 *  exactly once per committed snapshot, after every fetched ref has its final value. */
		isInitComplete: ref(false),
		/** UNKNOWN until the first successful read for the current identity. `undefined` must stay
		 *  distinguishable from a confirmed zero: a failed or timed-out read commits `undefined`, never
		 *  a fabricated "0", so method gating and the bridge nudge can't act on a balance never seen. */
		gasBalances: ref<GasBalances | undefined>(undefined),
		registeredFpcs: ref<RegisteredFpc[]>([]),
		/** Structured scope of the committed snapshot — the recovery watch's target. */
		committedScope: ref<BalanceScope | null>(null),
		/** The identity a run is reading for right now, owned by `readingRun`. Rows load only for it:
		 *  an identity no read is coming for, after an init that threw, say, gives today's answers. */
		readingKey: ref<string | null>(null),
		isLoading: ref(false),
		failure: ref<FeeSnapshotFailure>(null),
		isMounted: true,
		runSeq: 0,
		loadingRun: 0,
		readingRun: 0,
		// Identity of the last fully-committed snapshot. Lets a background refresh
		// (store retry, same-identity watcher refire) keep serving the committed
		// snapshot instead of yanking settings — and the Confirm gate behind them —
		// for the length of every in-flight window.
		committedKey: null,
		subscription: null,
		subscribedKey: null,
	}
	const snapshotCommitted: ComputedRef<boolean> = computed(
		() => ctx.isInitComplete.value && scopeIsLiveIdentity(props, ctx.committedScope.value),
	)
	return {
		[CONTEXT]: ctx,
		isInitComplete: ctx.isInitComplete,
		gasBalances: ctx.gasBalances,
		registeredFpcs: ctx.registeredFpcs,
		committedScope: ctx.committedScope,
		isLoading: ctx.isLoading,
		failure: ctx.failure,
		snapshotCommitted,
		/** A snapshot for the live identity is on its way. */
		snapshotPending: computed(() => !snapshotCommitted.value && ctx.readingKey.value === feeScopeKey(liveFeeScope(props))),
		scopeIsLiveIdentity: (scope: FeeScope | null) => scopeIsLiveIdentity(props, scope),
		run: () => runSnapshot(ctx),
		/** True on a real identity change: the gate closes now, so the old identity's snapshot stops
		 *  serving settings while a same-identity refresh in flight is drift-guarded away. */
		invalidate: () => {
			if (feeScopeKey(liveFeeScope(props)) === ctx.committedKey) return false
			ctx.isInitComplete.value = false
			return true
		},
		/** Releases the lease before the card's clients go down: the store's retry loop for this key
		 *  dies with the card's subscription. */
		dispose: () => {
			ctx.isMounted = false
			releaseSubscription(ctx)
		},
	}
}

export type FeeSnapshot<L> = ReturnType<typeof useFeeSnapshot<L>>

/** The snapshot's two watchers, in this order. */
export function watchFeeSnapshot<L>(snapshot: FeeSnapshot<L>): void {
	const ctx = snapshot[CONTEXT]
	/** Recovery from degraded commits: re-commit when a store retry lands. The
	 *  source observes retryVersion ONLY (never gas.version — tx-settle commits
	 *  must not re-enter this card), and only for the committed key. A
	 *  non-degraded slice's retryVersion cannot bump while committed, so the
	 *  pair-signal is exactly "a slice this card committed degraded recovered". */
	watch(
		() => {
			const scope = ctx.committedScope.value
			if (!scope) return null
			const entry = ctx.store.entry(scope)
			return entry ? `${entry.gas.retryVersion}|${entry.fpc.retryVersion}` : null
		},
		(next, prev) => {
			if (next === null || prev === null || next === prev) return
			recommit(ctx).catch((e) => console.error("Fee recovery recommit failed", { error: e }))
		},
	)
	/** A background retry that finds the imported key unusable fails, so it bumps no retryVersion and
	 *  commits nothing: its verdict reaches the page here, only while the committed key is still the
	 *  account on screen. */
	watch(
		() => {
			const scope = ctx.committedScope.value
			if (!scope || identityDrifted(ctx, scope)) return false
			return ctx.store.entry(scope)?.gas.accountUnusable === true
		},
		(unusable) => {
			if (unusable) ctx.accountUnusable.value = true
		},
	)
}
