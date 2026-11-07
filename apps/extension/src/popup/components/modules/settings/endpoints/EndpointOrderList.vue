<script setup>
/**
 * A network's endpoints in the order the router asks them, the first the primary. A row moves by its
 * handle, with the pointer or the keyboard, and a tap on a row moves it first; each move emits one
 * `reorder` carrying the whole order, never one per step.
 */
/** Components */
import EndpointStatusDot from "./EndpointStatusDot.vue"

/** Utils */
import { isRepeatOrComposing } from "@/composables/usePopupEntity"
import { moveId, placesWhileLifted, tapOrder } from "@/utils/endpoint-order"
import { endpointStatus } from "@/utils/endpoint-status"

const props = defineProps({
	/** As shown: the primary first, then the others in the order they are asked. */
	endpoints: { type: Array, required: true },
	/** The account engine's route as last read (`RouteView`), or null before a read lands. */
	view: { type: Object, default: null },
	/** A held reset: the rows are inert and nothing moves. */
	held: { type: Boolean, default: false },
	/** `{ id, text }`: the line the row moved first carries. */
	warning: { type: Object, default: null },
})
const emit = defineEmits(["reorder", "edit", "remove"])

const hintId = useId()

const ids = computed(() => props.endpoints.map((e) => e.id))
const movable = computed(() => !props.held && props.endpoints.length > 1)

/** The lifted row: `by` the pointer, following it by `dy`, or by the keyboard, one place per arrow. */
const lift = reactive({ id: null, by: null, from: 0, to: 0, startY: 0, dy: 0, height: 0, pointerId: null })
const places = computed(() => (lift.id === null ? null : placesWhileLifted(ids.value, lift.from, lift.to)))
const announcement = ref("")

const handles = new Map()
/** The handle a keyboard drop moved; refocused when a re-render drops focus to the page. */
let refocusId = null

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const titleOf = (endpoint) => endpoint.label || endpoint.rpcUrl
const titleById = (id) => {
	const endpoint = props.endpoints.find((e) => e.id === id)
	return endpoint ? titleOf(endpoint) : ""
}
const status = (endpoint) => endpointStatus(props.view, endpoint.id)
const placeOf = (endpoint, index) => places.value?.[endpoint.id] ?? index + 1
const warningFor = (endpoint) => (props.warning?.id === endpoint.id ? props.warning.text : null)
const handleLabel = (endpoint, index) => `Move ${titleOf(endpoint)}, position ${placeOf(endpoint, index)} of ${ids.value.length}`
const setHandle = (id, el) => (el ? handles.set(id, el) : handles.delete(id))

const say = (text) => {
	announcement.value = text
}
const sayPlace = (prefix) => say(`${prefix}, position ${lift.to + 1} of ${ids.value.length}.`)

function reset() {
	Object.assign(lift, { id: null, by: null, from: 0, to: 0, startY: 0, dy: 0, height: 0, pointerId: null })
}

function begin(endpoint, by, el) {
	const from = ids.value.indexOf(endpoint.id)
	const row = el.closest('[data-testid="endpoint-row"]')
	Object.assign(lift, { id: endpoint.id, by, from, to: from, dy: 0, height: row?.getBoundingClientRect().height || 1 })
	refocusId = null
	sayPlace(`${titleOf(endpoint)} lifted`)
}

function cancel() {
	if (lift.id === null) return
	reset()
	say("Order unchanged.")
}

function drop() {
	const { id, by, from, to } = lift
	if (id === null) return
	const title = titleById(id)
	reset()
	if (from === to) return say("Order unchanged.")
	say(`${title} dropped, position ${to + 1} of ${ids.value.length}.`)
	if (by === "key") refocusId = id
	emit("reorder", moveId(ids.value, from, to))
}

function onPointerDown(endpoint, e) {
	if (!movable.value || e.button !== 0 || lift.id !== null) return
	e.preventDefault()
	e.currentTarget.setPointerCapture?.(e.pointerId)
	begin(endpoint, "pointer", e.currentTarget)
	lift.startY = e.clientY
	lift.pointerId = e.pointerId
}

