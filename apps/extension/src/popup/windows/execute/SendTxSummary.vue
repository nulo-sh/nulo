<script setup lang="ts">
/**
 * A send's calls as numbered steps on a rail, then the line naming the calls the wallet decoded but
 * did not read, the closing advice, and every authorization in one node at the rail's end. Each step
 * and the node open their own details; only the wallet's own reading of a transfer or mint states an
 * amount or a party. Nothing places an authorization under a call: the wallet holds no link between
 * them.
 */
import type { DiscoveredAuthwit } from "@/wallet/services/execution/client"
import type { TokenInfo } from "@/wallet/services/token/client"
import {
	type CallSurface,
	type WireCall,
	amountOf,
	authwitLine,
	authwitTitle,
	RAW_ADVICE,
	RAW_LINE,
	RAW_TITLE,
	rawRows,
	rowTitle,
	uncheckedCallsLine,
} from "./call-surface"
import ArgsNotice from "./ArgsNotice.vue"
import AuthwitDetails from "./AuthwitDetails.vue"
import CallArguments from "./CallArguments.vue"
import StepRow from "./StepRow.vue"

export type AuthwitGroup = { testid: string; label: string }

const props = defineProps<{
	calls: readonly { call: WireCall; surface: CallSurface }[]
	/** The authorizations the transaction uses, each with its reading and the details group it reads
	 *  in; absent while none are listed. */
	authwits?: readonly { authwit: DiscoveredAuthwit; surface: CallSurface; group: AuthwitGroup }[]
	/** The wallet is still finding the authorizations. */
	checkingAuthwits?: boolean
	chainId?: number
	tokens?: readonly TokenInfo[]
	/** Where the window's closing advice reads: after the calls, or under the last unreadable
	 *  authorization whose arguments are open. */
	advice?: "calls" | "authwits"
	previewFailed?: boolean
}>()

const emit = defineEmits<{ retryPreview: [] }>()

const callRows = computed(() =>
	props.calls.map(({ call, surface }) => ({
		call,
		surface,
		title: rowTitle(call, surface),
		amount:
			surface.kind === "transfer" || surface.kind === "mint"
				? amountOf(props.tokens, props.chainId, call.to, surface.amount)
				: undefined,
	})),
)

const uncheckedLine = computed(() => uncheckedCallsLine(callRows.value.map(({ surface }) => surface)))

const authwitRows = computed(() =>
	(props.authwits ?? []).map(({ authwit, surface, group }) => {
		const line = authwitLine(surface, authwitTitle(authwit.selector, authwit.consumer, surface))
		return {
			authwit,
			surface,
			group,
			line,
			amount: line.kind === "move" ? amountOf(props.tokens, props.chainId, authwit.consumer, line.amount) : undefined,
		}
	}),
)

const uid = useId()
const stepPanel = (j: number): string => `${uid}-step-${j}`
const part = (j: number, name: "head" | "line" | "note"): string => `${uid}-${name}-${j}`
/** The sentence describes its row part by part, so the parts read with a space between them. */
const describedBy = (j: number, row: { amount?: unknown; surface: CallSurface }): string =>
	[part(j, "head"), row.amount && part(j, "line"), (row.surface.kind === "pending" || row.surface.kind === "raw") && part(j, "note")]
		.filter(Boolean)
		.join(" ")
const authwitPanel = (k: number): string => `${uid}-authwit-${k}`

const openSteps = ref(new Set<number>())
const toggleStep = (j: number): void => {
	const next = new Set(openSteps.value)
	if (next.has(j)) next.delete(j)
	else next.add(j)
	openSteps.value = next
}

/** Survives a re-estimate that swaps the list for "Checking authorizations…" and back. */
const nodeOpen = ref(false)
const nodePanels = computed(() => authwitRows.value.map((_, k) => authwitPanel(k)).join(" "))

/** Which authorizations the person closed: once the node opens, each one's arguments are open too, so
 *  an unreadable one's raw fields stay within two presses of the card at rest. */
const closedAuthwits = ref(new Set<string>())
const isAuthwitOpen = (a: DiscoveredAuthwit): boolean => !closedAuthwits.value.has(a.messageHash)
const toggleAuthwit = (a: DiscoveredAuthwit): void => {
	const next = new Set(closedAuthwits.value)
	if (next.has(a.messageHash)) next.delete(a.messageHash)
	else next.add(a.messageHash)
	closedAuthwits.value = next
}

