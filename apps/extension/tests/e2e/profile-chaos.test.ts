/**
 * Seeded profile chaos: each seed plans 24 profile actions and a `verifyAll` from the model in
 * `helpers/profile-chaos/model.ts`, drives them through the popup, and checks every oracle after
 * every step. A red seed stops at its first violation not filed yet and names the step, the action
 * and the property; one that met only filed findings runs on and names their issues. A seed with no
 * violation still fails on a step it never ran or any evidence it could not read but a planned
 * restart's log window. Its replay record, under `.e2e-state/profile-chaos/`, replays it.
 *
 * Runs only with `NULO_E2E_CHAOS=1`. `NULO_E2E_CHAOS_SEED` is the first seed (random when unset,
 * and always logged), `NULO_E2E_CHAOS_RUNS` how many consecutive seeds run, one launch each, and
 * `NULO_E2E_CHAOS_ACTIONS` replays a hand-trimmed list instead: a JSON array of `{ action, params }`
 * or a path to one, such as a record's `plan`. The network file, `network/profile-chaos.test.ts`,
 * adds the dApp and held-restore actions.
 */
import { BROWSER, credentialOutlivesPage, residentCredentialSlots, stopsBackgroundUnderOpenPage } from "./fixtures/browser"
import type { Caps } from "./helpers/profile-chaos/model"
import { describeProfileChaos } from "./helpers/profile-chaos/spec"

const CAPS: Caps = {
	ceremonyOffAnchor: credentialOutlivesPage,
	restartUnderOpenPage: stopsBackgroundUnderOpenPage,
	network: false,
	restoreGate: false,
	credentialSlots: residentCredentialSlots,
}

describeProfileChaos("profile chaos", { armed: process.env.NULO_E2E_CHAOS === "1", browser: BROWSER, caps: CAPS })
