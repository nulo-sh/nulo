import type { ConfigProp, ConfigServiceClient } from "@/wallet/services/config/client"
import { createReconnectRead } from "./reconnectRead"

/**
 * A page's config read that survives a worker restart, on `createReconnectRead`'s rule: only the
 * newest read reaches `land`, which learns the keys an update set since that read started, so it
 * can keep their newer values. A failed `fetch` lands nothing and marks the read failed.
 *
 * Call it before anything requests on `config`, and start the mount's read in the mount step that
 * opens the port. The parent owns the connection and calls `dispose()` after `config.disconnect()`.
 */
export function useConfigRead<T>(
	config: Pick<ConfigServiceClient, "onConnected" | "onUpdate">,
	fetch: () => Promise<T>,
	land: (value: T, updatedSince: (key: string) => boolean) => void,
): { read: () => Promise<void>; dispose: () => void } {
	let updatedDuringRead = new Set<string>()

	const onUpdate = ({ key }: ConfigProp) => {
		updatedDuringRead.add(key)
	}

	const reader = createReconnectRead(config, async (isCurrent) => {
		const updated = new Set<string>()
		updatedDuringRead = updated
		let value: T
		try {
			value = await fetch()
		} catch {
			return false
		}
		if (isCurrent()) land(value, (key) => updated.has(key))
		return true
	})

	config.onUpdate.add(onUpdate)

	return {
		read: reader.read,
		dispose() {
			reader.dispose()
			config.onUpdate.remove(onUpdate)
		},
	}
}
