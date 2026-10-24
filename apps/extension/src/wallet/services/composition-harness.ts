import { EventHandler } from "@nulo/wallet-core/utils"
import { PROFILE_SERVICE_NAME } from "@/wallet/services/profile/spec"
import { TOKEN_LIST_SERVICE_NAME, type TokenListSnapshot } from "@/wallet/services/token-list/spec"
import { rowKeysForEveryProfile } from "@/wallet/storage/sealed-entity-storage.testing"

/**
 * Shared test-only helper for `*.composition.test.ts` harnesses.
 *
 * Builds a minimal `ServiceCollection`-addable stub for a dependency the
 * service-under-test resolves via `services.get(name)` — `{ name,
 * dependencies: [], start(), ...methods }`. Imported ONLY by test files. Lives
 * under `src/` (typecheck + lint cover it); harmless if it ever leaked to prod
 * (a no-op stub builder), so it carries no bundle marker.
 * See `apps/extension/tests/COMPOSITION-TESTS.md`.
 */
export function svc(name: string, methods: Record<string, unknown>) {
	return { name, dependencies: [], async start() {}, ...methods } as never
}

/** A `ProfileService` stand-in for a service that needs only its profile list and row keys:
 *  these profiles exist, every one is unlocked, and none is active. */
export async function profileKeysStub(...ids: string[]) {
	return svc(PROFILE_SERVICE_NAME, {
		getProfiles: async () => ids.map((id) => ({ id })),
		getActiveProfile: async () => undefined,
		...(await rowKeysForEveryProfile()),
	})
}

/** A `TokenListService` stand-in serving one fixed snapshot (none by default). */
export function tokenListStub(snapshot?: TokenListSnapshot) {
	return svc(TOKEN_LIST_SERVICE_NAME, { getSnapshot: () => snapshot, onListChanged: new EventHandler<TokenListSnapshot>() })
}
