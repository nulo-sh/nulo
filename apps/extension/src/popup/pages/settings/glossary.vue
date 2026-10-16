<route lang="json">
{
	"meta": {
		"isAuthRequired": true
	}
}
</route>

<script setup>
/** Utils */
import { GLOSSARY, GLOSSARY_SECTIONS } from "@/utils/glossary"
</script>

<template>
	<SettingsPageShell title="Glossary" backTo="/popup/settings">
		<section
			v-for="section in GLOSSARY_SECTIONS"
			:key="section.title"
			:class="$style.section"
			:data-testid="`glossary-section-${section.title.toLowerCase()}`"
		>
			<span :class="$style.title">{{ section.title }}</span>
			<div v-for="key in section.keys" :key="key" :class="$style.entry" :data-testid="`glossary-entry-${key}`">
				<span :class="$style.term" :data-testid="`glossary-term-${key}`">{{ GLOSSARY[key].term }}</span>
				<span :class="$style.definition" :data-testid="`glossary-definition-${key}`">{{ GLOSSARY[key].definition }}</span>
				<span :class="$style.where" :data-testid="`glossary-where-${key}`">{{ GLOSSARY[key].where }}</span>
			</div>
		</section>
	</SettingsPageShell>
</template>

<style module>
.section {
	display: flex;
	flex-direction: column;
}

.title {
	composes: type--label-section from global;
	padding: 18px 0 2px;

	color: var(--nulo-secondary);
}

/* The shell's content already starts 16px down, where the drawn list starts 4px down. */
.section:first-child .title {
	padding-top: 6px;
}

.entry {
	display: flex;
	flex-direction: column;
	gap: 4px;

	padding: 12px 0;
	border-bottom: 1px solid var(--hairline-soft);
}

:global([theme="light"]) .entry {
	border-bottom-color: rgba(124, 116, 104, 0.2);
}

.term {
	composes: type--row-title from global;
	font-size: 14px;
	color: var(--txt-primary);
}

.definition {
	composes: type--body from global;
	line-height: 1.45;
	color: var(--nulo-secondary);
}

.where {
	composes: type--caption from global;
	color: var(--nulo-secondary);
}
</style>
