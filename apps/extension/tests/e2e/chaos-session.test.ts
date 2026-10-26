/**
 * An agent chaos session over one isolated, instrumented wallet: the launcher
 * (`scripts/e2e/chaos-session.ts start`) arms this file with `NULO_E2E_CHAOS=1` and
 * `NULO_E2E_CHAOS_SESSION=<dir>`, and the session serves `<dir>/q/<n>.cmd.json` in order until
 * `end`, its deadline, or a command past its own. Its findings go to `<dir>/findings.jsonl`, never
 * into this test's verdict: the test fails only when the harness does (a launch that cannot start,
 * a teardown whose guards fail). `tests/e2e/README.md` § Chaos runs has the contract.
 */
import { describe } from "vitest"
import { credentialOutlivesPage, residentCredentialSlots, stopsBackgroundUnderOpenPage } from "./fixtures/browser"
import { test } from "./fixtures/extension"
import { serveSession, sessionTimeoutMs } from "./helpers/chaos-session/serve"
import type { Caps } from "./helpers/profile-chaos/model"

const DIR = process.env.NULO_E2E_CHAOS_SESSION
const ARMED = process.env.NULO_E2E_CHAOS === "1" && !!DIR

const CAPS: Caps = {
	ceremonyOffAnchor: credentialOutlivesPage,
	restartUnderOpenPage: stopsBackgroundUnderOpenPage,
	network: false,
	restoreGate: false,
	credentialSlots: residentCredentialSlots,
}

describe.skipIf(!ARMED)("chaos session", () => {
	test("serves its command queue until the session ends", { retry: 0, timeout: ARMED ? sessionTimeoutMs(DIR as string) : 1_000 }, async ({
		freshExtensionPerTest,
	}) => {
		await serveSession(freshExtensionPerTest, DIR as string, CAPS)
	})
})
