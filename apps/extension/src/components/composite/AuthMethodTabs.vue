<script setup lang="ts">
/** A roving tablist: one tab stop, and ←/→ switch the method and move focus to it. */
import { computed, nextTick } from "vue"

type AuthMethod = "password" | "passkey"

const method = defineModel<AuthMethod>({ required: true })

const props = withDefaults(
	defineProps<{
		ariaLabel: string
		tabClass: string
		activeClass: string
		passwordTestid: string
		passkeyTestid: string
		/** The tab read and reached first. */
		first?: AuthMethod
	}>(),
	{ first: "password" },
)

const LABELS: Record<AuthMethod, string> = { password: "Password", passkey: "Passkey" }
const order = computed<AuthMethod[]>(() => (props.first === "passkey" ? ["passkey", "password"] : ["password", "passkey"]))
const testid = (m: AuthMethod) => (m === "password" ? props.passwordTestid : props.passkeyTestid)

const tabs: Partial<Record<AuthMethod, HTMLButtonElement>> = {}

const onKeydown = (e: KeyboardEvent) => {
	if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
	e.preventDefault()
	method.value = method.value === "password" ? "passkey" : "password"
	nextTick(() => tabs[method.value]?.focus())
}
</script>

<template>
	<div role="tablist" :aria-label="ariaLabel" @keydown="onKeydown">
		<button
			v-for="m in order"
			:key="m"
			:ref="(el) => (tabs[m] = (el as HTMLButtonElement | null) ?? undefined)"
			type="button"
			role="tab"
			:aria-selected="method === m"
			:tabindex="method === m ? 0 : -1"
			:class="[tabClass, method === m && activeClass]"
			:data-testid="testid(m)"
			@click="method = m"
		>
			{{ LABELS[m] }}
		</button>
	</div>
</template>
