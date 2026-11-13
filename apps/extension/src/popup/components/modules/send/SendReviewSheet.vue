<script setup lang="ts">
/**
 * The last look before a send goes. Everything shown is a prop and every action an emit: the page
 * owns the popup slot, the facts and the send.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue"
import FpcSentence from "@/components/composite/send/FpcSentence.vue"
import PayeeBlock from "@/components/composite/send/PayeeBlock.vue"
import { vSnackFooter } from "@/composables/snackInset"
import { isRepeatOrComposing } from "@/composables/usePopupEntity"
import {
	type FactCell,
	factWord,
	feeWarning,
	type PayerDescriptor,
	type PayerKind,
	paidBy,
	type PublishFacts,
	publishGlyph,
	rowSentence,
} from "@/components/composite/send/publish-facts"
import mark from "@/components/composite/send/publish-mark.module.css"
import { fitHero, HERO_MIN_SCALE } from "@/utils/hero-fit"
import { heroRoom, rulerWidth } from "@/utils/hero-ruler"
import { type FeeLine, type FeeLineState, feeLine, feeLineNotes } from "./fee-line-words"

const props = withDefaults(
	defineProps<{
		show: boolean
		/** The popup slot's order — the z-index tier `Popup` stacks on. */
		order: number
		/** How many newer popups sit on top — what `PopupCard` displaces behind. */
		depth: number
		facts: PublishFacts
		amount?: string
		symbol?: string
		/** The amount in dollars as the form's readout words it ("≈ $43.20"); null with no price. */
		fiat?: string | null
		recipientAddress?: string
		/** The name the wallet has for the address. */
		recipientName?: string | null
		/** The same name made safe for a sentence, or null. */
		sentenceName?: string | null
		/** False for an address the wallet does not know (no contact, own account or past send): its check line shows. */
		known?: boolean
		payerKind: PayerKind
		payerType?: PayerDescriptor["type"]
		/** Send's fee, which the row reads exactly as the form's line reads it. */
		fee?: FeeLineState
		/** What the fee card would say under the form's line. */
		notices?: string[]
		/** The send is queued against a cap, or behind an earlier one with Nulo's sponsor paying. */
		queueing?: boolean
		canSend: boolean
		sending: boolean
		ready: boolean
		/** Set for a queued send whose fee came out above the cap the person accepted. */
		reask?: { now: string; cap: string }
	}>(),
	{ fiat: null, recipientName: null, sentenceName: null, known: true, notices: () => [], queueing: false },
)
const emit = defineEmits<{ close: []; send: []; retry: [] }>()

const sendable = computed(() => props.show && props.canSend && props.ready && !props.sending)
const submitLabel = computed(() => {
	// The re-asked figure stays on the fee row above: in the label it clips at 360 px.
	if (props.reask) return "Send"
	if (props.queueing) return "Queue send"
	return props.fee?.estimating ? "Estimating fee" : "Send now"
})

const warning = computed(() => feeWarning(props.facts, props.sentenceName))

const ROWS: { cell: FactCell; id: string; name: string }[] = [
	{ cell: "you", id: "you", name: "Your address" },
	{ cell: "recipient", id: "to", name: "Recipient" },
	{ cell: "amount", id: "amount", name: "Amount" },
]
const rows = computed(() =>
	ROWS.map((row) => {
		const visibility = props.facts[row.cell]
		return {
			...row,
			visibility,
			glyph: publishGlyph(visibility),
			word: factWord(row.cell, props.facts),
			// The warning box under the rows says the fee names the account, so that row says it no more.
			sentence: row.cell === "you" && warning.value ? null : rowSentence(row.cell, props.facts, props.payerKind),
			noticeShape: row.cell === "you" ? (props.facts.noticeShape ?? undefined) : undefined,
		}
	}),
)

const QUEUE_TESTID = { cap: "send-review-fee-cap", sponsored: "send-review-fee-queued", behind: "send-review-fee-value" } as const
const line = computed<FeeLine>(() => (props.fee ? feeLine(props.fee) : { kind: "words", value: "—", note: null }))
const valueTestid = computed(() => {
	if (line.value.kind === "slow") return "send-review-fee-slow"
	return line.value.kind === "words" && line.value.queue ? QUEUE_TESTID[line.value.queue] : "send-review-fee-value"
})
const notes = computed(() => {
	if (props.reask) return [paidBy(props.payerKind, props.payerType)].filter((n) => n !== null)
	return feeLineNotes(line.value, props.notices)
})

const summary = useTemplateRef<HTMLElement>("summary")
const amountRuler = useTemplateRef<HTMLElement>("amountRuler")
const sendNow = useTemplateRef<{ $el: HTMLElement }>("sendNow")
/** The amount line's type as a fraction of its 30 px: the largest that fits one line, never
 *  under 60%, where the line wraps instead. */
