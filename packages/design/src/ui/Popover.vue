<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup lang="ts">
/** Vendor */
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue"

/** Composables */
import { isComposing } from "../composables/keys"
import { useOutside } from "../composables/outside"

/** Components */
import Flex from "../core/Flex.vue"

/** Utils */
import { placeCard } from "./popover-place"

// (BUG PIN) Initialised to null and assigned only inside the open-branch `nextTick`. If `open` flips
// to false BEFORE that nextTick runs, the else-branch calls `removeOutside()` on null → throws.
// Preserved verbatim from the extension.
let removeOutside: (() => void) | null = null

const props = defineProps({
	open: {
		type: Boolean,
		default: false,
	},
	width: {
		type: String,
		default: null,
	},
	height: {
		type: String,
		default: null,
	},
	side: {
		type: String,
		default: "left",
	},
	disabled: {
		type: Boolean,
		default: false,
	},
	/** The trigger sits in running text: root and trigger are spans, and the card stays inside the view. */
	inline: {
		type: Boolean,
		default: false,
	},
	/** An inline card's content, by identity: a change while open re-places the card, which may now be taller. */
	placeKey: {
		type: null,
		default: undefined,
	},
	// Host-DOM contract: the consuming app must declare this teleport root (the extension declares
	// `#popover` in its popup/onboarding shells).
	teleportTo: {
		type: String,
		default: "#popover",
	},
})
const emit = defineEmits(["onClose"])

const triggerEl = ref<HTMLElement>()
const cardEl = ref<HTMLElement>()

const popoverStyles = reactive<Record<string, string>>({})
const inlineCardStyles = reactive<Record<string, string>>({})
const cardStyles = computed(() => (props.inline ? inlineCardStyles : { width: `${props.width}px`, height: `${props.height}px` }))
/** The trigger's control focused when the panel opened, read before the content mounts and takes focus. */
let opener: HTMLElement | null = null

const onClose = () => {
	emit("onClose")
}

/** The controls Tab walks, in DOM order. A panel holds no hidden control: one at an edge would hide
 *  that edge from the hand-off below. */
function tabbables(root: Element | undefined): HTMLElement[] {
	if (!root) return []
	const all = root.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex]")
	return [...all].filter((el) => el.tabIndex >= 0 && !el.matches(":disabled"))
}

/** Any open from a focused trigger, a pointer's included: a screen reader's activation may carry
 *  no keyboard modality. */
function focusIn() {
	const card = cardEl.value
	if (opener && card && !card.contains(document.activeElement)) tabbables(card)[0]?.focus()
}

/** The teleported panel keeps the Tab order it would have right after its trigger: past its last
 *  control focus returns to the trigger and the browser's own Tab goes on from there; before its
 *  first, it closes back onto the trigger. */
function onTab(e: KeyboardEvent) {
	const active = document.activeElement
	if (!(active instanceof HTMLElement) || !cardEl.value?.contains(active)) return
	const controls = tabbables(cardEl.value)
	const anchor = opener ?? tabbables(triggerEl.value)[0]
	if (active !== (e.shiftKey ? controls[0] : controls.at(-1)) || !anchor?.isConnected) return
	if (e.shiftKey) e.preventDefault()
	anchor.focus()
	onClose()
}

/** `focusin`, not `focusout`: a window blur or a press on no control moves focus nowhere, and must
 *  not close. */
const onFocusin = (e: FocusEvent) => {
	const target = e.target
	if (target instanceof Node && !triggerEl.value?.contains(target) && !cardEl.value?.contains(target)) onClose()
}

/** A closed panel stays in the DOM for its leave; inert keeps a held Tab or a click off it. */
const onBeforeLeave = (el: Element) => {
	el.setAttribute("inert", "")
}

const onKeydown = (e: KeyboardEvent) => {
	if (e.key === "Tab" && !isComposing(e)) {
		onTab(e)
		return
	}
	if (e.code !== "Escape") return
	e.preventDefault()
	// Only a key, and only from inside the panel, hands focus back: a pointer close from the
	// autofocused content would carry the ring there.
	if (cardEl.value?.contains(document.activeElement) && opener?.isConnected) opener.focus()
	onClose()
}

