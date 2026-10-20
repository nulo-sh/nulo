<script setup lang="ts">
/** Vendor */
import type { PropType } from "vue"

/** Components */
import TakeoverLayout from "@/components/composite/TakeoverLayout.vue"
import StaleNetworkConfirm from "./StaleNetworkConfirm.vue"

/** Composables */
import { useLockWallet } from "@/composables/useLockWallet"
import { useNetworkActivation } from "@/composables/useNetworkActivation"
import { exportsHeld, neverOpened, STALE_NETWORK_KEY } from "@/composables/useStaleNetwork"

/** Utils */
import { managers } from "@/utils/core"
import type { TakeoverAction as Action, TakeoverContent as Content, TakeoverLine as BoxLine } from "@/components/composite/takeover"
import { type TakeoverScreen, takeoverScreen } from "@/popup/stale-takeover"
import type { StaleNetworkView } from "@/wallet/services/network-reset/client"
import * as copy from "./copy"

/** Store */
import { useAppStore } from "@/stores/app.store"
import { usePopupStore } from "@/stores/popup.store"

const props = defineProps({
	/** The view to render: the active network's, or the one whose reset runs. */
	view: { type: Object as PropType<StaleNetworkView>, required: true },
})

const appStore = useAppStore()
const popupStore = usePopupStore()

const { lock, dispose: disposeLock } = useLockWallet(managers.profile)
const { activate } = useNetworkActivation({
	persist: (id) => managers.network!.setActiveNetwork(id),
	read: () => managers.network!.getActiveNetwork(),
})
const stale = inject(STALE_NETWORK_KEY)!

const router = useRouter()

const confirming = ref(false)
const screen = computed(() =>
	takeoverScreen(props.view, stale.running.value?.networkId === props.view.networkId, stale.nodeDown.value === props.view.networkId),
)

const openNetworks = () => router.push("/popup/settings/networks")
const openExport = () => router.push("/popup/settings/security/export/account")
const start = () => stale.start(props.view)
const goToPending = async () => {
	const target = appStore.networks.find((n) => n.id === props.view.otherPending?.networkId)
	if (target) await activate(target)
}

const SWITCH: Action = { text: copy.SWITCH_NETWORK, testid: "stale-network-switch", action: openNetworks }

const accountLine = (view: StaleNetworkView): BoxLine[] =>
	view.accounts.length > 0 ? [{ mark: "check", text: copy.accountLine(view.name, view.accounts.length, view.cause.addressesMoved) }] : []

const causeEyebrow = (view: StaleNetworkView): Content["eyebrow"] => ({
	icon: "refresh",
	text: (view.cause.networkReset ? copy.networkReset(view.name) : copy.newAddresses(view.name)).eyebrow,
})

const SCREENS: Partial<Record<TakeoverScreen, (view: StaleNetworkView) => Content>> = {
	"network-reset": (view) => cause(view),
	"new-addresses": (view) => cause(view),
	blocked: (view) => {
		const c = copy.mainnetBlocked(view.name)
		return {
			eyebrow: { icon: "warning", text: c.eyebrow },
			title: c.title,
			body: c.body,
			box: { lines: c.lines.map((text) => ({ mark: "check", text })) },
			note: c.note,
			primary: SWITCH,
		}
	},
	paused: (view) => {
		const c = copy.paused(view.name)
		const imported = view.reset?.imported ?? []
		const exportable = exportsHeld(view, appStore.profile?.type)
		const retry: Action = { text: c.primary, testid: "stale-network-retry", action: start, guarded: true }
		const exportHeld: Action = { text: copy.EXPORT_IMPORTED, testid: "stale-network-export", action: openExport }
		return {
			eyebrow: { icon: "pause", text: c.eyebrow },
			title: c.title,
			body: c.body,
			notice: imported.length > 0 ? copy.pausedImported(view.name, imported, exportable) : undefined,
			box: {
				label: c.label,
				lines: [{ mark: "check", text: c.pickUp }, ...accountLine(view), { mark: "check", text: copy.KEEP_LINE }],
			},
			note: c.note,
			...(exportable ? { primary: exportHeld, secondary: retry, tertiary: SWITCH } : { primary: retry, secondary: SWITCH }),
		}
	},
	"already-added": (view) => {
		const c = copy.alreadyAdded(view.name, view.heldBy!.name)
		return {
			eyebrow: { icon: "refresh", text: c.eyebrow },
			title: c.title,
			body: c.body,
			box: { label: c.label, lines: c.steps.map((text, i) => ({ number: i + 1, text })) },
			note: c.note,
			primary: { text: c.primary, testid: "stale-network-open-networks", action: openNetworks },
		}
	},
	"one-at-a-time": (view) => {
		const c = copy.oneAtATime(view.name, view.otherPending!.name)
		return {
			eyebrow: causeEyebrow(view),
			title: c.title,
			body: c.body,
			box: { lines: c.lines.map((text) => ({ mark: "check", text })) },
			primary: { text: c.primary, testid: "stale-network-go-to", action: goToPending },
			secondary: SWITCH,
		}
	},
	"node-down": (view) => {
		const c = copy.nodeDown(view.name)
		return {
			eyebrow: { icon: "no-signal", text: causeEyebrow(view).text },
			title: c.title,
			body: c.body,
			note: c.note,
			primary: { text: c.primary, testid: "stale-network-retry", action: start },
			secondary: SWITCH,
		}
	},
}

/** A1, A2, or both causes: A1 with the address line and no notice. A network the profile never
 *  opened lists only what changes: its node, since it holds no account, token or history. */
