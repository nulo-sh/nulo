<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<route lang="json">
{
	"meta": {
		"isAuthRequired": false,
		"isPasskeyInteraction": true
	}
}
</route>

<script setup lang="ts">
/**
 * PATH B — the passkey window the background opens for a step started in Firefox's toolbar panel,
 * which closes when the OS prompt takes focus. It runs the same `runPasskeyCeremony` as the
 * in-page dialog (PATH A), hands the result to the background, and stays open until the step it
 * started has ended: `waiting` → `finishing` → closed, or `failed` (the prompt failed; Try again)
 * or `step-failed` (the step failed after the prompt, or the request is gone).
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue"
import { PasskeyServiceClient } from "@/wallet/services/passkey/client"
import type { PasskeyCredentialData, PasskeyRequest } from "@/wallet/services/passkey/spec"
import { confirmCreatedCredential, runPasskeyCeremony } from "@/wallet/utils/passkey-ceremony"
import { PasskeyUnconfirmedError } from "@/wallet/utils/passkey-errors"
import { PASSKEY_COPY, type PasskeyTitle, passkeyTag, stepFailedTitle } from "@/utils/passkey-copy"
import PasskeyScreen from "@/components/composite/PasskeyScreen.vue"

type WindowState = "waiting" | "finishing" | "failed" | "step-failed"

const route = useRoute()

const requestId = typeof route.query.requestId === "string" ? route.query.requestId : undefined
const state = ref<WindowState>("waiting")
const request = shallowRef<PasskeyRequest>()
/** A credential the create saved but could not confirm: Try again confirms it rather than create
 *  another. */
const unconfirmed = shallowRef<PasskeyUnconfirmedError>()

const tag = computed(() => (request.value ? passkeyTag(request.value.step, request.value.profileName) : ""))
const tone = computed(() => (state.value === "step-failed" ? "failed" : state.value))
const isFailure = computed(() => state.value === "failed" || state.value === "step-failed")
const title = computed<PasskeyTitle>(() => {
	if (state.value === "finishing") return PASSKEY_COPY.finishing.title
	if (state.value === "failed") return PASSKEY_COPY.failed.title
	if (state.value === "step-failed") return stepFailedTitle(windowStep(request.value))
	return PASSKEY_COPY.waiting.title
})
const body = computed(() => {
	if (state.value === "finishing") return PASSKEY_COPY.finishing.body
	if (state.value === "failed") return unconfirmed.value ? PASSKEY_COPY.failed.unconfirmedBody : PASSKEY_COPY.failed.body
	if (state.value === "step-failed") return PASSKEY_COPY.stepFailedBody
	return PASSKEY_COPY.waiting.body
})

const passkey = new PasskeyServiceClient()
let controller: AbortController | undefined
let busy = false

/** The window only runs unlock, create and import; the dormant operation confirm reads as unlock. */
function windowStep(req: PasskeyRequest | undefined) {
	return req?.step === "create" || req?.step === "import" ? req.step : "unlock"
}

/** `undefined` once the request is gone (answered, cancelled, replaced): nothing is left to retry. */
async function readRequest(id: string): Promise<PasskeyRequest | undefined> {
	try {
		request.value = await passkey.getPendingRequest(id)
		return request.value
	} catch {
		state.value = "step-failed"
		return undefined
	}
}

/** One prompt: the request's own, or the confirmation a saved credential still needs. */
async function prompt(req: PasskeyRequest): Promise<PasskeyCredentialData | undefined> {
	controller = new AbortController()
	const { signal } = controller
	const saved = unconfirmed.value
	try {
		return saved ? await confirmCreatedCredential(saved.credentialId, saved.userHandle, signal) : await runPasskeyCeremony(req, signal)
	} catch (err) {
		// The window's own abort means it is closing: there is nothing left to show.
		if (signal.aborted) return undefined
		if (err instanceof PasskeyUnconfirmedError) unconfirmed.value = err
		state.value = "failed"
		return undefined
	}
}

async function finishStep(id: string, data: PasskeyCredentialData): Promise<void> {
	state.value = "finishing"
	const outcome = await passkey.resolvePasskeyRequest(id, data).catch(() => "failed" as const)
	if (outcome === "done") window.close()
	else state.value = "step-failed"
}

/** One attempt at a time: Try again does nothing while a prompt or the step's end is in flight. */
async function attempt(): Promise<void> {
	if (busy || !requestId) return
	busy = true
	try {
		const req = await readRequest(requestId)
		if (!req) return
		state.value = "waiting"
		const data = await prompt(req)
		if (data) await finishStep(requestId, data)
	} finally {
		busy = false
	}
}

/** Cancel while waiting and Close after a failed prompt do what closing the window does. */
async function cancelRequest(): Promise<void> {
	controller?.abort(new DOMException("passkey window cancelled", "AbortError"))
	if (requestId) await passkey.rejectPasskeyRequest(requestId).catch(() => undefined)
	window.close()
}

function closeWindow(): void {
	window.close()
}

onMounted(() => {
	if (!requestId) {
		window.close()
		return
	}
	passkey.connect()
	void attempt()
})

onBeforeUnmount(() => {
	controller?.abort(new DOMException("window closing", "AbortError"))
	passkey.disconnect()
})
</script>

<template>
	<PasskeyScreen
		layout="window"
		:tone="tone"
		:tag="tag"
		:title="title"
		:body="body"
		:note="PASSKEY_COPY.windowNote"
		:body-testid="isFailure ? 'passkey-window-error' : undefined"
		data-testid="passkey-window"
		:data-state="state"
	>
		<template #actions>
			<!-- Finishing keeps Cancel in place, hidden and out of reach, so the screen does not move. -->
			<Button v-if="!isFailure" variant="cta_outline" data-testid="passkey-window-cancel" @click="cancelRequest">Cancel</Button>
			<template v-else-if="state === 'failed'">
				<Button variant="cta" data-testid="passkey-window-retry" @click="attempt">Try again</Button>
				<Button variant="cta_outline" data-testid="passkey-window-close" @click="cancelRequest">Close</Button>
			</template>
			<Button v-else variant="cta_outline" data-testid="passkey-window-close" @click="closeWindow">Close</Button>
		</template>
	</PasskeyScreen>
</template>
