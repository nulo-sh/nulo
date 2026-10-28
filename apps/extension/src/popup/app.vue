<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Components */
import PopupManager from "./components/popups/PopupManager.vue"
import Navigation from "./components/Navigation.vue"
import StaleNetworkTakeover from "@/components/stale-network/StaleNetworkTakeover.vue"
import NetworkArrival from "@/components/network-arrival/NetworkArrival.vue"

/** Utils */
import { managers, isServiceReady } from "@/utils/core"
import { legalSheetMayCover } from "@/utils/legal-sheet"
import { applyThemeChoice, isPrefersDarkScheme } from "@/utils/general"
import { pointToolbarAtSidebar } from "@/utils/browser-surface"
import { getLastActiveProfileId } from "@/utils/lastActiveProfile"
import { ownWindowRoute, postAuthRoute, releaseOwnWindow } from "@/utils/own-window"
import { shouldAdvanceToGeneral } from "./should-advance-to-general"
import { resolveBootSession } from "./boot-session"
import { decideLockLanding, decideUnreachableLanding, isEstablishedAtDecision } from "./lock-landing"
import { endOpeningFlows, isOpeningRoute } from "./opening-flow"
import { reconcileLockedBoot } from "./reconcile-locked-boot"
import { applyBootOutcome } from "./apply-boot-outcome"
import { applyRootFlags } from "./root-flags"
import { defaultConfig } from "@/wallet/config"
import { logCallFailure } from "@/wallet/logger/console-forwarding"
import { AccountServiceClient } from "@/wallet/services/account/client"
import { followAccountRows } from "@/utils/account-rows"
import { createNetworkSwitchHandler } from "@/popup/network-switch"
import { createResetCompletion } from "@/popup/reset-completion"
import { runFencedBootstrap } from "@/popup/profile-bootstrap"
import { createScopeEpochHandlers } from "@/popup/scope-epoch"
import { createLockedState, watchLockStart } from "@/popup/locked-state"
import { createBootTriggers } from "@/popup/boot-triggers"
import { START_GRACE_KEY } from "@/popup/start-grace"
import { isDappWindow, takeoverView } from "@/popup/stale-takeover"
import { networkArrivalView } from "@/popup/network-arrival"
import { readyToast } from "@/components/stale-network/copy"
import { ConfigServiceClient } from "@/wallet/services/config/client"
import { IncomingTransferServiceClient } from "@/wallet/services/incoming-transfer/client"
import { PriceServiceClient } from "@/wallet/services/price/client"
import { TokenServiceClient } from "@/wallet/services/token/client"

/** Composables */
import { supersedeProfileActivations, useProfileBootstrap } from "@/composables/useProfileBootstrap"
import { ARRIVALS_KEY, useArrivals } from "@/composables/useArrivals"
import { runUnattended, STALE_NETWORK_KEY, useStaleNetwork } from "@/composables/useStaleNetwork"
import { NETWORK_ARRIVAL_KEY, useNetworkArrival } from "@/composables/useNetworkArrival"

/** Store */
import { useAppStore } from "@/stores/app.store"
import { usePopupStore } from "@/stores/popup.store"
import { useNotificationStore } from "@/stores/notification.store"
const appStore = useAppStore()
const popupStore = usePopupStore()
const notificationStore = useNotificationStore()
const { bootstrapActiveProfile } = useProfileBootstrap()
const { openToast, closeToast, toast } = useToast()
const { onScopeChanged, onLocked } = createScopeEpochHandlers({
	bumpEpoch: () => {
		appStore.scopeEpoch++
	},
	toast,
	closeToast,
})

/** Update theme */
const root = document.querySelector("html")
const theme = ref(defaultConfig().theme)
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (_event) => {
	if (theme.value === "system") root.setAttribute("theme", isPrefersDarkScheme() ? "dark" : "light")
})

import LogoIcon from "@/assets/logo.svg?raw"

const route = useRoute()
const router = useRouter()

watch(
	() => route.meta,
	(meta) => applyRootFlags(root, meta),
	{ immediate: true },
)

const configService = new ConfigServiceClient()
configService.onUpdate.add(applySetting)

