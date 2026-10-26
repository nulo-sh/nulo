/**
 * Seeded profile chaos against the sandbox and the playground: the smoke file's catalog plus a
 * dApp that asks to connect while the wallet is locked or while a passkey unlock is held, and a
 * restore held at `service-restore` or `account-state` that a lock, a restart or a delete meets.
 * Every profile a step opens for the first time goes on Local Network before its checks. The
 * environment selects seeds as `profile-chaos.test.ts` describes.
 *
 * @requires-proverless — the restore gate exists only in a proverless build, so the agent runner
 * refuses a prover-ON invocation of this file, and the file refuses a build whose bundle lacks the
 * gate's key before any seed runs.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { inject } from "vitest"
import { RESTORE_GATE_KEY } from "@/e2e/chrome-storage-restore-gate"
import type { AztecTestConfig } from "../fixtures/aztec"
import { BROWSER, credentialOutlivesPage, residentCredentialSlots, stopsBackgroundUnderOpenPage } from "../fixtures/browser"
import type { Caps } from "../helpers/profile-chaos/model"
import { NETWORK_RUN } from "../helpers/profile-chaos/network-drivers"
import { describeProfileChaos } from "../helpers/profile-chaos/spec"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const armed = aztecConfig !== undefined && process.env.NULO_E2E_CHAOS === "1"

/** Whether any script of the built extension at `dir` carries `marker`. */
function bundleCarries(dir: string, marker: string): boolean {
	return readdirSync(dir).some((name) => {
		const path = join(dir, name)
		if (statSync(path).isDirectory()) return bundleCarries(path, marker)
		return name.endsWith(".js") && readFileSync(path, "utf8").includes(marker)
	})
}

if (armed && !bundleCarries(inject("extensionPath") as string, RESTORE_GATE_KEY))
	throw new Error(`the extension under test carries no restore gate (${RESTORE_GATE_KEY}): build it proverless`)

const CAPS: Caps = {
	ceremonyOffAnchor: credentialOutlivesPage,
	restartUnderOpenPage: stopsBackgroundUnderOpenPage,
	network: true,
	restoreGate: true,
	credentialSlots: residentCredentialSlots,
}

describeProfileChaos("profile chaos on the sandbox", { armed, browser: BROWSER, caps: CAPS, network: NETWORK_RUN })
