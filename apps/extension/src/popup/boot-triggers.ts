/**
 * What starts the popup's boot-time session check. A run starts at mount and when a port that said
 * Ready drops; never on Ready itself, which says the reads can now be answered, not that the
 * shell's knowledge went stale. So a service that never says Ready still ends in the mount run's
 * verdict, and closes before Ready (a worker still starting refuses ports) start nothing that
 * would supersede it. The route decided without the service is replayed on every Ready and after
 * every run (`start-grace.ts`).
 */
import type { EventHandler } from "@nulo/wallet-core/utils"

export interface BootTriggerDeps {
	client: { onConnected: EventHandler<void>; onDisconnected: EventHandler<void> }
	routerReady: () => Promise<unknown>
	/** Applies the stored settings; handles its own failures. */
	readSettings: () => Promise<void>
	runBoot: (opts: { reconnect: boolean }) => Promise<void>
	replay: () => void
}

export function createBootTriggers(deps: BootTriggerDeps): {
	mount: () => Promise<void>
	/** The banner's RETRY: a fresh run, followed by a replay like any other. */
	retry: () => Promise<void>
	dispose: () => void
} {
	const run = async (reconnect: boolean) => {
		try {
			await deps.runBoot({ reconnect })
		} finally {
			deps.replay()
		}
	}
	const onDropped = () => void run(true)
	const onReady = () => deps.replay()
	deps.client.onDisconnected.add(onDropped)
	deps.client.onConnected.add(onReady)
	return {
		async mount() {
			// A first navigation that fails must not cost the popup its session check.
			await deps.routerReady().catch(() => {})
			// Side by side: the settings wait for Ready too, and the check must not wait behind them.
			void deps.readSettings()
			await run(false)
		},
		retry: () => run(false),
		dispose() {
			deps.client.onDisconnected.remove(onDropped)
			deps.client.onConnected.remove(onReady)
		},
	}
}
