/**
 * Runs a passkey request through the page's `PasskeyCeremonyDialog`: the caller mounts it with
 * `v-if="request"` and wires its `resolve` and `reject` events to `onResolve` and `onReject`.
 */
import { ref } from "vue"
import type { PasskeyCredentialData } from "@nulo/wallet-crypto"
import { useToast } from "@/composables/toast"
import { PASSKEY_COPY } from "@/utils/passkey-copy"
import type { PasskeyRequest } from "@/wallet/services/passkey/spec"

type Pending = {
	resolve(data: PasskeyCredentialData): void
	reject(err: Error): void
}

export function usePasskeyCeremony() {
	const request = ref<PasskeyRequest | null>(null)
	const { toast, closeToast } = useToast()
	let pending: Pending | null = null

	function runCeremony(req: PasskeyRequest): Promise<PasskeyCredentialData> {
		if (pending) {
			return Promise.reject(new Error("A passkey ceremony is already in flight"))
		}
		// A new attempt takes the last one's "not confirmed" line away, so a success leaves nothing
		// behind and a second refusal shows the line afresh.
		if (toast.value?.label === PASSKEY_COPY.notConfirmed) closeToast()
		return new Promise<PasskeyCredentialData>((resolve, reject) => {
			pending = { resolve, reject }
			request.value = req
		})
	}

	function onResolve(data: PasskeyCredentialData) {
		const p = pending
		pending = null
		request.value = null
		p?.resolve(data)
	}

	function onReject(err: Error) {
		const p = pending
		pending = null
		request.value = null
		p?.reject(err)
	}

	return { request, runCeremony, onResolve, onReject }
}
