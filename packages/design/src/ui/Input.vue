<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup lang="ts">
/** Vendor */
import { computed, nextTick, onMounted, ref, watch, type PropType } from "vue"

/** Components */
import Flex from "../core/Flex.vue"
import Icon from "../core/Icon.vue"
import type { GlyphName } from "../core/glyphs"
import Text from "../core/Text.vue"
import Tooltip from "./Tooltip.vue"

/** Tokens */
import type { TypeRole } from "../tokens"

/** Utils */
import { sanitizeString } from "../internal/sanitize"

const emit = defineEmits(["update:modelValue", "focus", "blur", "maxLengthReached", "clear"])
const props = defineProps({
	size: {
		type: String as PropType<"medium" | "small" | "mini">,
		default: "medium",
	},
	error: {
		type: Boolean,
		default: false,
	},
	type: {
		type: String,
	},
	subtype: {
		type: String,
	},
	sanitize: {
		type: Boolean,
		default: false,
	},
	max: {
		type: [String, Number],
	},
	maxLength: {
		type: Number,
		required: false,
	},
	label: {
		type: String,
	},
	leftText: {
		type: String,
		required: false,
	},
	suffix: {
		type: String,
		required: false,
	},
	icon: {
		type: String as PropType<GlyphName>,
	},
	placeholder: {
		type: String,
		required: true,
	},
	modelValue: {
		type: [String, Number],
	},
	disabled: {
		type: Boolean,
	},
	autofocus: {
		type: Boolean,
		default: false,
	},
	clearable: {
		type: Boolean,
		default: false,
	},
	disablePaste: {
		type: Boolean,
		default: false,
	},
	autocomplete: {
		type: String,
		required: false,
	},
	autocapitalize: {
		type: String,
		required: false,
	},
	autocorrect: {
		type: String,
		required: false,
	},
	ariaInvalid: {
		type: Boolean,
		default: undefined,
	},
	/** The native `<input>`'s `aria-labelledby`, for a field whose visible label sits outside the component. */
	ariaLabelledby: {
		type: String,
		required: false,
	},
	/** The native `<input>`'s `role`, `aria-expanded`, `aria-autocomplete`, `aria-activedescendant`
	 *  and `aria-controls`, for a field that drives a list it does not contain. */
	role: {
		type: String,
		required: false,
	},
	ariaExpanded: {
		type: Boolean,
		default: undefined,
	},
	ariaAutocomplete: {
		type: String as PropType<"list" | "inline" | "both">,
		required: false,
	},
	ariaActivedescendant: {
		type: String,
		required: false,
	},
	ariaControls: {
		type: String,
		required: false,
	},
	/** The native `<input>`'s `data-testid`; a `data-testid` attribute names the root. */
	inputTestid: {
		type: String,
		required: false,
	},
	/** The typed text's role: `input-data` for an address, an amount or another value compared glyph by glyph. */
	textVariant: {
		type: String as PropType<Extract<TypeRole, "input" | "input-data">>,
		default: "input",
		// Validated at run time too: most callers are SFCs without `lang="ts"`, which vue-tsc skips.
		validator: (value: string) => value === "input" || value === "input-data",
	},
	/** Maps the typed text to the text the field keeps, in place of `sanitize`'s built-in filter. */
	normalize: {
		type: Function as PropType<(text: string) => string>,
		required: false,
	},
})

const isFocused = ref(false)

const inputEl = ref<HTMLInputElement | null>(null)
const focus = () => inputEl.value?.focus()
defineExpose({ inputEl, focus })

// `text` is intentionally a string|number|null union — the original binds modelValue ([String,Number])
// and assigns numbers/null in the int/clear branches. Casts at string-op sites preserve that.
const text = ref<string | number | null | undefined>(props.modelValue ? props.modelValue : "")
/** The `int` field refused an edit: its error state shows until it takes one, is left or is written. */
const refused = ref(false)
type EditStart = { text: string; start: number; end: number }
/** Text and selection at the `int` field's last `beforeinput`; an `input`, blur or write ends it. */
let editStart: EditStart | null = null

const warning = ref({
	show: false,
	text: "",
})
const fillWarning = (text?: string) => {
	if (text) {
		warning.value = {
			show: true,
			text,
		}
	} else {
		warning.value.show = false
	}
}

onMounted(() => {
	if (props.autofocus) {
		inputEl.value?.focus()
	}
})

watch(
	() => props.modelValue,
	() => {
		text.value = props.modelValue
		refused.value = false
		editStart = null
	},
)

const getInputType = computed(() => {
	if (!!props.type) return props.type
	return "text"
})

