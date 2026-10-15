<script setup>
/** Components */
import StaleIcon from "./StaleIcon.vue"
import StaleNetworkConfirm from "./StaleNetworkConfirm.vue"

/** Composables */
import { useLockWallet } from "@/composables/useLockWallet"
import { useNetworkActivation } from "@/composables/useNetworkActivation"
import { refuseRepeatEnter } from "@/composables/usePopupEntity"
import { STALE_NETWORK_KEY } from "@/composables/useStaleNetwork"

/** Utils */
import { managers } from "@/utils/core"
import { takeoverScreen } from "@/popup/stale-takeover"
import * as copy from "./copy"

/** Store */
import { useAppStore } from "@/stores/app.store"
import { usePopupStore } from "@/stores/popup.store"

const props = defineProps({
	/** The view to render: the active network's, or the one whose reset runs. */
	view: { type: Object, required: true },
})

const appStore = useAppStore()
const popupStore = usePopupStore()

const { lock, dispose: disposeLock } = useLockWallet(managers.profile)
const { activate } = useNetworkActivation({
	persist: (id) => managers.network.setActiveNetwork(id),
	read: () => managers.network.getActiveNetwork(),
})
const stale = inject(STALE_NETWORK_KEY)

const router = useRouter()

const confirming = ref(false)
const screen = computed(() =>
	takeoverScreen(props.view, stale.running.value?.networkId === props.view.networkId, stale.nodeDown.value === props.view.networkId),
)

const MARK_COLORS = { check: "--txt-primary", cross: "--orange", swap: "--txt-warning" }

const openNetworks = () => router.push("/popup/settings/networks")
const start = () => stale.start(props.view)
const goToPending = async () => {
	const target = appStore.networks.find((n) => n.id === props.view.otherPending?.networkId)
	if (target) await activate(target)
}

const SWITCH = { text: copy.SWITCH_NETWORK, testid: "stale-network-switch", action: openNetworks }

const accountLine = (view) =>
	view.accounts.length > 0 ? [{ mark: "check", text: copy.accountLine(view.name, view.accounts.length, view.cause.addressesMoved) }] : []

const causeEyebrow = (view) =>
	view.cause.networkReset
		? { icon: "reset", text: copy.networkReset(view.name).eyebrow }
		: { icon: "warning", text: copy.newAddresses(view.name).eyebrow }

const SCREENS = {
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
		return {
			eyebrow: { icon: "pause", text: c.eyebrow },
			title: c.title,
			body: c.body,
			box: {
				label: c.label,
				lines: [{ mark: "check", text: c.pickUp }, ...accountLine(view), { mark: "check", text: copy.KEEP_LINE }],
			},
			note: c.note,
			primary: { text: c.primary, testid: "stale-network-retry", action: start },
			secondary: SWITCH,
		}
	},
	"already-added": (view) => {
		const c = copy.alreadyAdded(view.name, view.heldBy.name)
		return {
			eyebrow: { icon: "reset", text: c.eyebrow },
			title: c.title,
			body: c.body,
			box: { label: c.label, lines: c.steps.map((text, i) => ({ number: i + 1, text })) },
			note: c.note,
			primary: { text: c.primary, testid: "stale-network-open-networks", action: openNetworks },
		}
	},
	"one-at-a-time": (view) => {
		const c = copy.oneAtATime(view.name, view.otherPending.name)
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
			eyebrow: { icon: "no-signal", text: c.eyebrow },
			title: c.title,
			body: c.body,
			note: c.note,
			primary: { text: c.primary, testid: "stale-network-retry", action: start },
			secondary: SWITCH,
		}
	},
}

/** A1, A2, or both causes: A1 with the address line and no notice. */
function cause(view) {
	const { networkReset } = view.cause
	const c = networkReset ? copy.networkReset(view.name) : copy.newAddresses(view.name)
	const node = view.switchToSeedNode ? [{ mark: "swap", text: copy.nodeLine(view.name), testid: "stale-network-node-line" }] : []
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
				{ mark: "cross", text: copy.removeLine(view.name) },
			],
		},
		note: networkReset ? copy.NO_PHRASE_NOTE : undefined,
		primary: { text: copy.resetButton(view.name), testid: "stale-network-reset", action: () => (confirming.value = true) },
		secondary: SWITCH,
	}
}

