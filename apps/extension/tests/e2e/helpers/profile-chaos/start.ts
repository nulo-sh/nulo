import { mkdirSync } from "node:fs"
import { LOCAL_NETWORK_RPC_URL } from "@/wallet/services/network/seeds"
import type { Page } from "puppeteer"
import type { ExtensionContext } from "../../fixtures/extension"
import { holdNodeStub } from "../../fixtures/node-stub"
import { type PasskeyAuthSetup, setupPasskeyVirtualAuth } from "../../fixtures/passkey"
import { callService } from "../../fixtures/session"
import { loadPopup, openPopup, waitForServiceReady } from "../../fixtures/wallet-pages"
import { ErrorCollector } from "./collect"
import type { Caps } from "./model"
import { type NetworkRun, newRunState, type RunState } from "./state"

/** A run's state on a fresh launch: the anchor open on the popup with a PRF-capable authenticator
 *  added on it, and the error collector watching every extension page from now on. `held` is a
 *  page and authenticator the release left, whose credential the run keeps using: the popup loads
 *  into that page, watched before it navigates. Without a node, the Local Network seed gets the
 *  launch's stand-in too, so its calls are refused like every other node's and never reach whatever
 *  another run serves on that loopback port. `stop()` resolves to the requests that stand-in failed
 *  to hold. */
export async function startRun(
	ctx: ExtensionContext,
	caps: Caps,
	dir: string,
	network?: NetworkRun,
	held?: { page: Page; auth: PasskeyAuthSetup },
): Promise<RunState & { stop(): Promise<string[]> }> {
	mkdirSync(dir, { recursive: true })
	const local = caps.network ? undefined : await holdNodeStub(ctx.browser, ctx.extensionId, LOCAL_NETWORK_RPC_URL)
	const errors = new ErrorCollector(ctx.browser)
	await errors.start()
	const anchor = held ? held.page : await openPopup(ctx)
	errors.watch(anchor, "anchor")
	if (held) {
		await loadPopup(ctx, anchor)
		await waitForServiceReady(anchor)
	}
	// Debug mode keeps every level in the log ring, so the leak scan reads the lines a default
	// wallet drops at the source.
	await callService(anchor, "config", "setValue", ["debugMode", true])
	const auth = held ? held.auth : await setupPasskeyVirtualAuth(ctx.browser, anchor)
	const state = newRunState({ ctx, caps, anchor, auth, errors, dir, network })
	return Object.assign(state, {
		async stop() {
			errors.stop()
			await state.auth?.cleanup().catch(() => {})
			const missed = (await local?.failures()) ?? []
			await local?.stop()
			return missed
		},
	})
}