const handleInput = (event?: Event) => {
	if (props.disabled) return

	if (props.normalize) text.value = props.normalize(text.value as string)
	else if (props.sanitize) text.value = sanitizeString(text.value as string, props.maxLength)

	if (!!props.maxLength) applyMaxLength(props.maxLength)

	emitParsedValue(event)
}

/** Truncate to the cap and flip the "limit reached" warning + event; the warning clears on every keystroke first. */
function applyMaxLength(maxLength: number) {
	fillWarning()
	emit("maxLengthReached", false)

	if ((text.value as string).length > maxLength) {
		text.value = (text.value as string).slice(0, maxLength)
	}

	if ((text.value as string).length === maxLength) {
		fillWarning(`You can’t enter more than ${maxLength} characters`)
		emit("maxLengthReached", true)
	}
}

/** Emit the model value in the field's type: parsed float for `number`, clamped digits for `int`, raw text otherwise. */
function emitParsedValue(event?: Event) {
	if (props.type === "number") {
		emit(
			"update:modelValue",
			Number.isNaN(Number.parseFloat(text.value as string)) ? text.value : Number.parseFloat(text.value as string),
		)
	} else if (props.subtype === "int") {
		takeIntEdit(event!)
	} else {
		emit("update:modelValue", text.value)
	}
}

const handleBeforeInput = (e: InputEvent) => {
	if (props.subtype !== "int" || e.isComposing) return
	const el = e.target as HTMLInputElement
	editStart = { text: el.value, start: el.selectionStart ?? el.value.length, end: el.selectionEnd ?? el.value.length }
}

/**
 * The text between the record's untouched ends, or null when the new text does not keep them: a
 * no-op Delete raises `beforeinput` with no `input`, and a drop may land away from the selection.
 */
const insertedText = (raw: string, start: EditStart): string | null => {
	const head = start.text.slice(0, start.start)
	const tail = start.text.slice(start.end)
	const framed = raw.length >= head.length + tail.length && raw.startsWith(head) && raw.endsWith(tail)
	return framed ? raw.slice(head.length, raw.length - tail.length) : null
}

/**
 * Refuses whole an edit that inserts a non-digit. Only the inserted text is judged, so a caller's
 * `1.5` still takes a digit, and the strip below joins it (`1.52` emits 152).
 */
function takeIntEdit(event: Event) {
	// Vue re-fires `input` once a composition ends; that edit is the one judged.
	if ((event as InputEvent).isComposing) return
	const el = event.target as HTMLInputElement
	const start = editStart
	editStart = null
	if (/\D/.test((start && insertedText(el.value, start)) ?? el.value)) {
		const shown = start?.text ?? String(props.modelValue ?? "")
		// The value first: assigning it moves the caret to the end.
		el.value = shown
		if (start) el.setSelectionRange(start.start, start.end)
		text.value = shown
		refused.value = true
		return
	}
	refused.value = false
	const value = el.value.replace(/[^\d]/g, "")
	// Parsed from the digits written back to the field, so the number emitted is the one shown.
	let res = value ? Number.parseInt(value, 10) : 0
	text.value = value ? value : 0

	if (props.max) {
		const max = Number(props.max)
		if (res > max) {
			res = max
			text.value = max
		}
	}

	emit("update:modelValue", res)
}

const handleKeydown = (e: KeyboardEvent) => {
	if (props.disabled && e.key !== "Tab") e.preventDefault()
	if (props.type === "number") {
		if (e.key === "-") e.preventDefault()
	}
}

const handleClick = () => {
	if (inputEl.value) inputEl.value.focus()
}

const handleFocus = () => {
	isFocused.value = true
	emit("focus")
}

const handleBlur = () => {
	isFocused.value = false
	refused.value = false
	editStart = null
	emit("blur")
}

const handlePaste = (e: ClipboardEvent) => {
	if (props.disablePaste) {
		e.preventDefault()
		return
	}

	if (!!props.maxLength) {
		e.preventDefault()
		// `window.clipboardData` is the legacy IE fallback — cast to read it without `any`.
		const clip = e.clipboardData || (window as unknown as { clipboardData?: DataTransfer }).clipboardData
		const paste = (clip as DataTransfer).getData("text") || ""
		const el = inputEl.value as HTMLInputElement
		const start = el.selectionStart ?? (text.value as string).length
		const end = el.selectionEnd ?? start
		const before = (text.value as string).slice(0, start)
		const after = (text.value as string).slice(end)
		// Normalized before the cut, so what `normalize` removes never costs a character.
		let newText = props.normalize ? props.normalize(before + paste + after) : before + paste + after
		const caret = props.normalize ? props.normalize(before + paste).length : start + paste.length

		if (newText.length > props.maxLength) {
			newText = newText.slice(0, props.maxLength)
		}

		text.value = newText
		handleInput()

		nextTick(() => {
			const pos = Math.min(caret, props.maxLength as number)
			el.setSelectionRange(pos, pos)
		})

		return
	}
}