const amountScale = ref(1)

/** Space and a pointer click at their release, so a press held across the arm or a re-arm would send
 *  what it never saw: a press that met Send now refusing, at its start or since, never sends. */
let press: { refused: boolean } | null = null
function beginPress() {
	press = { refused: !sendable.value }
	return press.refused
}

// Never natively disabled, so the focus it takes on opening survives the arming wait and any change
// of state; this guard is what a press, a key or a programmatic click meets.
const handleSend = () => {
	const refused = press?.refused ?? false
	press = null
	if (sendable.value && !refused) emit("send")
}

function onSendKeydown(e: KeyboardEvent) {
	if (e.key !== "Enter" && e.key !== " ") return
	if (isRepeatOrComposing(e)) return e.preventDefault()
	if (beginPress()) e.preventDefault()
}
function onSendKeyup(e: KeyboardEvent) {
	// Enter acts at its keydown, so its release ends the press whatever it met.
	if (e.key === "Enter") press = null
	else if (e.key === " " && press?.refused) {
		e.preventDefault()
		press = null
	}
}

/** A retry replaces its own button, so the keyboard it held moves on to Send now. */
function retry(e: Event) {
	const held = e.currentTarget === document.activeElement
	emit("retry")
	if (held) nextTick(() => sendNow.value?.$el.focus())
}

function fitAmount() {
	const row = summary.value
	const form = amountRuler.value
	if (!row || !form) return
	const fit = fitHero(1, (_, scale) => rulerWidth(form, scale), heroRoom(row))
	amountScale.value = Math.max(fit.scale, HERO_MIN_SCALE)
}

// Synchronous, so a refusal and a re-arm inside one tick still mark the press in flight.
watch(
	sendable,
	(now) => {
		if (!now && press) press.refused = true
	},
	{ flush: "sync" },
)

// The sheet's content mounts with the popup, so its ref is watched with what it shows.
watch([summary, () => props.amount, () => props.symbol], fitAmount, { flush: "post" })
onMounted(() => document.fonts?.addEventListener("loadingdone", fitAmount))
onBeforeUnmount(() => document.fonts?.removeEventListener("loadingdone", fitAmount))
</script>

<template>
	<div data-testid="send-review-sheet" :data-open="show" hidden />
	<Popup :show="show" :displaceIdx="order" initial-focus='[data-testid="send-review-submit"]' @onClose="emit('close')">
		<PopupCard :displaceIdx="depth">
			<div role="dialog" aria-modal="true" aria-labelledby="send-review-title" data-testid="send-review">
				<PopupHeader closable @onClose="emit('close')">
					<template #title>
						<span id="send-review-title" :class="$style.title">Review</span>
					</template>
				</PopupHeader>

				<Flex direction="column" gap="12" :class="$style.body">
					<PayeeBlock v-if="recipientAddress" :address="recipientAddress" :name="recipientName" :known="known" />

					<div ref="summary" :class="$style.summary">
						<span :class="$style.amount" :style="{ '--hero-scale': amountScale }" data-testid="send-review-amount">
							<span :class="amount && symbol && $style.number">{{ amount || "—" }}</span><small v-if="amount && symbol" class="type--meta">{{ symbol }}</small>
						</span>
						<span v-if="amount && fiat" :class="$style.fiat" data-testid="send-review-amount-fiat">{{ fiat }}</span>
						<!-- The fit's ruler: it holds what the line holds, in the line's classes, or the two widths part. -->
						<span aria-hidden="true" :class="$style.amount_ruler">
							<span ref="amountRuler" :class="$style.amount"><span :class="amount && symbol && $style.number">{{ amount || "—" }}</span><small v-if="amount && symbol" class="type--meta">{{ symbol }}</small></span>
						</span>
					</div>

					<div :class="$style.rows">
						<div :class="$style.rows_head">This send publishes</div>
						<div
							v-for="row in rows"
							:key="row.cell"
							:class="[$style.row, mark[row.visibility]]"
							:data-testid="`send-review-row-${row.id}`"
							:data-visibility="row.visibility"
							:data-notice-shape="row.noticeShape"
						>
							<Icon v-if="row.glyph" :name="row.glyph" size="10" aria-hidden="true" :class="$style.row_mark" />
							<span v-else :class="$style.row_gap" aria-hidden="true" />
							<div :class="$style.row_body">
								<div :class="$style.row_top">
									<span>{{ row.name }}</span>
									<span :class="$style.row_word">{{ row.word }}</span>
								</div>
								<span v-if="row.sentence" :class="$style.why"><FpcSentence :text="row.sentence" /></span>
							</div>
						</div>
					</div>

					<p v-if="warning" :class="mark.warning_box" data-testid="send-review-warning" :data-notice-shape="facts.noticeShape">
						<Icon name="warning" size="14" aria-hidden="true" :class="mark.warning_mark" />
						<span>{{ warning }}</span>
					</p>

					<div :class="$style.fee" data-testid="send-review-fee" :data-payer="payerKind ?? 'none'">
						<span :class="$style.fee_key">Fee</span>
						<span :class="$style.fee_value" :data-testid="reask ? 'send-review-fee-reask' : valueTestid">
							<span v-if="reask">Fee is now {{ reask.now }}, above the {{ reask.cap }} you accepted.</span>
							<span v-else-if="line.kind === 'words'">{{ line.value }}</span>
							<Skeleton v-else-if="line.kind === 'bar'" :width="96" :height="10" />
							<span v-else :class="$style.fee_state">
								<span v-if="line.kind === 'slow'" :class="$style.muted">Taking longer than usual.</span>
								<span v-else class="color--txt-danger">Couldn't estimate fee.</span>
								<button type="button" :class="$style.retry" data-testid="send-review-fee-retry" @click="retry">Try again</button>
							</span>
							<span v-for="note in notes" :key="note" :class="$style.note"><FpcSentence :text="note" /></span>
						</span>
					</div>

					<span :class="$style.send_wrap" @pointerdown="beginPress" @keydown="onSendKeydown" @keyup="onSendKeyup">
						<Button
							ref="sendNow"
							v-snack-footer
							variant="cta"
							wide
							data-testid="send-review-submit"
							:data-ready="ready"
							:aria-disabled="!sendable || undefined"
							:class="!sendable && !sending && $style.unarmed"
							:loading="sending"
							@click="handleSend"
						>
							{{ submitLabel }}
						</Button>
					</span>
				</Flex>
			</div>
		</PopupCard>
	</Popup>
