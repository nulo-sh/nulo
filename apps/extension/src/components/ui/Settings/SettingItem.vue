<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
import { h, mergeProps, useCssModule, withKeys, withModifiers } from "vue"
import { RouterLink } from "vue-router"
import RowTarget from "@/components/ui/RowTarget.vue"

defineOptions({ inheritAttrs: false })

const $style = useCssModule()

const props = defineProps({
	size: {
		type: String,
		default: "medium",
	},
	title: String,
	/** `name` for a row titled with a person's or account's name, `meta` for an identifier. */
	titleVariant: {
		type: String,
		default: "row-title",
		validator: (value) => ["row-title", "name", "meta"].includes(value),
	},
	description: String,
	/** `meta` for an address or id. */
	descriptionVariant: {
		type: String,
		default: "caption",
		validator: (value) => ["caption", "meta"].includes(value),
	},
	icon: String,
	iconBgColor: {
		type: String,
		default: "gray-20",
	},
	iconFillColor: {
		type: String,
		default: "secondary",
	},
	to: String,
	/** The setting's current state, shown before the chevron. */
	value: String,
	chevron: {
		type: Boolean,
		required: false,
	},
	external: {
		type: Boolean,
		default: false,
	},
	/** A glyph in the chevron's place, for a row that acts in place instead of opening a page. */
	trailingIcon: String,
	/** With an internal `to`, the row holds its own controls in `#right`: its link is stretched
	 *  under them, never around them, and carries every attribute but `class` and `style`. */
	controls: {
		type: Boolean,
		default: false,
	},
	disabled: {
		type: Boolean,
		default: false,
	},
	loading: {
		type: Boolean,
		default: false,
	},
	raw: {
		type: Boolean,
		default: false,
	},
})

const attrs = useAttrs()
const titleId = useId()

/** `disabled` decides first: a disabled row is inert whatever `to` or `@click` it carries. */
const mode = computed(() => {
	if (props.disabled) return "inert"
	if (props.to) {
		if (props.external) return "external"
		return props.controls ? "stretched" : "link"
	}
	if (attrs.onClick) return "click"
	return "inert"
})

const rootClass = computed(() => [
	$style.wrapper,
	$style[props.size],
	mode.value !== "inert" && $style.interactive,
	props.raw && $style.raw,
	props.disabled && $style.disabled,
	mode.value === "stretched" && $style.stretched,
])

const linkAttrs = computed(() => {
	const { class: _class, style: _style, ...rest } = attrs
	return rest
})

/** An anchor has no native Space action; a bare Space presses it, and a modified one scrolls. */
const pressOnSpace = withKeys(
	withModifiers((e) => e.currentTarget.click(), ["exact", "prevent"]),
	["space"],
)

/** The row root by mode, written once around the same body. */
const Root = (_, { slots }) => {
	const body = slots.default?.()
	const shared = mergeProps(mode.value === "inert" ? { ...attrs, onClick: undefined } : attrs, { class: rootClass.value })
	if (mode.value === "link") {
		return h(
			RouterLink,
			{ to: props.to, custom: true },
			{
				default: ({ href, navigate }) =>
					h("a", mergeProps(shared, { href, onClick: navigate, onKeydown: withKeys(navigate, ["space"]) }), body),
			},
		)
	}
	if (mode.value === "stretched") return h("div", { class: [attrs.class, rootClass.value], style: attrs.style }, body)
	if (mode.value === "external") {
		return h("a", mergeProps(shared, { href: props.to, target: "_blank", rel: "noopener noreferrer", onKeydown: pressOnSpace }), body)
	}
	return h("div", shared, body)
}
</script>