const arrivalsIncoming = new IncomingTransferServiceClient()
const arrivalsTokens = new TokenServiceClient()
const arrivalsPrices = new PriceServiceClient()
// Opened before the coordinator listens. Its first Ready reaches the coordinator too, whose read
// waits for an open profile's scope.
void arrivalsIncoming.connect()
void arrivalsPrices.connect()
const arrivals = useArrivals({
	incomingTransferService: arrivalsIncoming,
	configService,
	priceService: arrivalsPrices,
	scope: () =>
		appStore.isLogined && appStore.profile?.id && appStore.network?.id && appStore.account?.address
			? { profileId: appStore.profile.id, networkId: appStore.network.id, account: appStore.account.address }
			: undefined,
	epoch: () => appStore.scopeEpoch,
	routeName: () => route.name,
	lookupToken: async (record) => {
		if (record.tokenId === undefined) return undefined
		const { symbol, decimals, hasDecimals } = await arrivalsTokens.getToken(record.tokenId)
		return { symbol, decimals, hasDecimals }
	},
	accountName: () => appStore.account?.name ?? "",
	openToast,
	openReceipt: (id) => router.push(`/popup/received/${id}`),
})
const { seeded: arrivalsSeeded } = arrivals
provide(ARRIVALS_KEY, arrivals)

// Its own client: `managers.account` is replaced on every activation and network switch, and an
// account another window adds or edits must reach this window's lists whichever is current.
const accountRows = new AccountServiceClient()
const stopAccountRows = followAccountRows(accountRows, appStore)
void accountRows.connect()

const intervalId = ref(null)
/** The Terms sheet's verdict; undefined while it has none. */
const legalSheetShown = ref(undefined)
/** Marked only where the sheet may cover the page: anywhere else it is hidden whatever the acceptance. */
const legalSheetMark = computed(() => {
	const coverable = legalSheetMayCover({
		routeName: route.name,
		routePath: route.path,
		isAuthRequired: route.meta.isAuthRequired === true,
	})
	if (!coverable || legalSheetShown.value === undefined) return undefined
	return legalSheetShown.value ? "shown" : "hidden"
})

const settingHandlers = {
	theme(value) {
		theme.value = value
		applyThemeChoice(root, value)
	},
	disableAnimations(value) {
		root.classList.toggle("noanimations", Boolean(value))
	},
	sidePanel(value) {
		chrome.sidePanel?.setPanelBehavior({
			openPanelOnActionClick: Boolean(value),
		})
		pointToolbarAtSidebar(Boolean(value)).catch(() => console.debug("[app] Firefox did not change the toolbar popup"))
	},
	defaultExplorer(value) {
		appStore.defaultExplorer = value
	},
}
function applySetting(setting) {
	const handler = settingHandlers[setting.key]
	if (typeof handler === "function") {
		handler(setting.value)
	}
}

// initNetworks / initAccount factored into useProfileBootstrap. The compatible
// `bootstrapActiveProfile(profile)` below replays the same chain. The chain
// watchers below still reach into `managers.network`/`managers.account`
// directly because they're popup-local (chain switch, etc.) and don't need
// the bootstrap helper.

/** todo: ref */
watch(
	() => appStore.account,
	() => {
		if (!appStore.account || !appStore.isLogined) return

		if (managers.transaction) {
			appStore.syncTransactions()
		}
	},
)

// The switch handler's latest run, which a completed reset awaits before it routes and announces.
let switchRun = Promise.resolve()
const { reloadNetwork, completeReset } = createResetCompletion({
	activeNetworkId: () => appStore.network?.id,
	getNetworks: () => managers.network.getNetworks(),
	setNetworks: (networks) => {
		appStore.networks = networks
	},
	setNetwork: (network) => {
		appStore.network = network
	},
	accountLoaded: async () => {
		await nextTick()
		await switchRun
	},
	ownsRoute: () => !isDappWindow(route.name),
	toHome: () => router.push(postAuthRoute()),
})

const stale = useStaleNetwork({
	client: managers.networkReset,
	scope: () =>
		appStore.isLogined && appStore.profile && appStore.network && !isDappWindow(route.name)
			? { profileId: appStore.profile.id, networkId: appStore.network.id }
			: undefined,
	syncActive: (networkId) => appStore.syncStaleNetwork(networkId),
	staleActive: () => appStore.staleNetwork,
	onCompleted: completeReset,
	announce: (notice) => {
		const name = appStore.networks.find((n) => n.id === notice.networkId)?.name
		if (name) openToast({ kind: "success", ...readyToast(name, notice.addressesMoved) })
	},
})
provide(STALE_NETWORK_KEY, stale)

