<script setup lang="ts">
/**
 * Presentation-only identity strip — the anti-phishing trust anchor rendered
 * at the top of every dApp interaction window (discover, capabilities,
 * execute, verify). ONE implementation of the skeleton (status dot · account
 * · network · brand mark) so a spacing/status/a11y fix can never leave the
 * windows visually inconsistent; callers own their labels and branching.
 *
 * `networkLabel` semantics (both shapes exist among callers and are
 * load-bearing): `undefined` omits the separator+network entirely (verify
 * with no network); an EMPTY STRING still renders the separator (the
 * discover/capabilities strip always shows "·").
 */
withDefaults(
	defineProps<{
		accountLabel: string
		networkLabel?: string
		status?: "ready" | "loading" | "cancelled"
		warn?: boolean
	}>(),
	{ networkLabel: undefined, status: "ready", warn: false },
)
</script>

<template>
	<Flex align="center" justify="between" gap="12" :class="$style.identity_strip">
		<Flex align="center" gap="8">
			<span :class="[$style.status_dot, $style[`status_${status}`]]" />
			<span data-testid="identity-account" :class="$style.identity_account">{{ accountLabel }}</span>
			<template v-if="networkLabel !== undefined">
				<span :class="$style.identity_sep">·</span>
				<span
					data-testid="identity-network"
					:data-warn="warn || undefined"
					:class="[$style.identity_network, warn && $style.identity_warn]"
				>{{ networkLabel }}</span>
			</template>
		</Flex>
		<span :class="$style.identity_brand">NULO</span>
	</Flex>
</template>

<style module>
.identity_strip {
	flex-shrink: 0;

	padding: 10px 16px;
	background: var(--nulo-surface);
	border-bottom: 1px solid var(--nulo-border);
}

.status_dot {
	display: inline-block;
	width: 6px;
	height: 6px;
	flex-shrink: 0;
}

.status_ready {
	background: var(--green);
}
.status_loading {
	background: var(--orange);
}
.status_cancelled {
	background: var(--red);
}

.identity_account {
	composes: type--name-tag from global;
	color: var(--txt-primary);

	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	max-width: 140px;
}

/* Chrome's normal line box here; Firefox's is 15px, a pixel over the drawn 35px strip. */
.identity_sep {
	composes: type--meta from global;
	line-height: 14px;
	color: var(--nulo-outline);
}

.identity_network {
	composes: type--meta from global;
	color: var(--nulo-secondary);

	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	max-width: 80px;
}

.identity_warn {
	color: var(--orange);
}

.identity_network.identity_warn {
	font-weight: 700;
}

.identity_brand {
	composes: type--brand from global;
	color: var(--nulo-outline);
}
</style>