function onPointerMove(e) {
	if (lift.by !== "pointer" || e.pointerId !== lift.pointerId) return
	const span = ids.value.length - 1
	const half = lift.height / 2
	lift.dy = clamp(e.clientY - lift.startY, -lift.from * lift.height - half, (span - lift.from) * lift.height + half)
	lift.to = clamp(lift.from + Math.round(lift.dy / lift.height), 0, span)
}

function onPointerUp(e) {
	if (lift.by === "pointer" && e.pointerId === lift.pointerId) drop()
}

/** A cancelled pointer and a lost capture both put the row back. */
function onPointerLost(e) {
	if (lift.by === "pointer" && e.pointerId === lift.pointerId) cancel()
}

function onArrow(endpoint, e) {
	if (lift.by !== "key" || lift.id !== endpoint.id) return
	e.preventDefault()
	lift.to = clamp(lift.to + (e.key === "ArrowUp" ? -1 : 1), 0, ids.value.length - 1)
	lift.dy = (lift.to - lift.from) * lift.height
	sayPlace(titleOf(endpoint))
}

/** Space or Enter lifts and drops; a held key's repeat neither lifts nor drops. */
function onPress(endpoint, e) {
	e.preventDefault()
	if (isRepeatOrComposing(e)) return
	if (lift.id === null) return begin(endpoint, "key", e.currentTarget)
	if (lift.by === "key" && lift.id === endpoint.id) drop()
}

/** Chrome closes the toolbar popup on an Escape the page leaves unhandled. */
function onEscape(e) {
	if (lift.id === null) return
	e.preventDefault()
	if (lift.by === "pointer") e.currentTarget.releasePointerCapture?.(lift.pointerId)
	cancel()
}

function onHandleKeydown(endpoint, e) {
	if (!movable.value) return
	if (e.key === "Escape") return onEscape(e)
	if (e.key === "Enter" || e.key === " ") return onPress(endpoint, e)
	if (e.key === "ArrowUp" || e.key === "ArrowDown") onArrow(endpoint, e)
}

function onHandleBlur(endpoint, e) {
	if (lift.by === "key" && lift.id === endpoint.id) cancel()
	if (e.relatedTarget) refocusId = null
}

function onTap(endpoint) {
	if (lift.id !== null || ids.value[0] === endpoint.id) return
	emit("reorder", tapOrder(ids.value, endpoint.id))
}

/** While a row is lifted the rows it passes make room for it. */
function rowStyle(endpoint) {
	if (lift.id === null) return undefined
	if (endpoint.id === lift.id) return { transform: `translateY(${lift.dy}px)` }
	const at = ids.value.indexOf(endpoint.id)
	if (lift.from < lift.to && at > lift.from && at <= lift.to) return { transform: `translateY(${-lift.height}px)` }
	if (lift.to < lift.from && at >= lift.to && at < lift.from) return { transform: `translateY(${lift.height}px)` }
	return undefined
}

/** A lift outlives no change to the list it was lifted from. */
watch([() => ids.value.join(), movable], () => {
	if (lift.id !== null) cancel()
})

watch(
	() => ids.value.join(),
	() => {
		const el = refocusId ? handles.get(refocusId) : undefined
		if (el && (document.activeElement === null || document.activeElement === document.body)) el.focus()
	},
	{ flush: "post" },
)

watch(
	() => props.warning?.text,
	(text) => {
		if (text) say(text)
	},
)

onBeforeUnmount(reset)
</script>

