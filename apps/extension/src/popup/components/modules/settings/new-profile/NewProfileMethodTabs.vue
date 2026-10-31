<script setup>
/** The create-profile page's Method section, around the shared roving tablist. */
import AuthMethodTabs from "@/components/composite/AuthMethodTabs.vue"

defineProps({ disabled: { type: Boolean, default: false } })
const type = defineModel("type", { type: String, default: "passkey" })
</script>

<template>
	<div :class="$style.section">
		<span :class="$style.section_label">Method</span>
		<AuthMethodTabs
			v-model="type"
			:class="$style.tabs"
			ariaLabel="Authentication method"
			:tabClass="$style.tab"
			:activeClass="$style.tab_active"
			passwordTestid="register-method-password"
			passkeyTestid="register-method-passkey"
			:disabled="disabled"
		/>
	</div>
</template>

<style module>
/* No outer border-bottom: the inner .tabs already paints its own underline
 * (the active-tab marker overlaps it via bottom: -1px). Stacking the
 * section-level divider on top of the tabs underline created the
 * "double-line" look across the password flow. */
.section {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 20px 0;
}

.section_label {
	composes: type--label-section from global;
	color: var(--nulo-secondary);
}

.tabs {
	display: grid;
	grid-template-columns: 1fr 1fr;
	border-bottom: 1px solid var(--nulo-border);
}

.tab {
	composes: type--segment from global;
	position: relative;

	color: var(--nulo-secondary);

	background: transparent;
	border: none;
	cursor: pointer;

	padding: 14px 0;

	transition: color 0.15s var(--bezier);
}

.tab:hover:not(.tab_active) {
	color: var(--txt-primary);
}

.tab_active {
	color: var(--txt-primary);
}

.tab.tab_active {
	font-weight: 700;
}

.tab_active::after {
	content: "";
	position: absolute;
	left: 0;
	right: 0;
	bottom: -1px;
	height: 2px;
	background: var(--nulo-accent);
}

.tab:focus-visible {
	outline: 2px dotted var(--nulo-accent);
	outline-offset: 2px;
}
</style>
