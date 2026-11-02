import type { IEventHandler } from "@nulo/wallet-core/utils"
import { createRunFence } from "./runFence"

/**
 * A page's read that survives a worker restart. A dropped port rejects the read in flight and
 * replays no event sent while it was down, so every open of the port after the first reads again,
 * and so does the first when the newest read failed before it: a port that drops between Ready and
 * its announcement never fires `onConnected`.
 *
 * `run` receives its run's `isCurrent`, which a later `read()` or `dispose()` turns false, and
 * resolves `false` to mark the read failed; a throw passes out of `read()` and marks nothing. Create
 * it before anything requests on the client, and start the mount's read in the mount step that opens
 * the port: the first `onConnected` then belongs to the mount. The parent owns the connection and
 * calls `dispose()` after the client's `disconnect()`.
 */
export function createReconnectRead(
	client: { readonly onConnected: IEventHandler<void> },
	run: (isCurrent: () => boolean) => Promise<boolean>,
): { read: () => Promise<void>; dispose: () => void } {
	const fence = createRunFence()
	let connections = 0
	let newestReadFailed = false

	const onConnected = () => {
		connections++
		if (connections > 1 || newestReadFailed) void read()
	}

	async function read(): Promise<void> {
		const isCurrent = fence.begin()
		newestReadFailed = false
		const succeeded = await run(isCurrent)
		if (!succeeded && isCurrent()) newestReadFailed = true
	}

	client.onConnected.add(onConnected)

	return {
		read,
		dispose() {
			fence.invalidate()
			client.onConnected.remove(onConnected)
		},
	}
}