const takeover = computed(() =>
	takeoverView({
		logined: appStore.isLogined,
		route: { name: route.name, path: route.path },
		networkId: appStore.network?.id,
		stale: appStore.staleNetwork,
		running: stale.running.value,
	}),
)
watch(
	() => appStore.networks,
	() => void stale.refresh().catch((error) => logCallFailure("stale-network refresh failed", error)),
)

const networkArrival = useNetworkArrival({
	client: () => managers.network,
	profileId: () => (appStore.isLogined ? appStore.profile?.id : undefined),
	onAnswerFailed: () => openToast({ kind: "error", label: "Something went wrong" }),
})
provide(NETWORK_ARRIVAL_KEY, networkArrival)
const arrived = computed(() =>
	networkArrivalView({
		logined: appStore.isLogined,
		route: { name: route.name, path: route.path },
		networkId: appStore.network?.id,
		arrived: networkArrival.arrived.value,
		networkIds: appStore.networks.map((n) => n.id),
		takeover: takeover.value !== null,
		legalSheet: legalSheetShown.value,
	}),
)
// The bootstrap's pass has written the record before the session reads as open; a switch to the
// arrived network answers it, and a rename or a deletion changes what it names.
watch(
	[() => appStore.isLogined && appStore.profile?.id, () => appStore.network?.id, () => appStore.networks],
	() => void networkArrival.refresh(),
)
/** No caller awaits a resume, so its failure is reported here. */
const resumeStale = (profileId) => stale.resume(profileId).catch((error) => logCallFailure("stale-network resume failed", error))
watch(
	() => appStore.isLogined && appStore.profile?.id,
	(active) => {
		stale.clear()
		if (active && !isDappWindow(route.name)) void resumeStale(active)
	},
)

// Identity-fenced network-switch orchestration — the body lives in
// `network-switch.ts` so its fence is unit-testable (this shell has no
// harness). The factory owns run invalidation, scope capture, and the
// generation+live-scope guard at every await boundary.
const switchNetwork = createNetworkSwitchHandler({
	getScope: () =>
		appStore.network && appStore.profile
			? { profileId: appStore.profile.id, networkId: appStore.network.id, chainId: appStore.network.chainId }
			: undefined,
	liveScopeMatches: (scope) =>
		appStore.profile?.id === scope.profileId && appStore.network?.id === scope.networkId && appStore.network?.chainId === scope.chainId,
	syncNetworkStatus: () => appStore.syncNetworkStatus(),
	markNetworkInactive: (networkId) => appStore.markNetworkInactive(networkId),
	replaceAccountClient: () => {
		managers.account?.disconnect()
		managers.account = new AccountServiceClient()
		return managers.account
	},
	setAccounts: (accounts) => {
		appStore.accounts = accounts
	},
	setupActiveAccount: () => appStore.setupActiveAccount(),
	syncTransactions: () => appStore.syncTransactions(),
	syncStaleNetwork: (networkId) => appStore.syncStaleNetwork(networkId),
	clearAccounts: () => {
		appStore.accounts = []
		appStore.account = undefined
	},
	resetUnattended: async (view, live) => {
		// The loader drops once the store holds the row's view: R1 for a failed run's journal, or none,
		// and the Header's skeleton while the re-keyed row's account loads.
		await runUnattended(managers.networkReset, view, async (completed) => {
			if (completed ? await reloadNetwork(view.networkId, live) : live()) await appStore.syncStaleNetwork(view.networkId)
		})
	},
})
watch(
	() => appStore.network,
	() => {
		switchRun = switchNetwork()
		// Only a completed reset awaits a run, so its failure is reported here.
		switchRun.catch((error) => logCallFailure("network switch failed", error))
	},
)