function cause(view: StaleNetworkView): Content {
	const { networkReset } = view.cause
	const c: { title: string; body: string; notice?: string } = networkReset ? copy.networkReset(view.name) : copy.newAddresses(view.name)
	const node: BoxLine[] = view.switchToSeedNode
		? [{ mark: "swap", text: copy.nodeLine(view.name), testid: "stale-network-node-line" }]
		: []
	return {
		eyebrow: causeEyebrow(view),
		title: c.title,
		body: c.body,
		notice: networkReset ? undefined : c.notice,
		box: {
			label: copy.willLabel(view.name),
			lines: [
				...accountLine(view),
				...node,
				{ mark: "check", text: copy.KEEP_LINE },
				...(neverOpened(view) ? [] : [{ mark: "cross", text: copy.removeLine(view.name) } satisfies BoxLine]),
			],
		},
		note: networkReset ? copy.NO_PHRASE_NOTE : undefined,
		primary: { text: copy.resetButton(view.name), testid: "stale-network-reset", action: () => (confirming.value = true) },
		secondary: SWITCH,
	}
}

const content = computed(() => SCREENS[screen.value]?.(props.view))
/** A1 with the node line runs one line longer, so its gaps tighten to keep the buttons' margin. */
const density = computed(() => {
	if (props.view.switchToSeedNode && content.value?.box?.label) return "dense_tight"
	return content.value?.notice ? "dense_notice" : undefined
})

/** A4: the removal step, then each account done so far and the one in progress. */
const steps = computed(() => {
	const { reset, accounts, cause, name } = props.view
	const purged = reset?.purged ?? false
	const progress = copy.progress(name)
	const out: { text: string; done: boolean }[] = [{ text: purged ? progress.removed : progress.removing, done: purged }]
	if (!purged) return out
	const doneCount = reset?.doneCount ?? 0
	accounts.forEach((account, i) => {
		if (i <= doneCount) out.push({ text: copy.accountStep(account.name, i < doneCount, cause.addressesMoved), done: i < doneCount })
	})
	return out
})

const confirmReset = async () => {
	confirming.value = false
	await stale.start(props.view)
}

// The takeover owns the popup: one opened over the route it replaces, such as Receive's address,
// must not outlive it.
onMounted(() => popupStore.closeAll())
onBeforeUnmount(() => {
	disposeLock()
})
</script>

<template>
	<Flex
		v-if="screen === 'loading'"
		direction="column"
		:class="$style.progress"
		aria-busy="true"
		data-testid="stale-network-takeover"
		data-screen="loading"
	>
		<Flex direction="column" gap="8">
			<span :class="$style.eyebrow_text">{{ copy.opening(view.name).preTitle }}</span>
			<h1 :class="$style.title_progress" data-testid="stale-network-title">{{ copy.opening(view.name).title }}</h1>
			<p :class="$style.body">{{ copy.opening(view.name).body }}</p>
		</Flex>
		<div :class="$style.opening_spinner"><Spinner size="22" color="--txt-primary" /></div>
	</Flex>

	<Flex v-else-if="screen === 'progress'" direction="column" :class="$style.progress" data-testid="stale-network-takeover" data-screen="progress">
		<Flex direction="column" gap="8" data-testid="stale-progress">
			<span :class="$style.eyebrow_text">{{ copy.progress(view.name).preTitle }}</span>
			<h1 :class="$style.title_progress" data-testid="stale-network-title">{{ copy.progress(view.name).title }}</h1>
			<p :class="$style.body">{{ copy.progress(view.name).body }}</p>
		</Flex>
		<div role="list" :class="$style.steps">
			<div v-for="step in steps" :key="step.text" role="listitem" :class="$style.step" data-testid="stale-progress-step">
				<Icon v-if="step.done" name="check" :size="16" color="txt-success" aria-hidden="true" />
				<Spinner v-else size="16" color="--txt-primary" />
				<span :class="step.done ? $style.step_text : $style.step_text_current">{{ step.text }}</span>
			</div>
		</div>
		<span :class="$style.note">{{ copy.progress(view.name).footer }}</span>
	</Flex>

	<TakeoverLayout
		v-else-if="content"
		:content="content"
		:chip="copy.chipLabel(view.name)"
		flagged
		:busy="stale.starting.value"
		:density="density"
		testid-prefix="stale-network"
		:data-screen="screen"
		@chip="openNetworks"
		@lock="lock"
	>
		<StaleNetworkConfirm :show="confirming" :view="view" @onClose="confirming = false" @confirm="confirmReset" />
	</TakeoverLayout>
</template>

<style module>
.eyebrow_text {
	composes: type--meta from global;
	color: var(--txt-secondary);
}

.title_progress {
	composes: type--row-title from global;
	margin: 0;
	font-size: 24px;
	color: var(--txt-primary);
	overflow-wrap: anywhere;
}

.body {
	composes: type--body from global;
	margin: 0;
	line-height: 1.55;
	color: var(--txt-body);
}

.note {
	composes: type--body from global;
	color: var(--txt-secondary);
}

.progress {
	flex: 1;
	min-height: 0;
	justify-content: center;
	gap: 22px;
	padding: 0 28px;
	background: var(--app-bg);
}

.opening_spinner {
	display: flex;
}

.steps {
	display: flex;
	flex-direction: column;
	background: var(--card-bg);
	border: 1px solid var(--border);
}

.step {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 13px 14px;
	color: var(--txt-primary);
}

.step_text {
	composes: type--body from global;
}

.step + .step {
	border-top: 1px solid var(--hairline-strong);
}

.step_text_current {
	composes: type--value from global;
}
</style>
