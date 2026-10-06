<script setup lang="ts">
/**
 * The in-page passkey step (PATH A): the passkey card over the dimmed page while this page runs the
 * request. The passkey window (PATH B) runs the same `runPasskeyCeremony`.
 *
 * Escape, Cancel and unmount abort one controller, and only that abort is a cancel: it rejects
 * with `UserRejectedError`, so callers stay silent. Any other failure, a dismissed or timed-out
 * prompt included, is emitted as is for callers to word through `classifyPasskeyFailure`.
 */
import { computed, onBeforeUnmount, onMounted, useTemplateRef } from "vue"
import { createFocusTrap, type FocusTrap } from "focus-trap"
import type { PasskeyCredentialData } from "@nulo/wallet-crypto"
import type { PasskeyRequest } from "@/wallet/services/passkey/spec"
import { UserRejectedError } from "@nulo/extension-messaging/errors"
import { runPasskeyCeremony } from "@/wallet/utils/passkey-ceremony"
import { isPasskeyCancel, PASSKEY_COPY, passkeyTag } from "@/utils/passkey-copy"
import PasskeyScreen from "@/components/composite/PasskeyScreen.vue"

const props = defineProps<{
	request: PasskeyRequest
}>()

const emit = defineEmits<{
	resolve: [data: PasskeyCredentialData]
	reject: [error: Error]
}>()

const tag = computed(() => passkeyTag(props.request.step, props.request.profileName))

const backdrop = useTemplateRef<HTMLElement>("backdrop")
const controller = new AbortController()
let settled = false
let trap: FocusTrap | undefined

function cancel(reason: string) {
	if (settled) return
	controller.abort(new DOMException(reason, "AbortError"))
}

function handleKeydown(e: KeyboardEvent) {
	if (e.key !== "Escape" || settled) return
	// Chrome closes its toolbar popup on an Escape the page leaves unhandled, and cancelling the
	// ceremony must not close the wallet with it.
	e.preventDefault()
	cancel("user cancelled with Escape")
}

onMounted(async () => {
	window.addEventListener("keydown", handleKeydown)
	// Tab stays in the card, as in a popup: focus is left where it was and returns there after, and
	// Escape stays with `handleKeydown`.
	if (backdrop.value) {
		trap = createFocusTrap(backdrop.value, {
			initialFocus: false,
			fallbackFocus: backdrop.value,
			escapeDeactivates: false,
			allowOutsideClick: true,
		})
		trap.activate()
	}
	try {
		const data = await runPasskeyCeremony(props.request, controller.signal)
		settled = true
		emit("resolve", data)
	} catch (err) {
		settled = true
		if (isPasskeyCancel(err)) {
			emit("reject", new UserRejectedError("User cancelled passkey ceremony"))
		} else {
			emit("reject", err instanceof Error || err instanceof DOMException ? err : new Error(String(err)))
		}
	}
})

onBeforeUnmount(() => {
	window.removeEventListener("keydown", handleKeydown)
	trap?.deactivate()
	cancel("dialog dismounted")
})
</script>

<template>
	<teleport to="#popup">
		<div ref="backdrop" :class="$style.backdrop">
			<PasskeyScreen
				layout="card"
				tone="waiting"
				:tag="tag"
				:title="PASSKEY_COPY.waiting.title"
				:body="PASSKEY_COPY.waiting.body"
				data-testid="passkey-ceremony-dialog"
			>
				<template #actions>
					<Button variant="cta_outline" size="compact" data-testid="passkey-ceremony-cancel" @click="cancel('user cancelled')">
						Cancel
					</Button>
				</template>
			</PasskeyScreen>
		</div>
	</teleport>
</template>

<style module>
.backdrop {
	position: fixed;
	inset: 0;
	z-index: 10000;

	display: flex;
	align-items: center;
	justify-content: center;
	padding: 24px;

	background: color-mix(in srgb, var(--app-bg) 72%, transparent);

	/* Intercept ALL pointer events — no click-outside dismissal. */
	pointer-events: auto;
}
</style>