/** Closing an authorization hands the advice to one still open. */
const adviceAuthwit = computed(() =>
	props.advice === "authwits"
		? authwitRows.value.findLastIndex(({ authwit, surface }) => isAuthwitOpen(authwit) && surface.kind === "raw")
		: -1,
)

const authwitSlot = ref<HTMLElement | null>(null)
/** Try again leaves with the failure, so a keyboard press keeps its place on the slot that holds the
 *  check and then the list. Read `currentTarget` inside the click's dispatch: it is null after. */
const onRetryPreview = (event: MouseEvent): void => {
	emit("retryPreview")
	if ((event.currentTarget as HTMLElement).matches(":focus-visible")) authwitSlot.value?.focus()
}
</script>

<template>
	<Flex v-if="callRows.length" data-testid="execute-op-summary" direction="column" gap="8" :class="$style.section">
		<SectionLabel label="What this does" />
		<ol data-testid="execute-op-summary-calls" :class="$style.rail">
			<li
				v-for="(row, j) in callRows"
				:key="j"
				data-testid="execute-op-summary-call"
				:data-call-index="j"
				:data-intent-kind="row.surface.kind"
				:class="$style.step"
			>
				<span :class="$style.number"><Text variant="meta" color="secondary">{{ j + 1 }}</Text></span>
				<Flex direction="column" gap="8" :class="$style.body">
					<StepRow
						data-testid="execute-op-step-toggle"
						:data-step-index="j"
						:open="openSteps.has(j)"
						:name="`Details of step ${j + 1}`"
						:describedby="describedBy(j, row)"
						:controls="stepPanel(j)"
						@toggle="toggleStep(j)"
					>
						<Flex direction="column" gap="4">
							<!-- A sentence's spaces sit inside its text nodes: a bare newline between two tags renders none.
							     The chevron ends the sentence's last line, held to its last word by a no-break space. -->
							<Text :id="part(j, 'head')" data-testid="execute-op-summary-call-head" variant="body" color="primary" height="130">
								<Text variant="meta" data-testid="execute-op-summary-call-title">{{ row.title }}</Text> on <span data-testid="execute-op-call-to"><AddressDisplay :address="row.call.to" data-testid="execute-op-summary-call-to" /></span><template v-if="row.amount">:</template><template v-else>&nbsp;<Icon name="chevron" size="12" color="secondary" aria-hidden="true" :class="[$style.chevron, openSteps.has(j) && $style.chevron_open]" /></template>
							</Text>
							<Text
								v-if="row.amount && (row.surface.kind === 'transfer' || row.surface.kind === 'mint')"
								:id="part(j, 'line')"
								data-testid="execute-op-call-line"
								:data-sender-kind="row.surface.kind === 'transfer' ? row.surface.sender.kind : undefined"
								variant="body"
								color="primary"
								height="130"
							>
								<Text variant="meta" data-testid="execute-op-line-amount">{{ row.amount.text }}</Text>
								<template v-if="row.amount.baseUnits"> base units</template>
								<template v-if="row.surface.kind === 'transfer' && row.surface.sender.kind === 'account'"> from this account</template>
								<template v-else-if="row.surface.kind === 'transfer' && row.surface.sender.kind === 'explicit'"> from <AddressDisplay :address="row.surface.sender.address" data-testid="execute-op-line-from" /></template>
								to <AddressDisplay :address="row.surface.to" data-testid="execute-op-line-to" />
								<template v-if="row.surface.kind === 'transfer' && row.surface.sender.kind === 'none'">. Caller: none</template>&nbsp;<Icon name="chevron" size="12" color="secondary" aria-hidden="true" :class="[$style.chevron, openSteps.has(j) && $style.chevron_open]" />
							</Text>
							<Text v-else-if="row.surface.kind === 'pending'" :id="part(j, 'note')" data-testid="execute-op-summary-args-pending" variant="body" color="tertiary">
								Reading arguments…
							</Text>
							<Flex v-else-if="row.surface.kind === 'raw'" :id="part(j, 'note')" data-testid="execute-op-summary-unverified-args" :data-reason="row.surface.reason" direction="column" gap="4">
								<ArgsNotice :title="RAW_TITLE" :body="RAW_LINE[row.surface.reason]" prefix="execute-op-summary" kind="unverified" />
							</Flex>
						</Flex>
					</StepRow>
					<div v-if="openSteps.has(j)" :id="stepPanel(j)" data-testid="execute-op-details" :data-step-index="j" :class="$style.guide">
						<!-- The sentence above states a pending or unreadable reading; the panel does not repeat it. -->
						<Flex
							data-testid="execute-op-payload-row"
							:data-call-name="row.call.name ?? ''"
							:data-call-to="row.call.to?.toString() ?? ''"
							:data-intent-kind="row.surface.kind"
							direction="column"
							gap="4"
						>
							<CallArguments
								:surface="row.surface"
								:contract="row.call.to"
								:chainId="chainId"
								:tokens="tokens"
								prefix="execute-op"
								json-view
								:notice="false"
								:raw="rawRows(row.call.args)"
							/>
						</Flex>
					</div>
				</Flex>
			</li>
		</ol>
		<Text v-if="uncheckedLine" data-testid="execute-op-summary-unchecked" variant="caption" color="secondary" height="130">{{ uncheckedLine }}</Text>
		<Text v-if="advice === 'calls'" data-testid="execute-op-summary-unverified-advice" variant="body" color="tertiary">{{ RAW_ADVICE }}</Text>
	</Flex>

	<!-- One element through every state, so a keyboard press on Try again keeps its place here. -->
	<div
		ref="authwitSlot"
		data-testid="execute-op-authwits-slot"
		role="group"
		aria-label="Authorizations"
		tabindex="-1"
		:aria-busy="checkingAuthwits && !authwitRows.length ? 'true' : undefined"
		:class="$style.slot"
	>
		<div v-if="authwitRows.length" data-testid="execute-op-summary-authwits-section" :class="$style.node">
			<span :class="$style.diamond" aria-hidden="true" />
			<Flex direction="column" gap="8" :class="$style.body">
				<StepRow
					data-testid="execute-op-authwits-toggle"
					:open="nodeOpen"
					name="Details of the authorizations"
					:controls="nodePanels"
					@toggle="nodeOpen = !nodeOpen"
				>
					<span :class="$style.node_label">
						<SectionLabel label="Authorizations" :count="authwitRows.length" />&nbsp;<Icon name="chevron" size="12" color="secondary" aria-hidden="true" :class="[$style.chevron, nodeOpen && $style.chevron_open]" />
					</span>
				</StepRow>
				<ul data-testid="execute-op-summary-authwits" :class="$style.authwits">
					<!-- The hash in the key remounts a re-estimated row: AddressDisplay reads its address once, at mount. -->
					<li
						v-for="({ authwit: a, surface, group, line, amount }, k) in authwitRows"
						:key="`${k}:${a.messageHash}`"
						data-testid="execute-op-summary-authwit"
						:data-message-hash="a.messageHash"
						:data-line-kind="line.kind"
						:data-on-behalf="a.onBehalfOf"
						:class="$style.authwit"
					>
						<Flex direction="column" gap="4">
							<Text data-testid="execute-discovered-authwit-line" variant="body" color="primary" height="130">
								Lets <AddressDisplay :address="a.caller" data-testid="execute-discovered-line-caller" />
								<template v-if="line.kind === 'move' && amount"> move <Text variant="meta" data-testid="execute-discovered-line-amount">{{ amount.text }}</Text></template>
								<template v-if="line.kind === 'move' && amount?.baseUnits"> base units</template>
								<template v-if="line.kind === 'move'"> from <AddressDisplay :address="line.from" data-testid="execute-discovered-line-from" /> to <AddressDisplay :address="line.to" data-testid="execute-discovered-line-to" /></template>
								<template v-else> call <Text variant="meta" data-testid="execute-discovered-line-function">{{ line.fn }}</Text> on <AddressDisplay :address="a.consumer" data-testid="execute-discovered-line-consumer" /></template>
							</Text>
							<Text v-if="a.onBehalfOf" data-testid="execute-op-summary-authwit-on-behalf" variant="body" color="secondary" height="130">
								Already authorized by <AddressDisplay :address="a.onBehalfOf" data-testid="execute-op-summary-authwit-on-behalf-account" />.
							</Text>
							<Flex v-if="surface.kind === 'raw'" data-testid="execute-op-summary-authwit-unverified-args" :data-reason="surface.reason" direction="column" gap="4">
								<ArgsNotice :title="RAW_TITLE" :body="RAW_LINE[surface.reason]" prefix="execute-op-summary-authwit" kind="unverified" />
							</Flex>
						</Flex>
						<div v-if="nodeOpen" :id="authwitPanel(k)" data-testid="execute-op-details" :class="$style.guide">
							<AuthwitDetails
								:authwit="a"
								:surface="surface"
								:group="group"
								:open="isAuthwitOpen(a)"
								:controls="`${authwitPanel(k)}-args`"
								:chainId="chainId"
								:tokens="tokens"
								:advice="adviceAuthwit === k"
								@toggle="toggleAuthwit(a)"
							/>
						</div>
					</li>
				</ul>
			</Flex>
		</div>
		<Flex v-else-if="checkingAuthwits" :class="$style.section">
			<Text variant="body" color="secondary" data-testid="execute-op-authwits-pending">Checking authorizations…</Text>
		</Flex>
		<Flex v-else-if="previewFailed" direction="column" gap="8" :class="$style.section" data-testid="execute-op-authwits-preview-failed">
			<Flex justify="between" gap="12" wide :class="$style.collapsed">
				<span :class="[$style.collapsed_text, 'color--txt-danger']">Authorizations couldn't be previewed</span>
				<button type="button" :class="$style.retry" data-testid="execute-op-authwits-preview-retry" @click="onRetryPreview">Try again</button>
			</Flex>
		</Flex>
	</div>
