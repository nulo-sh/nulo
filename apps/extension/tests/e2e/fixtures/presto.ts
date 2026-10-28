import type { Page } from "puppeteer"
import { PRESTO_HOST, PRESTO_HTTPS_PORT, PRESTO_PORT } from "@/presto/config"
import packageJson from "../../../package.json"
import { type AnsweredRequests, type RequestAnswer, answerRequests } from "./browser"

/** The release `__BB_VERSION__` bakes in; Presto reports "available" only when it serves this one. */
const BB_VERSION = packageJson.dependencies["@aztec-foundation/bb.js"]

// The wallet probes Presto HTTPS-first; after an HTTPS failure the SDK runs one witness-free HTTP
// diagnostic. Both are intercepted below the TLS handshake, so no certificate is needed.
export const PRESTO_HTTPS_HEALTH_URL = `https://${PRESTO_HOST}:${PRESTO_HTTPS_PORT}/health`
export const PRESTO_HTTP_HEALTH_URL = `http://${PRESTO_HOST}:${PRESTO_PORT}/health`

/** What Presto serves an origin it has approved: versions, the prover flag and the HTTPS port. */
export const PRESTO_DETAILED_HEALTH = {
	status: "ok",
	api_version: 1,
	version: "1.1.1",
	aztec_version: BB_VERSION,
	available_versions: [BB_VERSION],
	bb_available: true,
	https_port: PRESTO_HTTPS_PORT,
}
/** What Presto serves an origin it has not approved yet. */
export const PRESTO_MINIMAL_HEALTH = { status: "ok", api_version: 1 }

/** Answer the page's two health probes per scheme; every other request goes out. */
export const interceptHealth = (page: Page, answers: { https: RequestAnswer; http: RequestAnswer }): Promise<AnsweredRequests> =>
	answerRequests(
		page,
		new Map([
			[PRESTO_HTTPS_HEALTH_URL, answers.https],
			[PRESTO_HTTP_HEALTH_URL, answers.http],
		]),
	)