<template>
	<ItemsContainer :class="$style.list">
		<!-- A bound onClick, not @click: SettingItem renders a row inert only with no click listener. -->
		<SettingItem
			v-for="(endpoint, index) in endpoints"
			:key="endpoint.id"
			:title="titleOf(endpoint)"
			:description="endpoint.label ? endpoint.rpcUrl : undefined"
			:wrapDescription="!!warningFor(endpoint)"
			:onClick="held ? undefined : () => onTap(endpoint)"
			:class="[$style.row, lift.id === endpoint.id && $style.lifted, lift.id !== null && lift.id !== endpoint.id && $style.making_room]"
			:style="rowStyle(endpoint)"
			data-testid="endpoint-row"
			:data-endpoint-id="endpoint.id"
			:data-endpoint-tone="status(endpoint).tone"
		>
			<template #icon>
				<Flex align="center" gap="10">
					<button
						v-if="movable"
						:ref="(el) => setHandle(endpoint.id, el)"
						type="button"
						:class="$style.handle"
						:aria-label="handleLabel(endpoint, index)"
						:aria-describedby="hintId"
						data-testid="endpoint-drag-handle"
						@click.stop
						@pointerdown="onPointerDown(endpoint, $event)"
						@pointermove="onPointerMove"
						@pointerup="onPointerUp"
						@pointercancel="onPointerLost"
						@lostpointercapture="onPointerLost"
						@keydown="onHandleKeydown(endpoint, $event)"
						@blur="onHandleBlur(endpoint, $event)"
					>
						<Icon name="grip" size="16" color="tertiary" />
					</button>
					<Text variant="meta" color="secondary" :class="$style.position" data-testid="endpoint-position">
						{{ placeOf(endpoint, index) }}
					</Text>
					<EndpointStatusDot :tone="status(endpoint).tone" />
				</Flex>
			</template>
			<template v-if="warningFor(endpoint)" #description>
				<span v-if="endpoint.label" :class="$style.line">{{ endpoint.rpcUrl }}</span>
				<Text variant="caption" color="txt-danger" :class="$style.line" data-testid="endpoint-moved-warning">
					{{ warningFor(endpoint) }}
				</Text>
			</template>
			<template v-if="!held" #right>
				<Flex align="center" gap="8">
					<Tooltip position="end" delay="350">
						<RowAction label="Edit endpoint" data-testid="endpoint-edit-btn" @click="emit('edit', endpoint)">
							<Icon name="edit" size="14" color="tertiary" />
						</RowAction>
						<template #content>Edit endpoint</template>
					</Tooltip>
					<Tooltip v-if="index > 0" position="end" delay="350">
						<RowAction label="Delete endpoint" data-testid="endpoint-delete-btn" @click="emit('remove', endpoint)">
							<Icon name="close" size="14" color="tertiary" />
						</RowAction>
						<template #content>Delete endpoint</template>
					</Tooltip>
				</Flex>
			</template>
		</SettingItem>
	</ItemsContainer>
	<span v-if="movable" :id="hintId" hidden>Space or Enter lifts the endpoint and drops it, the arrow keys move it, Escape puts it back.</span>
	<span :class="$style.visually_hidden" aria-live="polite" data-testid="endpoint-order-announcement">{{ announcement }}</span>
</template>

<style module>
/* A lifted row's shadow reaches past the list's edge. */
.list > * {
	overflow: visible;
}

.list .row {
	background: var(--nulo-surface);
}

.list .making_room {
	transition: transform 0.15s var(--bezier);
}

.list .lifted {
	z-index: 3;
	background: var(--nulo-surface-high);
	box-shadow:
		inset 0 0 0 1px color-mix(in srgb, var(--txt-primary) 8%, transparent),
		0 14px 34px rgba(0, 0, 0, 15%),
		0 4px 14px rgba(0, 0, 0, 5%);
	cursor: grabbing;

	&::after {
		display: none;
	}
}

/* Above the row's stretched target; its 24 px box draws the glyph where a 16 px one would sit. */
.handle {
	position: relative;
	z-index: 1;

	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;

	width: 24px;
	height: 24px;
	padding: 0;
	margin: 0 -4px 0 -8px;

	background: transparent;
	border: 0;
	cursor: grab;
	touch-action: none;

	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
		outline-offset: -2px;
	}
}

.position {
	min-width: 8px;
	text-align: center;
}

.line {
	display: block;
}

.visually_hidden {
	position: absolute;
	width: 1px;
	height: 1px;
	margin: -1px;
	padding: 0;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
	border: 0;
}
</style>
