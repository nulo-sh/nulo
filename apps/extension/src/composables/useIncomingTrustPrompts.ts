import { watch } from "vue"
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"
import type { ConfigProp, ConfigServiceClient } from "@/wallet/services/config/client"
import type {
	IncomingTransferPending,
	IncomingTransferServiceClient,
	IncomingTrustRecord,
} from "@/wallet/services/incoming-transfer/client"

type IncomingClient = Pick<
	IncomingTransferServiceClient,
	"onIncomingTransferPending" | "onIncomingTrustChanged" | "onConnected" | "setTrustAllow" | "setTrustReject" | "replayPendingPrompts"
>
type ConfigClient = Pick<ConfigServiceClient, "onUpdate">

type TrustPrompt = Partial<
	Pick<IncomingTransferPending, "tokenSymbol" | "tokenDecimals" | "amountRaw" | "contract" | "profileId" | "networkId" | "accountAddress">
> & {
	allow?: () => Promise<void>
	reject?: () => Promise<void>
}

/** One call's queue, replay key and visibility gate, plus what its functions read. */
interface Prompts {
	pendingTrustQueue: IncomingTransferPending[]
	replayedForKey: string | null
	lastVisibility: boolean
	visibilityInitialized: boolean
	incomingTransferService: IncomingClient
	appStore: ReturnType<typeof useAppStore>
	popupStore: ReturnType<typeof usePopupStore>
	cacheStore: ReturnType<typeof useCacheStore>
}

function tripleKeyOf(payload: IncomingTransferPending) {
	return `${payload.profileId}|${payload.networkId}|${payload.contract}`
}

function activePopupKey(s: Prompts) {
	const t = s.cacheStore.incomingTrust as TrustPrompt
	if (!t || !t.contract) return null
	return `${t.profileId ?? ""}|${t.networkId ?? ""}|${t.contract}`
}

// The open prompt counts as queued, so a replay while it is open does not queue it again.
function enqueueIfNew(s: Prompts, payload: IncomingTransferPending) {
	const key = tripleKeyOf(payload)
	if (s.popupStore.isOpened("incoming_trust") && activePopupKey(s) === key) return false
	if (s.pendingTrustQueue.some((p) => tripleKeyOf(p) === key)) return false
	s.pendingTrustQueue.push(payload)
	return true
}

function payloadMatchesLiveTriple(s: Prompts, p: IncomingTransferPending) {
	return (
		p.profileId === s.appStore.profile?.id && p.networkId === s.appStore.network?.id && p.accountAddress === s.appStore.account?.address
	)
}

function dequeueNextPendingTrust(s: Prompts) {
	if (s.popupStore.isOpened("incoming_trust")) return
	// The identity can change while payloads wait, so each is re-checked here.
	while (s.pendingTrustQueue.length > 0) {
		const next = s.pendingTrustQueue.shift()
		if (!next) return
		if (!payloadMatchesLiveTriple(s, next)) continue
		s.cacheStore.incomingTrust = {
			tokenSymbol: next.tokenSymbol,
			tokenDecimals: next.tokenDecimals,
			amountRaw: next.amountRaw,
			contract: next.contract,
			profileId: next.profileId,
			networkId: next.networkId,
			accountAddress: next.accountAddress,
			allow: () => s.incomingTransferService.setTrustAllow(next.profileId, next.networkId, next.contract),
			reject: () => s.incomingTransferService.setTrustReject(next.profileId, next.networkId, next.contract),
		}
		s.popupStore.open("incoming_trust")
		return
	}
}

// A replay can resolve after an identity switch, so a payload for any identity but the live one
// is dropped before it can queue or bind its allow and reject to the wrong triple.
function onIncomingTransferPending(s: Prompts, payload: IncomingTransferPending) {
	if (payload.profileId !== s.appStore.profile?.id) return
	if (payload.networkId !== s.appStore.network?.id) return
	if (payload.accountAddress !== s.appStore.account?.address) return
	if (!enqueueIfNew(s, payload)) return
	dequeueNextPendingTrust(s)
}

// A token deleted while its prompt waits resets trust to `unknown`: its queued payloads go, and an
// open prompt for it closes instead of offering an Allow the service would ignore.
function purgeTripleFromQueue(s: Prompts, profileId: string, networkId: string, contract: string) {
	for (let i = s.pendingTrustQueue.length - 1; i >= 0; i--) {
		const p = s.pendingTrustQueue[i]
		if (p.profileId === profileId && p.networkId === networkId && p.contract === contract) {
			s.pendingTrustQueue.splice(i, 1)
		}
	}
	if (s.popupStore.isOpened("incoming_trust")) {
		const t = s.cacheStore.incomingTrust as TrustPrompt
		if (t?.profileId === profileId && t?.networkId === networkId && t?.contract === contract) {
			s.popupStore.close("incoming_trust")
			s.cacheStore.incomingTrust = {}
		}
	}
}
function onIncomingTrustChanged(s: Prompts, record: IncomingTrustRecord) {
	if (record?.state !== "unknown") return
	purgeTripleFromQueue(s, record.profileId, record.networkId, record.contract)
}