const handleClear = () => {
	isFocused.value = false
	text.value = null
	emit("clear")
	emit("blur")
}
</script>

<template>
	<Flex direction="column" gap="8">
		<Flex v-if="label" align="center" justify="between">
			<Flex align="center" gap="4">
				<Text variant="label-section" color="secondary">{{ label }}</Text>
				<slot name="labelSuffix" />
			</Flex>

			<!-- The caller's message wins: the length note is the fallback, shown only while the slot is
				 empty, so a caller passes `#right` only while its message shows. -->
			<slot name="right">
				<Transition v-if="warning.show" name="fade">
					<Tooltip position="end">
						<Flex align="center" gap="6">
							<Icon name="warning" size="12" color="yellow" />
							<Text variant="body" color="primary"> Maximum length reached </Text>
						</Flex>

						<template #content>
							{{ warning.text }}
						</template>
					</Tooltip>
				</Transition>
			</slot>
		</Flex>

		<Flex
			ref="base"
			@click="handleClick"
			gap="12"
			:data-input-size="size"
			:class="[$style.base, isFocused && $style.focused, disabled && $style.disabled, (error || refused) && $style.error, $style[size]]"
		>
			<Flex align="center" gap="6" wide :class="$style.left">
				<Icon v-if="icon" :name="icon" size="16" color="tertiary" />
				<Text v-if="leftText" variant="value" color="tertiary">{{ leftText }}</Text>

				<input
					ref="inputEl"
					:class="`type--${textVariant}`"
					:type="getInputType"
					:max="max"
					v-model="text"
					@beforeinput="handleBeforeInput"
					@input="handleInput"
					@focus="handleFocus"
					@blur="handleBlur"
					@keydown="handleKeydown"
					@paste="handlePaste"
					:placeholder="placeholder"
					spellcheck="false"
					:autocomplete="autocomplete"
					:autocapitalize="autocapitalize"
					:autocorrect="autocorrect"
					:role="role"
					:aria-labelledby="ariaLabelledby"
					:aria-invalid="ariaInvalid ?? (refused || undefined)"
					:aria-expanded="ariaExpanded"
					:aria-autocomplete="ariaAutocomplete"
					:aria-activedescendant="ariaActivedescendant"
					:aria-controls="ariaControls"
					:data-testid="inputTestid"
				/>
			</Flex>

			<Icon
				v-if="clearable && text"
				@click.stop="handleClear"
				name="close"
				size="14"
				color="tertiary"
				:class="$style.clear_btn"
			/>
			
			<slot v-else name="suffix" />
		</Flex>

		<slot name="bottom" />
	</Flex>
</template>

<style module>
/**
 * Brutalist input visual — single canonical style. The legacy boxed
 * `default` variant was removed; callers that didn't pass `variant`
 * shift from the framed look to this brutalist underline.
 */
.base {
	display: flex;
	align-items: center;
	justify-content: space-between;

	border-radius: 0;
	border: none;
	border-bottom: 1px solid var(--nulo-border);
	background: transparent;
	padding: 12px 0;
	cursor: text;

	transition: border-color 0.2s ease;
}

.base:hover {
	border-bottom-color: var(--nulo-outline);
}

.base.focused {
	border-bottom-color: var(--nulo-accent);
}

.base.error {
	border-bottom-color: var(--red);
}

.base.disabled {
	opacity: 0.5;
	pointer-events: none;
}

/* Size variants are kept for callers that explicitly use them. The
 * brutalist style is height-auto by default; size classes are no-ops
 * unless overridden. */
.base.medium {
	min-height: 40px;
}

.base.small {
	min-height: 30px;
}

.base.mini {
	min-height: 24px;
	input {
		font-size: 12px;
	}
}

.base input {
	border: none;
	outline: none;
	width: 100%;
	height: 100%;
	padding: 0;
	background: transparent;

	color: var(--txt-primary);

	text-overflow: ellipsis;
}

.base input::placeholder {
	color: var(--nulo-secondary);
}

.base input::-webkit-outer-spin-button,
.base input::-webkit-inner-spin-button {
	-webkit-appearance: none;
	margin: 0;
}

/* Firefox has no spin-button pseudo-elements; this is how it drops them. */
.base input[type="number"] {
	appearance: textfield;
}

.left {
	height: 100%;
}

.clear_btn {
	cursor: pointer;

	transition: all 0.2s var(--bezier);

	&:hover {
		color: var(--txt-primary);
	}
}
</style>
