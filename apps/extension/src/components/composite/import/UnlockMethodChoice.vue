<script setup>
/**
 * "How you'll unlock Nulo" on the phrase and backup forms: the Passkey · Password tabs (one Tab
 * stop, arrow keys switch), then the password fields the default slot holds, or the passkey note.
 */
import AuthMethodTabs from "@/components/composite/AuthMethodTabs.vue"

defineProps({
	passwordTestid: { type: String, required: true },
	passkeyTestid: { type: String, required: true },
	disabled: { type: Boolean, default: false },
})

const method = defineModel({ type: String, default: "passkey" })
</script>

<template>
	<span :class="$style.section_label">How you'll unlock Nulo</span>
	<AuthMethodTabs
		v-model="method"
		:class="$style.tabs"
		ariaLabel="How you'll unlock Nulo"
		:tabClass="$style.tab"
		:activeClass="$style.tabActive"
		:passwordTestid="passwordTestid"
		:passkeyTestid="passkeyTestid"
		:disabled="disabled"
	/>
	<slot v-if="method === 'password'" />
	<div v-else :class="$style.passkeyInfo" data-testid="unlock-method-passkey-note">
		<Text variant="body" color="secondary" height="150">
			Your passkey replaces a password. Touch ID, Windows Hello, or a hardware key, whichever your device supports.
		</Text>
	</div>
</template>

<style module>
.section_label {
	composes: section_label from "./import-shared.module.css";
}

.tabs {
	display: flex;
	border: 1px solid var(--nulo-outline);
	background: var(--nulo-surface);
	width: fit-content;
}

.tab {
	composes: type--segment from global;
	background: transparent;
	border: none;
	color: var(--txt-secondary);
	padding: 10px 20px;
	cursor: pointer;
	transition:
		background 0.15s var(--bezier),
		color 0.15s var(--bezier);
}

.tab:hover {
	color: var(--txt-primary);
}

.tab:focus-visible {
	outline: 2px solid var(--nulo-accent);
	outline-offset: -2px;
}

.tabActive {
	background: var(--nulo-accent);
	color: var(--app-bg);
}

.tab.tabActive {
	font-weight: 700;
}

.tabActive:hover {
	color: var(--app-bg);
}

.tabActive:focus-visible {
	outline: 2px solid var(--app-bg);
	outline-offset: -5px;
}

.passkeyInfo {
	padding: 16px;
	background: var(--nulo-surface);
	border: 1px solid var(--nulo-border);
}
</style>
