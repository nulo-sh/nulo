import type { Page } from "puppeteer"
import { AUTH_REGISTRY_STORAGE_ROOT } from "@/wallet/services/auth-registry/spec"
import type { AuthwitContent } from "@/wallet/services/execution/spec"
import type { ActivityScope } from "./activity-seeds"

/** Wire-shaped: 0x and 64 hex under the field modulus. */
const field = (byte: string) => `0x${byte.repeat(32)}`

/** One record of each content kind the authwits page renders, every value wire-shaped. */
const CONTENTS: readonly AuthwitContent[] = [
	{ kind: "call", caller: field("1a"), contract: field("1b"), method: "transfer_in_public", args: [] },
	{ kind: "encoded_call", caller: field("2a"), to: field("2b"), selector: "0x9a7b5c3d", args: [] },
	{ kind: "intent", consumer: field("0c"), intent: [field("0d"), field("0e")] },
	{ kind: "message_hash", messageHash: field("0f") },
]

/**
 * Stores confirmed authwit rows for the scope's account, numbered from 1, as the registry records
 * them once their send mines. The key's suffix is the row's id: the registry hides a row whose key
 * names another.
 */
export async function seedAuthwits(page: Page, scope: ActivityScope): Promise<void> {
	const rows = Object.fromEntries(
		CONTENTS.map((content, i) => {
			const id = i + 1
			const row = {
				id,
				profileId: scope.profileId,
				chainId: scope.chainId,
				account: scope.account,
				hash: field((0x10 + id).toString(16)),
				content,
			}
			return [`${AUTH_REGISTRY_STORAGE_ROOT}@${id}`, JSON.stringify(row)]
		}),
	)
	await page.evaluate((entries: Record<string, string>) => chrome.storage.local.set(entries), rows)
}