</template>

<style module>
.title {
	composes: type--title-page from global;
	color: var(--txt-primary);
}

.body {
	padding: 4px 20px 24px;
}

/* The dollar figure sits on the amount's baseline and wraps whole under it, flush left, when the
   line is full. */
.summary {
	position: relative;
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	column-gap: 8px;
}

.amount {
	composes: type--amount-hero from global;
	display: block;
	font-size: calc(30px * var(--hero-scale, 1));
	line-height: 1;
	color: var(--txt-primary);
	/* Wraps only when even 60% is too wide for one line. */
	overflow-wrap: anywhere;
}

.fiat {
	composes: type--meta from global;
	color: var(--nulo-secondary);
	white-space: nowrap;
}

.amount_ruler {
	position: absolute;
	width: 0;
	height: 0;
	overflow: hidden;
	visibility: hidden;
	pointer-events: none;
}

.amount_ruler > span {
	position: absolute;
	white-space: nowrap;
}

/* The gap ends the number, so a symbol a wrapping line moves down starts flush with the line. */
.number {
	margin-right: 4px;
}

/* Atomic, so a wrapping line breaks before the symbol, never inside it. */
.amount small {
	display: inline-block;

	color: var(--nulo-secondary);
}

.rows {
	display: flex;
	flex-direction: column;

	border: 1px solid var(--nulo-border);
}

.rows_head {
	composes: type--label-section from global;
	padding: 6px 10px;
	border-bottom: 1px solid var(--nulo-border);

	color: var(--nulo-secondary);
}

.row {
	display: flex;
	gap: 8px;

	padding: 8px 10px;
	border-bottom: 1px solid var(--nulo-border);
}

.row:last-child {
	border-bottom: none;
}

.row_mark {
	flex: none;
	margin-top: 2px;
}

/* Keeps an unmarked row's words in line with the marked ones. */
.row_gap {
	flex: none;
	width: 10px;
}

.row_body {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.row_top {
	composes: type--value from global;
	display: flex;
	justify-content: space-between;
	gap: 8px;

	color: var(--txt-primary);
}

.row_word {
	composes: type--label-section from global;
}

.why {
	composes: type--caption from global;
	line-height: 1.4;
	color: var(--txt-tertiary);
}

/* Label at To's left edge, value at the rows' right edge. */
.fee {
	display: grid;
	grid-template-columns: auto 1fr;
	align-items: baseline;
	column-gap: 12px;
}

.fee_key {
	composes: type--label-section from global;
	color: var(--nulo-secondary);
}

.fee_value {
	composes: type--body from global;
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 2px;
	min-width: 0;
	text-align: right;
	color: var(--txt-primary);
}

.fee_state {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	align-items: baseline;
	gap: 6px;
}

.muted,
.note {
	color: var(--txt-secondary);
}

.retry {
	composes: retry from "./fee-shared.module.css";
}

.send_wrap {
	display: block;
}

/* The base's disabled look, kept focusable: a press passes through to nothing. */
.unarmed {
	opacity: 0.3;
	pointer-events: none;
}
</style>
