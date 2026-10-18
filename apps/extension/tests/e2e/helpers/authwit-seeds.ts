import type { Page } from "puppeteer"
import { AUTH_REGISTRY_STORAGE_ROOT } from "@/wallet/services/auth-registry/spec"
import type { AuthwitContent } from "@/wallet/services/execution/spec"
import type { ActivityScope } from "./activity-seeds"

/** Wire-shaped: 0x and 64 hex under the field modulus. */
const field = (byte: string) => `0x${byte.repeat(32)}`

/** Wire-shaped and on the curve, as an address is: `byte` repeated, then `last`. */
const address = (byte: string, last: string) => `0x${byte.repeat(31)}${last}`

/** One record of each content kind the authwits page renders. */
const CONTENTS: readonly AuthwitContent[] = [
	{ kind: "call", caller: address("1a", "00"), contract: address("1b", "00"), method: "transfer_in_public", args: [] },
	{ kind: "encoded_call", caller: address("2a", "00"), to: address("2b", "01"), selector: "0x9a7b5c3d", args: [] },
	{ kind: "intent", consumer: address("0c", "00"), intent: [field("0d"), field("0e")] },
	{ kind: "message_hash", messageHash: field("0f") },
]

const keyOf = (id: number) => `${AUTH_REGISTRY_STORAGE_ROOT}@${id}`

/**
 * Stores an authwit row for each of `kinds`, as the registry keeps one once its send mines, and
 * deletes the other kinds' rows. The call row is still pending, as a public grant is until its send
 * is proven, so the page draws its Pending chip. The key's suffix is the row's id: the registry
 * hides a row whose key names another.
 */
export async function seedAuthwits(page: Page, scope: ActivityScope, kinds: readonly AuthwitContent["kind"][]): Promise<void> {
	const rows: Record<string, string> = {}
	const others: string[] = []
	for (const [i, content] of CONTENTS.entries()) {
		const id = i + 1
		if (!kinds.includes(content.kind)) {
			others.push(keyOf(id))
			continue
		}
		const row = {
			id,
			profileId: scope.profileId,
			chainId: scope.chainId,
			account: scope.account,
			hash: field((0x10 + id).toString(16)),
			content,
			txHash: field((0x20 + id).toString(16)),
			pending: content.kind === "call",
		}
		rows[keyOf(id)] = JSON.stringify(row)
	}
	await page.evaluate(
		async (entries: Record<string, string>, stale: string[]) => {
			await chrome.storage.local.remove(stale)
			await chrome.storage.local.set(entries)
		},
		rows,
		others,
	)
}
