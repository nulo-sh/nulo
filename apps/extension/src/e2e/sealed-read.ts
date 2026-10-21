import { MemoryStorageArea, type MinimalStorageArea } from "@nulo/wallet-core/storage"
import type { RowKeysSource } from "@/wallet/storage/sealed-entity-storage"
import { type SealedStoreName, sealedEntityStorage, STORES } from "@/wallet/storage/stores"

/**
 * E2E-only reader of the sealed roots, answered by the background: a spec reads a root's rows as
 * the wallet reads them, with the row keys this worker holds, so it can read while the wallet is
 * locked, read another profile's rows, and learn the storage key a row sits at.
 *
 * Built in only when `VITE_NULO_E2E_SEALED_READ=1`, which the wiring site tests as a literal (see
 * `./csp-report.ts` for why). It reads and never writes; a spec that needs a row changed writes a
 * plaintext replacement at the row's natural key, which the dual read serves.
 */

/** The message a spec sends; the release workflow greps release bundles for it. */
export const SEALED_READ_MESSAGE = "nulo:e2e:sealed-read"

export type SealedReadRequest = {
	type: typeof SEALED_READ_MESSAGE
	root: SealedStoreName
	/** Stored values to read instead of the root's rows in storage, keyed as stored: a value a spec
	 *  captured from a change event. */
	stored?: Record<string, unknown>
}

/** One readable row: where it is stored, the id it answers to, whose it is and whether it is sealed. */
export type SealedReadRow = { storageKey: string; naturalId: string; profileId: string | undefined; sealed: boolean; row: unknown }

type MessageListener = (message: unknown, sender: { url?: string }, sendResponse: (response: unknown) => void) => boolean

export interface SealedReadDeps {
	area: MinimalStorageArea
	keys: RowKeysSource
	addMessageListener(listener: MessageListener): void
	/** `runtime.getURL("")`: only the extension's own documents may read. */
	extensionOrigin: string
}

function isRequest(message: unknown): message is SealedReadRequest {
	if (typeof message !== "object" || message === null) return false
	const { type, root } = message as { type?: unknown; root?: unknown }
	return type === SEALED_READ_MESSAGE && typeof root === "string" && root in STORES && "sealed" in STORES[root as SealedStoreName]
}

export async function readSealedRoot(
	request: Pick<SealedReadRequest, "root" | "stored">,
	area: MinimalStorageArea,
	keys: RowKeysSource,
): Promise<SealedReadRow[]> {
	const source = request.stored ? new MemoryStorageArea().seed(request.stored) : area
	const prefix = `${STORES[request.root].ref.root}@`
	return (await sealedEntityStorage(request.root, source, keys).entries()).map(({ located, row }) => ({
		storageKey: prefix + located.storageId,
		naturalId: located.naturalId,
		profileId: located.owner,
		sealed: located.sealed,
		row,
	}))
}

export function answerSealedReads(deps: SealedReadDeps): void {
	deps.addMessageListener((message, sender, sendResponse) => {
		if (!isRequest(message) || !sender.url?.startsWith(deps.extensionOrigin)) return false
		readSealedRoot(message, deps.area, deps.keys).then(sendResponse, () => sendResponse(undefined))
		return true
	})
}
