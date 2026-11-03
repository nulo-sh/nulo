/**
 * PXE offscreen-document bootstrap.
 *
 * Chrome-agnostic: this file starts the PXE service inside whatever
 * environment the embedder provides. The extension's offscreen shell
 * (`extension/src/offscreen/index.ts`) passes in its concrete profile
 * client and document logger as structural `IProfileReader` / `ILogger`.
 *
 * The SW↔offscreen READY handshake (`chrome.runtime.sendMessage`) is
 * deliberately NOT done here — it stays in the extension's shell so this
 * package remains free of any `chrome.*` calls.
 */

import type { ILogger } from "@nulo/wallet-core/logger"
import { ServiceCollection } from "@nulo/wallet-core/base"
import type { PxeFactory } from "../pxe/chain-runtime"
import type { ProvePhaseSink } from "../pxe/prove-phase-sink"
import { PxeService, type IProfileReader } from "../pxe/service"

export interface PxeOffscreenDeps {
	profiles: IProfileReader
	logger: ILogger
	/**
	 * The `PxeFactory` the service builds every chain runtime with. Required: the extension shell
	 * owns the node factory (each provider's batch cap) and the proving mode (`@/presto/config`),
	 * so this package stays decoupled from both and no default can build an uncapped node.
	 */
	factory: PxeFactory
	/** The sink whose `emit` the factory's `onProvePhase` was given; the service
	 *  forwards everything it carries to the SW as `onProvePhase` events. */
	provePhaseSink?: ProvePhaseSink
}

/**
 * Start the PXE service in the offscreen environment. Awaits init
 * before returning so the caller can signal ready *after* the service
 * is actually live.
 */
export async function createPxeOffscreen(deps: PxeOffscreenDeps): Promise<void> {
	const services = new ServiceCollection()
	services.add(new PxeService(deps.profiles, deps.logger, deps.factory, deps.provePhaseSink))
	await services.start()
}