// `flush: "sync"`: a send settling in the next microtask must already see the new epoch.
watch([() => appStore.profile?.id, () => appStore.network?.id, () => appStore.account?.address], onScopeChanged, { flush: "sync" })
/** Both lock paths run this: a lock control's at once, a lock event's under its seal. */
const endScopeOnLock = () => {
	onLocked()
	switchNetwork.supersede()
}
watchLockStart(() => appStore.isLogined, endScopeOnLock)

/** The popup's locked state, entered from the lock event and from a boot-time session check
 *  that finds no session under an authenticated page (a worker restart). */
const lockedState = createLockedState({
	closePopups: () => {
		popupStore.closeAll()
		notificationStore.clear()
	},
	onLocked: endScopeOnLock,
	markLocked: () => {
		supersedeProfileActivations()
		appStore.isLogined = false
	},
	clearActivity: () => appStore.clearActivity(),
	resetInFlight: () => appStore.resetInFlight(),
	resetContactImports: () => appStore.resetContactImports(),
	openProfileId: () => (appStore.isLogined ? appStore.profile?.id : undefined),
	cachedProfiles: () => appStore.profiles,
	setProfiles: (profiles) => {
		appStore.profiles = profiles
	},
	route: (path) => router.push(path),
	selectedId: () => appStore.profile?.id,
	select: (profile) => {
		appStore.profile = profile
	},
	readLastActiveId: getLastActiveProfileId,
	routeName: () => route.name,
})

/** Sequence token for profile events. Handlers await service round-trips, and under load a
 *  stale LOCK event can resume after its own unlock has already re-activated the profile — its
 *  routing side effects would eject an active session to the auth screen (observed as e2e
 *  navigation stalls under CPU restriction). A newer event of either kind supersedes every
 *  older handler; superseded handlers abandon their mutations instead of racing them. */
let profileEventSeq = 0

const onActiveProfileChanged = async (profile) => {
	const seq = ++profileEventSeq
	if (profile) {
		lockedState.onSessionOpened(profile.id)
		// bootstrapActiveProfile carries its own lock-wins guard: it flips isLogined only if its
		// re-read of getActiveProfile() still finds the profile and no lock has superseded its run.
		// The wrap is load-bearing: an emitter-callback rejection would otherwise become an
		// unhandled rejection that silently starves the unlock flow's activation wait. The
		// identity-keyed failure record releases that waiter IMMEDIATELY (never the full
		// timeout); the seq fence makes the channel compare-and-commit, so a superseded run
		// can neither clear a newer run's record nor toast over a newer profile's outcome.
		await runFencedBootstrap({
			profileId: profile.id,
			bootstrap: () => bootstrapActiveProfile(profile),
			isCurrent: () => seq === profileEventSeq,
			setFailure: (record) => {
				appStore.bootstrapFailure = record
			},
			readFailure: () => appStore.bootstrapFailure,
			shouldToast: () => !appStore.isLogined || appStore.profile?.id === profile.id,
			toast: () => openToast({ kind: "error", label: "Something went wrong" }),
		})
		return
	}
	await lockedState.onLockEvent(
		() => managers.profile.getProfiles(),
		() => seq === profileEventSeq,
	)
}

/** Checks this window's selected profile against the stored list (`checkSelection`). */
const checkSelection = () => {
	const seq = profileEventSeq
	return lockedState.checkSelection(
		() => managers.profile.getProfiles(),
		() => seq === profileEventSeq,
	)
}
provide("checkSelection", checkSelection)

const onProfileDeleted = (profile) => {
	const seq = profileEventSeq
	void lockedState.onProfileDeleted(
		profile?.id,
		() => managers.profile.getProfiles(),
		() => seq === profileEventSeq,
	)
}

/** The profile unlocked in RECOVERY MODE: its imported-keys DEK (or the envelope MAC over it)
 *  failed, so the PXE store key and the dApp-session key cannot be derived — chain data, dApp
 *  sessions and imported accounts are unavailable until the profile is exported and restored. The
 *  service deliberately does NOT block the profile (export must stay reachable); this toast and the
 *  Home banner (`ProfileInfo.recoveryMode`) are the signals. */
const onImportedKeysDegraded = () => {
	openToast({ kind: "error", label: "Wallet keys need recovery. Export a backup and restore it" })
}