</template>

<style module>
.section {
	width: 100%;
	padding-top: 12px;
}

.rail {
	display: flex;
	flex-direction: column;
	gap: 14px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.step {
	position: relative;
	display: grid;
	grid-template-columns: 20px minmax(0, 1fr);
	column-gap: 10px;
}

/* The rail runs from under one step's number to the next step's. */
.step:not(:last-child)::before {
	content: "";
	position: absolute;
	top: 22px;
	bottom: -14px;
	left: 9.5px;
	width: 1px;
	background: var(--nulo-border);
}

.number {
	display: grid;
	place-items: center;
	width: 20px;
	height: 20px;
	border: 1px solid var(--nulo-border);
	background: var(--app-bg);
}

/* A dApp names each call and supplies its addresses; a long unbroken one breaks inside the card. */
.body {
	min-width: 0;
	overflow-wrap: anywhere;
}

/* What hangs under a step or an authorization: its values, its raw fields, its rows. */
.guide {
	margin-left: 3px;
	padding-left: 11px;
	border-left: 1px solid var(--nulo-border);
}

.chevron {
	vertical-align: -1px;
	transition: transform 120ms ease;
}

.chevron_open {
	transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
	.chevron {
		transition: none;
	}
}

/* Inset: the card's `overflow: hidden` would clip a ring drawn outside the slot. */
.slot:focus-visible {
	outline: 2px solid var(--nulo-accent);
	outline-offset: -2px;
}

/* After the unchecked line and the advice, off the steps' rail. */
.node {
	display: grid;
	grid-template-columns: 20px minmax(0, 1fr);
	column-gap: 10px;
	width: 100%;
	padding-top: 14px;
}

.diamond {
	width: 9px;
	height: 9px;
	margin: 6px 0 0 5.5px;
	border: 1px solid var(--nulo-border);
	background: var(--app-bg);
	transform: rotate(45deg);
}

.node_label {
	display: inline-flex;
	align-items: baseline;
}

.authwits {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.authwit {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.collapsed {
	padding: 10px 12px;
	border: 1px solid var(--nulo-border);
	background: var(--nulo-surface-low);
}

.collapsed_text {
	composes: type--body from global;
	min-width: 0;
}

.retry {
	composes: retry from "@/popup/components/modules/send/fee-shared.module.css";
	flex-shrink: 0;
	white-space: nowrap;
}
</style>