<template>
	<Root>
		<RowTarget v-if="mode === 'click'" :labelledby="titleId" />
		<RowTarget v-else-if="mode === 'stretched'" v-bind="linkAttrs" :to :labelledby="titleId" />

		<Flex wide align="center" justify="between" gap="16" :class="$style.main">
			<Flex align="center" gap="14" wide :class="$style.left">
				<div v-if="icon || $slots.dot || $slots.icon" :class="[$style.icon_wrapper, $slots.icon && $style.icon_slotted]">
					<!-- Dot -->
					<slot name="dot" />

					<!-- Icon: custom slot wins, otherwise prop-driven fallback -->
					<slot name="icon">
						<Icon
							v-if="icon && !loading"
							:name="icon"
							size="18"
							:color="iconFillColor"
							:class="$style.icon"
						/>
						<div v-else-if="icon && loading" :class="$style.icon_loading">
							<Spinner size="16" color="--txt-primary" />
						</div>
					</slot>
				</div>

				<!-- Labels: Title & Description -->
				<Flex direction="column" gap="4" wide :class="$style.labels">
					<Flex align="center" gap="6" :class="$style.title_row">
						<Text v-if="titleVariant === 'meta'" :id="titleId" data-testid="setting-title" variant="meta" color="primary" :class="[$style.title, $slots.titleSuffix && $style.titleWithSuffix]"> {{ title }} </Text>
						<Text v-else :id="titleId" data-testid="setting-title" :variant="titleVariant === 'name' ? 'name' : 'row-title'" color="primary" :class="[$style.title, $style.title_size, $slots.titleSuffix && $style.titleWithSuffix]"> {{ title }} </Text>
						<slot name="titleSuffix" />
					</Flex>
					<Text v-if="description || $slots.description" data-testid="setting-description" :variant="descriptionVariant === 'meta' ? 'meta' : 'caption'" color="tertiary" :class="[$style.description, descriptionVariant === 'meta' && $style.description_meta]">
						<slot name="description">{{ description }}</slot>
					</Text>
				</Flex>
			</Flex>

			<Flex align="center" gap="12" :class="$style.right">
				<Text v-if="value" data-testid="setting-value" variant="value" color="secondary" :class="$style.value">{{ value }}</Text>
				<slot name="right">
					<Icon
						v-if="to || chevron || trailingIcon"
						:name="trailingIcon || (external ? 'open' : 'chevron')"
						:size="18"
						color="secondary"
						:class="$style.chevron_icon"
					/>
				</slot>
			</Flex>
		</Flex>
	</Root>
</template>

<style module>
.wrapper {
	composes: divider from "./settings-row.module.css";

	display: flex;
	align-items: center;

	background: transparent;
	text-decoration: none;

	padding: 16px 20px;

	&.disabled {
		pointer-events: none;
		opacity: 0.5;
	}

	&::after {
		left: 20px;
		right: 20px;
	}

	&:last-child::after {
		display: none;
	}

	&.large {
		padding: 20px;
	}

	&.medium {
		padding: 16px 20px;
	}

	&.small {
		padding: 12px 20px;
	}

	&.raw {
		background: var(--nulo-surface-low);
	}
}

.interactive {
	user-select: none;
	cursor: pointer;
	transition: background 0.2s var(--bezier);

	&:hover,
	&:focus-visible,
	&:has(> [data-row-target]:focus-visible) {
		background: var(--nulo-surface-high);
	}

	&:focus-visible,
	&:has(> [data-row-target]:focus-visible) {
		outline: 2px solid var(--nulo-accent);
		outline-offset: -2px;
	}

	&:active {
		background: var(--nulo-surface-highest);
	}
}

/* Positioned, so they paint above the stretched link: they let the pointer through to it. */
.stretched .icon_wrapper,
.stretched::after {
	pointer-events: none;
}

.icon_wrapper {
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 20px;
	height: 20px;
	flex-shrink: 0;
}

.icon_slotted {
	width: auto;
	height: auto;
	min-width: 20px;
	min-height: 20px;
}

.icon_loading {
	display: inline-flex;
	align-items: center;
	justify-content: center;
}

.value {
	flex-shrink: 0;
	white-space: nowrap;
}

.chevron_icon {
	color: var(--nulo-secondary);
	transition: color 0.2s var(--bezier);
}

.interactive:hover .chevron_icon {
	color: var(--nulo-accent);
}

.title {
	min-width: 100%;
	width: 0;

	line-height: 20px !important;

	text-overflow: ellipsis;
	/* Not `hidden`: a hidden box scrolls its text under a drag that selects past its edge. */
	overflow: clip;
	white-space: nowrap;

	&.titleWithSuffix {
		min-width: unset;
		width: auto;
	}
}

.title_size {
	font-size: 14px;
}

.description {
	min-width: 100%;
	width: 0;

	line-height: 16px !important;

	text-overflow: ellipsis;
	overflow: clip;
	white-space: nowrap;
}

/* Below the popup's width a title and its description wrap rather than being cut, a title's suffix
 * drops under it when the two do not fit, and the row's controls go under its text when beside them
 * the text would have less than 72 px, or a `meta` description's line less than 14 characters. */
@media (width < 359px) {
	.wrapper .main {
		flex-wrap: wrap;
		row-gap: 8px;
	}

	.main > .left {
		flex: 1 1 0;
	}

	.left > .labels {
		min-width: 72px;
	}

	.main > .right {
		margin-left: auto;
	}

	.title_row {
		flex-wrap: wrap;
	}

	.title,
	.description {
		white-space: normal;
		overflow-wrap: break-word;
	}

	/* A `meta` description is an identifier: its line holds a shortened one (13 characters) whole. */
	.labels > .description_meta {
		min-width: max(100%, 14ch);
	}

	.left > .labels:has(> .description_meta) {
		min-width: auto;
	}
}
</style>