/** How the boot-time session check ended when it could NOT decide: "unreachable" (the service
 *  stayed unreachable across the backoff) or "failed" (an OPEN session whose activation
 *  bootstrap threw). Rendered as `data-boot-outcome` on the shell plus a banner with RETRY,
 *  so the user (and the e2e harness) can tell it from the transient lock screen the route guard
 *  parks a still-deciding popup on. Empty = deciding or decided. */
const bootOutcome = ref("")
// True from a RETRY pressed on a FAILED boot until that run reaches a decision: the marker
// clears at run start (the run may succeed), but the auth form must stay withheld meanwhile —
// re-enabling it mid-retry would invite a password into a screen about to route away.
const bootRetrying = ref(false)
// The auth page reads both to withhold its form while a FAILED boot's banner is the only true
// recovery: a password typed there would unlock an already-open session and repair nothing.
provide("bootOutcome", bootOutcome)
provide("bootRetrying", bootRetrying)

/** The boot-time check gave up. Mark it done so the guard's own retry takes over — an
 *  un-checked session would park the popup on /popup/auth for good. Unreachable with a known
 *  profile lands on the lock screen (the password path is a recovery, so it must be reachable,
 *  and the auth page needs a selected profile to submit against); unreachable with no profile
 *  known, and a failed bootstrap over an OPEN session, are NOT locks — re-entering a password
 *  repairs neither — so the popup stays put and the banner's RETRY is the recovery. */
const settleUndecidedBoot = (outcome, candidate, pageEstablished) => {
	bootOutcome.value = outcome
	appStore.isSessionChecked = true
	if (outcome !== "unreachable") return
	const action = decideUnreachableLanding({ hasProfile: !!appStore.profile, hasCandidate: !!candidate, pageEstablished })
	if (action === "stay") return
	if (action === "select-and-auth") appStore.profile = candidate
	router.push("/popup/auth")
}

/** No open session. Which way the shell goes is `decideLockLanding` over the shell's state at
 *  action time; `reconcileLockedBoot` fences the `lock` and `end-flow` actions against an unlock
 *  that landed through the event path while the lookup was in flight. */
const lockLandingState = (result, pageEstablished) => ({
	hasProfile: !!appStore.profile,
	onAuthRequiredRoute: !!route.meta.isAuthRequired,
	isPasskeyRoute: !!route.meta.isPasskeyInteraction,
	hasCandidate: !!result.candidate,
	pageEstablished,
	holdsSession: appStore.isLogined,
	onOpeningRoute: isOpeningRoute(route.name),
})
const lockLandingActions = {
	selectAndAuth: (result) => {
		appStore.profile = result.candidate
		appStore.isSessionChecked = true
		router.push("/popup/auth")
	},
	lock: (result) => {
		appStore.isSessionChecked = true
		lockedState.enter(result.profiles)
	},
	// Kept, an own window's flow would survive the lock screen and its unlock would reopen the form.
	endFlow: (result) => {
		endOpeningFlows()
		void releaseOwnWindow()
		lockLandingActions.lock(result)
	},
	settle: () => {
		appStore.isSessionChecked = true
	},
}

// Generation fence for loadProfile: mount and every drop of a Ready port start a run
// (`boot-triggers.ts`), and a run that awaited past a newer one must not commit — its push or
// marker would land on top of the newer run's (or the user's own unlock's) state.
let loadProfileSeq = 0