const content = computed(() => (screen.value === "progress" ? undefined : SCREENS[screen.value](props.view)))
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
	const out = [{ text: purged ? progress.removed : progress.removing, done: purged }]
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
	<Flex v-if="screen === 'progress'" direction="column" :class="$style.progress" data-testid="stale-network-takeover" data-screen="progress">
		<Flex direction="column" gap="8" data-testid="stale-progress">
			<span :class="$style.eyebrow_text">{{ copy.progress(view.name).preTitle }}</span>
			<h1 :class="$style.title_progress" data-testid="stale-network-title">{{ copy.progress(view.name).title }}</h1>
			<p :class="$style.body">{{ copy.progress(view.name).body }}</p>
		</Flex>
		<div role="list" :class="$style.steps">
			<div v-for="step in steps" :key="step.text" role="listitem" :class="$style.step" data-testid="stale-progress-step">
				<StaleIcon v-if="step.done" name="check" :size="16" color="--txt-success" />
				<Spinner v-else size="16" color="--txt-primary" />
				<span :class="step.done ? $style.step_text : $style.step_text_current">{{ step.text }}</span>
			</div>
		</div>
		<span :class="$style.note">{{ copy.progress(view.name).footer }}</span>
	</Flex>

	<Flex v-else direction="column" :class="$style.screen" data-testid="stale-network-takeover" :data-screen="screen">
		<div :class="$style.top_bar">
			<button type="button" :class="$style.chip" data-testid="stale-network-chip" @click="openNetworks">
				{{ copy.chipLabel(view.name) }}<span :class="$style.chip_square" />
			</button>
			<button type="button" :class="$style.chip" data-testid="stale-network-lock" aria-label="Lock wallet" @click="lock">
				<StaleIcon name="lock" :size="12" />LOCK
			</button>
		</div>

		<div :class="[$style.content, density && $style[density]]">
			<div :class="$style.eyebrow">
				<StaleIcon :name="content.eyebrow.icon" :size="16" color="--txt-warning" />
				<span :class="$style.eyebrow_text">{{ content.eyebrow.text }}</span>
			</div>
			<h1 :class="$style.title" data-testid="stale-network-title">{{ content.title }}</h1>
			<p :class="$style.body">{{ content.body }}</p>
			<div v-if="content.notice" :class="$style.notice" data-testid="stale-network-notice">{{ content.notice }}</div>
			<div v-if="content.box" :class="$style.box" data-testid="stale-network-box">
				<span v-if="content.box.label" :class="$style.box_label">{{ content.box.label }}</span>
				<div v-for="line in content.box.lines" :key="line.text" :class="$style.line" :data-testid="line.testid">
					<span v-if="line.number" :class="$style.number">{{ line.number }}</span>
					<StaleIcon v-else :name="line.mark" :size="14" :color="MARK_COLORS[line.mark]" :class="$style.mark" />
					<span>{{ line.text }}</span>
				</div>
			</div>
			<span v-if="content.note" :class="$style.note" data-testid="stale-network-note">{{ content.note }}</span>
		</div>

		<div :class="[$style.actions, density === 'dense_notice' && $style.actions_notice]">
			<button
				type="button"
				:class="$style.primary"
				:data-testid="content.primary.testid"
				:disabled="stale.starting.value"
				@keydown="refuseRepeatEnter"
				@click="content.primary.action"
			>
				{{ content.primary.text }}
			</button>
			<button v-if="content.secondary" type="button" :class="$style.secondary" :data-testid="content.secondary.testid" @click="content.secondary.action">
				{{ content.secondary.text }}
			</button>
		</div>

		<StaleNetworkConfirm :show="confirming" :view="view" @onClose="confirming = false" @confirm="confirmReset" />
	</Flex>
</template>

<style module>
.screen {
	flex: 1;
	min-height: 0;
	background: var(--app-bg);
}

.top_bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 14px 16px;
	border-bottom: 1px solid var(--hairline-strong);
}

.chip {
	composes: type--tag from global;
	display: flex;
	align-items: center;
	gap: 8px;
	max-width: 60%;
	padding: 7px 10px;
	color: var(--txt-primary);
	background: transparent;
	border: 1px solid var(--nulo-outline);
	cursor: pointer;
}

.chip:focus-visible,
.primary:focus-visible,
.secondary:focus-visible {
	outline: 2px solid var(--nulo-accent);
	outline-offset: 2px;
}

.chip_square {
	flex: none;
	width: 7px;
	height: 7px;
	background: var(--yellow);
}

.content {
	flex: 1;
	min-height: 0;
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 22px 20px 0;
	overflow-y: auto;
}

.content.dense_notice {
	gap: 13px;
	padding-top: 20px;
}

.content.dense_tight {
	gap: 11px;
	padding-top: 18px;
}

.eyebrow {
	display: flex;
	align-items: center;
	gap: 8px;
}

.eyebrow_text {
	composes: type--meta from global;
	color: var(--txt-secondary);
}

.title {
	composes: type--row-title from global;
	margin: 0;
	font-size: 26px;
	line-height: 1.15;
	color: var(--txt-primary);
	overflow-wrap: anywhere;
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

.notice {
	composes: type--body from global;
	padding: 10px 12px;
	line-height: 1.45;
	color: var(--txt-warning);
	background: color-mix(in srgb, var(--yellow) 7%, transparent);
	border: 1px solid color-mix(in srgb, var(--yellow) 45%, transparent);
}

.box {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 14px;
	background: var(--card-bg);
	border: 1px solid var(--border);
}

.dense_tight .box {
	gap: 8px;
	padding: 12px 14px;
}

.box_label {
	composes: type--meta from global;
	color: var(--txt-secondary);
}

.line {
	composes: type--body from global;
	display: flex;
	align-items: flex-start;
	gap: 10px;
	line-height: 1.45;
	color: var(--txt-primary);
}

.mark {
	margin-top: 2px;
}

.number {
	composes: type--data from global;
	flex: none;
	width: 14px;
	text-align: center;
	color: var(--txt-warning);
}

.note {
	composes: type--body from global;
	color: var(--txt-secondary);
}

.actions {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 16px 20px 20px;
}

.actions_notice {
	padding-top: 14px;
}

.primary {
	composes: type--button from global;
	height: 48px;
	cursor: pointer;
	color: var(--txt-inverse);
	background: var(--nulo-accent);
	border: 0;
}

.primary:disabled {
	cursor: default;
	opacity: 0.6;
}

.secondary {
	composes: type--button from global;
	height: 48px;
	cursor: pointer;
	color: var(--txt-primary);
	background: transparent;
	border: 1px solid var(--nulo-outline);
}

.progress {
	flex: 1;
	min-height: 0;
	justify-content: center;
	gap: 22px;
	padding: 0 28px;
	background: var(--app-bg);
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