function placeBeside(triggerRect: DOMRect) {
	popoverStyles.top = `${triggerRect.y + triggerRect.height + 8}px`
	switch (props.side) {
		case "left": {
			// Ends at its trigger's right edge; below the popup's width it never starts past the view's left one.
			const left = triggerRect.x + triggerRect.width - Number(props.width)
			popoverStyles[props.side] = `${window.matchMedia("(width < 359px)").matches ? Math.max(8, left) : left}px`
			break
		}
		case "right":
			popoverStyles[props.side] = `${Number(props.width) - triggerRect.x - triggerRect.width}px`
			break
	}
}

/** Its height is known only once the card renders at its width, so an inline card places twice. */
function placeInline(triggerRect: DOMRect) {
	const view = document.documentElement
	inlineCardStyles.maxHeight = ""
	const height = cardEl.value?.scrollHeight ?? 0
	const place = placeCard(triggerRect, { width: Number(props.width), height }, { width: view.clientWidth, height: view.clientHeight })
	popoverStyles.top = `${place.top}px`
	popoverStyles.left = `${place.left}px`
	inlineCardStyles.width = `${place.width}px`
	inlineCardStyles.maxHeight = place.maxHeight === undefined ? "" : `${place.maxHeight}px`
}

watch(
	() => props.open,
	() => {
		if (props.open) {
			const focused = document.activeElement
			opener = focused instanceof HTMLElement && triggerEl.value?.contains(focused) ? focused : null
			const triggerRect = (triggerEl.value as HTMLElement).getBoundingClientRect()
			if (props.inline) placeInline(triggerRect)
			else placeBeside(triggerRect)

			document.addEventListener("scroll", onClose)
			document.addEventListener("keydown", onKeydown)
			document.addEventListener("focusin", onFocusin)

			nextTick(() => {
				if (props.inline) placeInline(triggerRect)
				removeOutside = useOutside(cardEl.value, onClose)
				focusIn()
			})
		} else {
			opener = null
			// Listeners first: the pinned call below can throw.
			document.removeEventListener("scroll", onClose)
			document.removeEventListener("keydown", onKeydown)
			document.removeEventListener("focusin", onFocusin)
			;(removeOutside as () => void)()
		}
	},
)

watch(
	() => props.placeKey,
	() => {
		if (props.open && props.inline && triggerEl.value) placeInline(triggerEl.value.getBoundingClientRect())
	},
	{ flush: "post" },
)

// A listener left behind would mark every later Escape handled.
onBeforeUnmount(() => {
	document.removeEventListener("scroll", onClose)
	document.removeEventListener("keydown", onKeydown)
	document.removeEventListener("focusin", onFocusin)
	removeOutside?.()
})
</script>

<template>
	<component :is="inline ? 'span' : Flex" :class="[inline && $style.inline, disabled && $style.disabled]">
		<component :is="inline ? 'span' : 'div'" ref="triggerEl">
			<slot />
		</component>

		<teleport :to="teleportTo">
			<div v-if="open" :class="$style.canvas" />

			<Transition name="fastfade" @before-leave="onBeforeLeave">
				<div v-if="open" :style="popoverStyles" :class="$style.popover">
					<div ref="cardEl" :style="cardStyles" :class="[$style.card, inline && $style.card_inline]">
						<slot name="content" />
					</div>
				</div>
			</Transition>
		</teleport>
	</component>
</template>

<style module>
.popover {
	position: fixed;
	z-index: 2010;
}

.canvas {
	position: fixed;
	inset: 0;
	z-index: 2005;
}

.card {
	overflow: hidden;

	background: var(--dropdown-bg);
	box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--txt-primary) 8%, transparent), 0 14px 34px rgba(0, 0, 0, 15%), 0 4px 14px rgba(0, 0, 0, 5%);

	padding: 6px 0;
}

/* As a flex item it would hold its content's width; this lets the trigger shrink and clip its text. */
.inline {
	min-width: 0;
	max-width: 100%;
}

.card_inline {
	overflow-y: auto;
}

.disabled {
	opacity: 0.6;
	cursor: auto;
	pointer-events: none;
}
</style>