// Called from `onConnected` and on every identity change, since either can come first after a
// popup open; the replay key makes the second a no-op. A replay that resolves after a further
// switch only queues payloads the live-identity checks then drop.
async function tryReplayForTriple(s: Prompts) {
	const pid = s.appStore.profile?.id
	const nid = s.appStore.network?.id
	const addr = s.appStore.account?.address
	if (!pid || !nid || !addr) return
	const key = `${pid}|${nid}|${addr}`
	if (s.replayedForKey === key) return
	s.replayedForKey = key
	try {
		await s.incomingTransferService.replayPendingPrompts(pid, nid, addr)
	} catch {
		// Transient port hiccup. Allow retry on the next triple change.
		s.replayedForKey = null
	}
}

function onTripleChanged(s: Prompts) {
	for (let i = s.pendingTrustQueue.length - 1; i >= 0; i--) {
		if (!payloadMatchesLiveTriple(s, s.pendingTrustQueue[i])) {
			s.pendingTrustQueue.splice(i, 1)
		}
	}
	if (s.popupStore.isOpened("incoming_trust")) {
		const t = s.cacheStore.incomingTrust as TrustPrompt
		// Trust payloads are account-scoped, so an account-only switch closes the prompt too.
		const matches =
			t?.profileId === s.appStore.profile?.id &&
			t?.networkId === s.appStore.network?.id &&
			t?.accountAddress === s.appStore.account?.address
		if (!matches) {
			s.popupStore.close("incoming_trust")
			s.cacheStore.incomingTrust = {}
		}
	}
	tryReplayForTriple(s)
}

// The service stays silent while transfers are hidden, so turning them back on replays here, where
// the live identity is known.
function onConfigUpdate(s: Prompts, prop: ConfigProp) {
	if (!s.visibilityInitialized) return
	if (prop.key !== "incomingTransfersVisible") return
	const newValue = prop.value !== false
	const wasOff = s.lastVisibility === false
	s.lastVisibility = newValue
	if (!wasOff || !newValue) return
	if (!s.appStore.profile?.id || !s.appStore.network?.id || !s.appStore.account?.address) return
	s.incomingTransferService.replayPendingPrompts(s.appStore.profile.id, s.appStore.network.id, s.appStore.account.address).catch(() => {
		// Replay best-effort; transient port hiccups must not crash the popup.
	})
}

/**
 * The incoming-trust prompt queue: one prompt at a time, deduped by (profile, network, contract),
 * only ever for the live identity. Call synchronously in setup; the parent owns both clients'
 * connect and disconnect. `seedVisibility` takes the stored `incomingTransfersVisible` (undefined
 * when the read failed) and only then starts listening for its changes, unless `dispose` already ran;
 * `dispose` removes every listener this call added, except `onConnected`'s, which lives as long as
 * the client.
 */
export function useIncomingTrustPrompts(incoming: IncomingClient, config: ConfigClient) {
	const s: Prompts = {
		pendingTrustQueue: [],
		replayedForKey: null,
		lastVisibility: true,
		visibilityInitialized: false,
		incomingTransferService: incoming,
		appStore: useAppStore(),
		popupStore: usePopupStore(),
		cacheStore: useCacheStore(),
	}
	const onPending = (payload: IncomingTransferPending) => onIncomingTransferPending(s, payload)
	const onTrustChanged = (record: IncomingTrustRecord) => onIncomingTrustChanged(s, record)
	const onUpdate = (prop: ConfigProp) => onConfigUpdate(s, prop)

	incoming.onIncomingTransferPending.add(onPending)
	incoming.onIncomingTrustChanged.add(onTrustChanged)
	incoming.onConnected.add(() => tryReplayForTriple(s))
	const unwatchTriple = watch(
		() => [s.appStore.profile?.id, s.appStore.network?.id, s.appStore.account?.address],
		() => onTripleChanged(s),
		{ immediate: false },
	)
	watch(
		() => s.popupStore.isOpened("incoming_trust"),
		(isOpen, wasOpen) => {
			if (!wasOpen || isOpen) return
			dequeueNextPendingTrust(s)
		},
	)

	let disposed = false

	function seedVisibility(visible: boolean | undefined) {
		if (disposed) return
		if (visible !== undefined) s.lastVisibility = visible
		config.onUpdate.add(onUpdate)
		s.visibilityInitialized = true
	}

	function dispose() {
		disposed = true
		config.onUpdate.remove(onUpdate)
		incoming.onIncomingTrustChanged.remove(onTrustChanged)
		incoming.onIncomingTransferPending.remove(onPending)
		unwatchTriple()
	}

	return { seedVisibility, dispose }
}
