/**
 * Helpers for reading the dApp session records the wallet stores. Rows are sealed at rest, so the
 * reads go through the dapp-session service's own `getDappSessions` RPC from a popup page: the
 * active profile's rows, MAC-verified, exactly as the wallet reads them, in every build.
 *
 * Used by tests that check the stored grant beside the dApp's answer.
 */
import { callService } from "./session"
import type { ExtensionContext } from "./extension"
import { openPopup } from "./extension"

export const SESSION_KEY_PREFIX = "nulo:core:dappSessions@"

type StoredSession = {
	chainId: string | number
	dappMetadata?: { url?: string }
	capabilityGrants?: Array<{ capability?: { type?: string } }>
}

/** The active profile's session rows, through a popup opened for the read. */
async function activeSessions(ctx: ExtensionContext): Promise<StoredSession[]> {
	const page = await openPopup(ctx)
	try {
		return await callService<StoredSession[]>(page, "dapp-session", "getDappSessions")
	} finally {
		await page.close()
	}
}

/** The chain id of every session row stored for exactly `origin`, as persisted: one entry per row. */
export async function sessionChainsForOrigin(ctx: ExtensionContext, origin: string): Promise<string[]> {
	return (await activeSessions(ctx))
		.filter((session) => session.dappMetadata?.url === origin)
		.map((session) => String(session.chainId))
		.sort()
}

/**
 * The capability of `type` that the one session stored for `origin` holds, as persisted, or
 * undefined when it holds none. Throws unless exactly one session matches.
 */
export async function readStoredCapability(
	ctx: ExtensionContext,
	origin: string,
	type: string,
): Promise<Record<string, unknown> | undefined> {
	const sessions = (await activeSessions(ctx)).filter((session) => String(session.dappMetadata?.url ?? "").startsWith(origin))
	if (sessions.length !== 1) throw new Error(`expected one dApp session for ${origin}, found ${sessions.length}`)
	return sessions[0]?.capabilityGrants?.find((grant) => grant.capability?.type === type)?.capability as
		| Record<string, unknown>
		| undefined
}