const loadProfile = async ({ reconnect = false } = {}) => {
	const seq = ++loadProfileSeq
	// A reconnect over a resolved route reaches a mounted page that owns its flow; a reconnect
	// before the router resolved has no page yet and must still land somewhere.
	// An own window's page owns its flow from its first boot.
	const pageEstablished = (reconnect && route.matched.length > 0) || ownWindowRoute() !== undefined
	const pathAtStart = route.matched.length > 0 ? route.fullPath : undefined
	const establishedNow = () => isEstablishedAtDecision(pageEstablished, pathAtStart, route.fullPath)
	const isCurrent = () => seq === loadProfileSeq
	// A new run supersedes any earlier give-up: it may well succeed this time. A retry of a
	// FAILED boot keeps the auth form withheld until a run DECIDES — latched, not recomputed:
	// a reconnect that starts a newer run mid-retry sees an empty outcome and must not drop it.
	bootRetrying.value = bootRetrying.value || bootOutcome.value === "failed"
	bootOutcome.value = ""
	managers.profile.onActiveProfileChanged.add(onActiveProfileChanged)
	managers.profile.onImportedKeysDegraded.add(onImportedKeysDegraded)
	managers.profile.onProfileDeleted.add(onProfileDeleted)

	const result = await reconcileLockedBoot({
		readEventSeq: () => profileEventSeq,
		isCurrent,
		lookup: () =>
			resolveBootSession({
				getProfiles: () => managers.profile.getProfiles(),
				getActiveProfile: () => managers.profile.getActiveProfile(),
				bootstrap: (profile) => bootstrapActiveProfile(profile),
				lastActiveProfileId: getLastActiveProfileId,
				isCurrent,
			}),
		decide: (locked) => decideLockLanding(lockLandingState(locked, establishedNow())),
		act: lockLandingActions,
	})
	// The core fenced itself before resolving; this caller resumes a microtask later, and a
	// reconnect can bump the sequence in between — fence again here, never on the core's word.
	if (!isCurrent()) return
	applyBootOutcome(result, bootOutcomeShell(establishedNow()))
	// A worker restart drops a running reset without a word; its journal resumes here.
	if (reconnect && appStore.isLogined && appStore.profile && !isDappWindow(route.name)) void resumeStale(appStore.profile.id)
}

/** The shell as `applyBootOutcome` drives it. */
const bootOutcomeShell = (pageEstablished) => ({
	setRetrying: (retrying) => {
		bootRetrying.value = retrying
	},
	setProfiles: (profiles) => {
		appStore.profiles = profiles
	},
	markChecked: () => {
		appStore.isSessionChecked = true
	},
	settleUndecided: (outcome, candidate) => settleUndecidedBoot(outcome, candidate, pageEstablished),
	logFailed: (profileId) => console.error("activation bootstrap failed for the open session", { profileId }),
	// Only advance into the authed area if the session survived bootstrap (a lock
	// mid-bootstrap leaves stillActive=false). See shouldAdvanceToGeneral.
	advance: (stillActive) => {
		if (shouldAdvanceToGeneral(stillActive, route.name)) router.push(postAuthRoute())
	},
})

// Settings are cosmetic (theme, links…): a read that rejects during a service-worker restart
// keeps the defaults and must never keep the session check from running.
const readSettings = async () => {
	try {
		const settings = await configService.getProps()
		for (const setting of settings) {
			// One handler hitting a browser-specific API must not skip the settings after it.
			try {
				applySetting(setting)
			} catch (error) {
				console.error("setting failed to apply at boot; default kept", { key: setting.key, error })
			}
		}
	} catch (error) {
		console.error("settings read failed at boot; defaults kept", { error })
	}
}

const startGrace = inject(START_GRACE_KEY, undefined)
const bootTriggers = createBootTriggers({
	client: managers.profile,
	routerReady: () => router.isReady(),
	readSettings,
	runBoot: (opts) => loadProfile(opts),
	replay: () => startGrace?.replay(),
})

onBeforeMount(() => bootTriggers.mount())

onMounted(async () => {
	/** DevTools Warnings -> Logo + Scam Prevention */
	const svgDataUrl = `data:image/svg+xml;base64,${btoa(LogoIcon)}`

	// biome-ignore lint/suspicious/noConsole: `_log` is the sniffer's saved original — this banner must reach the real DevTools console, not the log store.
	console._log(
		"%c ",
		`
			background-image: url(${svgDataUrl});
			padding-bottom: 100px;
			padding-left: 100px;
			margin: 20px;
			background-size: contain;
			background-position: center center;
			background-repeat: no-repeat;
		`,
	)

	const styleTitle = "color: #fff; font-family: sans-serif; font-size: 10em;"
	const styleText =
		"color: #fff; font-family: sans-serif; font-size: 2em; padding: 40px; border-radius: 24px; border: 2px solid orange; background: #1f1f1f; line-height: 160%"
	// biome-ignore lint/suspicious/noConsole: `_log` is the sniffer's saved original — this banner must reach the real DevTools console, not the log store.
	console._log("%cHold up!", styleTitle)
	// biome-ignore lint/suspicious/noConsole: `_log` is the sniffer's saved original — this banner must reach the real DevTools console, not the log store.
	console._log(
		"%cIf someone asks you to do something in this interface (DevTools), 100% they are trying to scam you. If you don't know what you are doing, close this window (cross in the upper right corner).",
		styleText,
	)
	// biome-ignore lint/suspicious/noConsole: `_log` is the sniffer's saved original — this banner must reach the real DevTools console, not the log store.
	console._log("%cYou can report a scam by email: hello@nulo.sh", styleText)
	/****************** */

	intervalId.value = window.setInterval(() => {
		if (!appStore.isLogined) return

		const _ = managers.profile?.getActiveProfile()
	}, 10_000)
})

