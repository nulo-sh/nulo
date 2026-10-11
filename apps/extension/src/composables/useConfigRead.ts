import type { ConfigProp, ConfigServiceClient } from "@/wallet/services/config/client"
import { createRunFence } from "./runFence"

/**
 * A page's config read that survives a worker restart. A dropped port rejects the read in flight
 * and replays no update sent while it was down, so every open of the port after the first reads
 * again. Only the newest read reaches `land`, which learns the keys an update set since that read
 * started, so it can keep their newer values.
 *
 * Call it before anything requests on `config`, and start the mount's read in the mount step that
 * opens the port: the first `onConnected` then belongs to the mount, and every later one is a
 * reconnect. The parent owns the connection and calls `dispose()` after `config.disconnect()`.
 */
export function useConfigRead<T>(
	config: Pick<ConfigServiceClient, "onConnected" | "onUpdate">,
	fetch: () => Promise<T>,
	land: (value: T, updatedSince: (key: string) => boolean) => void,
): { read: () => Promise<void>; dispose: () => void } {
	const fence = createRunFence()
	let updatedDuringRead = new Set<string>()
	let connections = 0

	const onUpdate = ({ key }: ConfigProp) => {
		updatedDuringRead.add(key)
	}
	const onConnected = () => {
		connections++
		if (connections > 1) void read()
	}

	async function read(): Promise<void> {
		const isCurrent = fence.begin()
		const updated = new Set<string>()
		updatedDuringRead = updated
		let value: T
		try {
			value = await fetch()
		} catch {
			return
		}
		if (isCurrent()) land(value, (key) => updated.has(key))
	}

	config.onUpdate.add(onUpdate)
	config.onConnected.add(onConnected)

	return {
		read,
		dispose() {
			fence.invalidate()
			config.onUpdate.remove(onUpdate)
			config.onConnected.remove(onConnected)
		},
	}
}
