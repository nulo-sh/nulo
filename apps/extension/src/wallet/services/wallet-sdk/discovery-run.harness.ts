/** Test-only. Reads the run of a discovery for a suite that replaces `./discovery-flow` with a
 *  pass-through `handleDiscovery` spy (`vi.mock` is hoisted per file, so each suite declares it). */
import { vi } from "vitest"
import { handleDiscovery } from "./discovery-flow"

/** The latest `handleDiscovery` promise for `requestId`. It covers that discovery's own decision (an
 *  admitted approval, a refusal, its window's path), not what it queued: an admission waiting for a
 *  slot, or a locked-queue entry the unlock's drain hands to `handleDiscovery` again later. */
export function discoveryRun(requestId: string): Promise<void> {
	const { calls, results } = vi.mocked(handleDiscovery).mock
	return results[calls.findLastIndex(([discovery]) => discovery.requestId === requestId)].value as Promise<void>
}
