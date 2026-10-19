<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup lang="ts">
/** Vendor */
import { nextTick, onBeforeUnmount, reactive, ref, watch } from "vue"

/** Composables */
import { isComposing } from "../composables/keys"
import { useOutside } from "../composables/outside"

/** Components */
import Flex from "../core/Flex.vue"

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

const onFocusin = (e: FocusEvent) => {
	const target = e.target
	if (target instanceof Node && !triggerEl.value?.contains(target) && !cardEl.value?.contains(target)) onClose()
}

/** A closed panel lingers in the DOM for its leave; inert keeps a held Tab or a click from reaching it. */
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

watch(
	() => props.open,
	() => {
		if (props.open) {
			const focused = document.activeElement
			opener = focused instanceof HTMLElement && triggerEl.value?.contains(focused) ? focused : null
			const triggerRect = (triggerEl.value as HTMLElement).getBoundingClientRect()

			popoverStyles.top = `${triggerRect.y + triggerRect.height + 8}px`
			switch (props.side) {
				case "left":
					popoverStyles[props.side] = `${triggerRect.x + triggerRect.width - Number(props.width)}px`
					break
				case "right":
					popoverStyles[props.side] = `${Number(props.width) - triggerRect.x - triggerRect.width}px`
					break
			}

			document.addEventListener("scroll", onClose)
			document.addEventListener("keydown", onKeydown)
			document.addEventListener("focusin", onFocusin)

			nextTick(() => {
				removeOutside = useOutside(cardEl.value, onClose)
				focusIn()
			})
		} else {
			opener = null
			document.removeEventListener("scroll", onClose)
			document.removeEventListener("keydown", onKeydown)
			document.removeEventListener("focusin", onFocusin)
			;(removeOutside as () => void)()
		}
	},
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
	<Flex :class="disabled && $style.disabled">
		<div ref="triggerEl">
			<slot />
		</div>

		<teleport :to="teleportTo">
			<div v-if="open" :class="$style.canvas" />

			<Transition name="fastfade" @before-leave="onBeforeLeave">
				<div v-if="open" :style="popoverStyles" :class="$style.popover">
					<div ref="cardEl" :style="{ width: `${width}px`, height: `${height}px` }" :class="$style.card">
						<slot name="content" />
					</div>
				</div>
			</Transition>
		</teleport>
	</Flex>
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

	border-radius: 10px;
	background: var(--dropdown-bg);
	box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--txt-primary) 8%, transparent), 0 14px 34px rgba(0, 0, 0, 15%), 0 4px 14px rgba(0, 0, 0, 5%);

	padding: 6px 0;
}

.disabled {
	opacity: 0.6;
	cursor: auto;
	pointer-events: none;
}
</style>