watch(
	() => route.name,
	() => {
		if (appStore.isLogined) {
			const _ = managers.profile?.refreshSession()
		}

		appStore._isHomeScreenOpened = route.name === "popup-register" || route.name?.includes("windows-")
	},
)

onBeforeUnmount(() => {
	bootTriggers.dispose()
	clearInterval(intervalId.value)
	configService.disconnect()
	arrivalsIncoming.disconnect()
	arrivalsTokens.disconnect()
	arrivalsPrices.disconnect()
	stopAccountRows()
	accountRows.disconnect()
	arrivals.dispose()
	stale.dispose()
	networkArrival.dispose()
})
</script>

<template>
	<Flex
		wide
		direction="column"
		:class="$style.wrapper"
		:data-boot-outcome="bootOutcome || undefined"
		:data-session-checked="appStore.isSessionChecked ? 'true' : undefined"
		:data-service-ready="isServiceReady ? 'true' : undefined"
		:data-arrivals-seeded="arrivalsSeeded ? 'true' : undefined"
	>
		<div hidden data-testid="legal-sheet-verdict" :data-verdict="legalSheetMark" />
		<!-- Popup Teleport -->
		<div id="popup" />
		<div id="tooltip" />
		<div id="dropdown" />
		<div id="popover" />

		<div>
			<PopupManager />
			<ToastManager />
			<NotificationManager />
			<MigrationBarrier />
			<AccountIntegrityBarrier />
			<LegalAcceptanceSheet v-if="!takeover" @visibility="legalSheetShown = $event" />
		</div>

		<StartBar :boot-outcome="bootOutcome" />

		<StaleNetworkTakeover v-if="takeover" :view="takeover" />
		<NetworkArrival v-else-if="arrived" :network="arrived" :current="appStore.network?.name ?? ''" />
		<Header v-else />

		<Banner v-if="bootOutcome || bootRetrying" variant="warning" direction="vertical" data-testid="boot-outcome-banner">
			<Text>
				{{
					bootRetrying
						? "Retrying…"
						: bootOutcome === "failed"
							? "The wallet could not finish starting up."
							: "The wallet service could not be reached."
				}}
			</Text>
			<button type="button" :class="$style.retry" class="type--button-md" data-testid="boot-retry" :disabled="bootRetrying" @click="bootTriggers.retry()">RETRY</button>
		</Banner>

		<template v-if="!takeover && !arrived">
			<RouterView v-slot="{ Component }">
				<component :is="Component"></component>
			</RouterView>

			<Navigation v-if="$route.meta.showBottomNav" />
		</template>

		<div id="toast" data-testid="toast-root" :class="legalSheetShown && !takeover && $style.toast_over_sheet" />
	</Flex>
</template>

<style module>
.wrapper {
	position: relative;

	/* Clip, not hidden: focus and scrollIntoView scroll a hidden box, so content a pixel past the
	   popup's edge would shift the whole frame by it, with no way to scroll it back. A clip box is
	   no scroll container, so as a flex item its minimum size would follow its content without the
	   zero minimums hidden implied, and one unbreakable line could set its width. */
	overflow: clip;
	min-width: 0;
	min-height: 0;
}

/* While the Terms sheet (9000) shows, the snack draws over it, still under the start-up bar and the barriers. */
.toast_over_sheet {
	position: relative;
	z-index: 9500;
}

/* Its own line under the message, however short the message runs. */
.retry {
	display: block;
	align-self: flex-start;
	margin-top: 8px;
	padding: 4px 10px;
	color: inherit;
	line-height: inherit;
	background: transparent;
	border: 1px solid currentColor;
	cursor: pointer;
}
</style>
