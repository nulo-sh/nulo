/**
 * The five public surfaces are separate deployables, each writing its own security headers. Every
 * surface without a recorded exception must agree on the shared ones, and every exception names
 * the exact value it keeps, so a change meant for all five fails here until each carries it, and an
 * intended difference is told apart from a forgotten one. CSP, CORS and caching stay per surface.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { siteHeaders } from "../../apps/landing/scripts/headers"
import { OWN_HEADERS } from "../../apps/landing/src/worker"
import { POLICY } from "../../infra/passkey-rp/src/worker"
import { SECURITY_HEADERS } from "../../infra/subscribe/src/respond"

const ROOT = join(import.meta.dir, "..", "..")

const SHARED = ["strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy"] as const
type Shared = (typeof SHARED)[number]
type Surface = "landing" | "landing-worker" | "subscribe" | "passkey-rp" | "token-list"
type HeaderMap = Readonly<Record<string, string>>
/** The value a surface keeps instead of the others' (`null`: it sets none), and what is known of why. */
type Exception = { value: string | null; note: string }
type Exceptions = Partial<Record<Surface, Partial<Record<Shared, Exception>>>>

const NO_RECORDED_REASON = "kept as found; no document records a reason"
const EMPTY_API_ERRORS = "its own responses are empty-bodied /api/* errors; the origin's pages set it (src/worker.ts)"

const EXCEPTIONS: Exceptions = {
	landing: { "referrer-policy": { value: "strict-origin-when-cross-origin", note: NO_RECORDED_REASON } },
	"landing-worker": {
		"strict-transport-security": { value: null, note: EMPTY_API_ERRORS },
		"x-frame-options": { value: null, note: EMPTY_API_ERRORS },
		"permissions-policy": { value: null, note: EMPTY_API_ERRORS },
	},
	"passkey-rp": {
		"strict-transport-security": { value: "max-age=31536000; includeSubDomains", note: NO_RECORDED_REASON },
		"permissions-policy": {
			value: "publickey-credentials-create=(), publickey-credentials-get=()",
			note: "denies WebAuthn to the page itself (infra/passkey-rp/README.md)",
		},
	},
	"token-list": {
		"strict-transport-security": { value: "max-age=31536000; includeSubDomains", note: NO_RECORDED_REASON },
		"x-frame-options": { value: null, note: `${NO_RECORDED_REASON}; the host serves JSON only` },
		"permissions-policy": { value: null, note: `${NO_RECORDED_REASON}; the host serves JSON only` },
	},
}

const lowerCased = (headers: HeaderMap): HeaderMap =>
	Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]))

const headersFile = (path: string): HeaderMap => lowerCased(siteHeaders(readFileSync(join(ROOT, path), "utf8")))

const SURFACES: Readonly<Record<Surface, HeaderMap>> = {
	landing: headersFile("apps/landing/public/_headers"),
	"landing-worker": lowerCased(OWN_HEADERS),
	subscribe: lowerCased(SECURITY_HEADERS),
	"passkey-rp": lowerCased(POLICY),
	"token-list": headersFile("infra/token-list/public/_headers"),
}

/** One line per surface and shared header that breaks the rule; empty when every surface holds it. */
function disagreements(surfaces: Readonly<Record<Surface, HeaderMap>>, exceptions: Exceptions): string[] {
	const found: string[] = []
	const names = Object.keys(surfaces) as Surface[]
	for (const header of SHARED) {
		const headerOf = (surface: Surface) => surfaces[surface][header] ?? null
		const agreeing = names.filter((surface) => exceptions[surface]?.[header] === undefined)
		const values = new Set(agreeing.map(headerOf))
		if (values.size > 1) found.push(`${header}: ${agreeing.map((s) => `${s}=${headerOf(s)}`).join(", ")}`)
		const [agreed] = values
		for (const surface of names) {
			const exception = exceptions[surface]?.[header]
			if (exception === undefined) continue
			if (headerOf(surface) !== exception.value) {
				found.push(`${header}: ${surface}=${headerOf(surface)}, its exception records ${exception.value}`)
			} else if (values.size === 1 && exception.value === agreed) {
				found.push(`${header}: ${surface} now agrees, so its exception is stale`)
			}
		}
	}
	return found
}

const withHeader = (surface: Surface, header: Shared, value: string | null) => {
	const { [header]: _dropped, ...rest } = SURFACES[surface]
	return { ...SURFACES, [surface]: value === null ? rest : { ...rest, [header]: value } }
}

describe("the edge surfaces' shared security headers", () => {
	test("agree on every surface, apart from the recorded exceptions", () => {
		expect(disagreements(SURFACES, EXCEPTIONS)).toEqual([])
	})

	test.each([
		[
			"a surface without an exception that drops a header",
			withHeader("subscribe", "x-content-type-options", null),
			"x-content-type-options: landing=nosniff, landing-worker=nosniff, subscribe=null, passkey-rp=nosniff, token-list=nosniff",
		],
		[
			"an excepted surface that drifts to another value",
			withHeader("passkey-rp", "strict-transport-security", "max-age=0"),
			"strict-transport-security: passkey-rp=max-age=0, its exception records max-age=31536000; includeSubDomains",
		],
		[
			"an excepted surface that takes the others' value",
			withHeader("landing", "referrer-policy", "no-referrer"),
			"referrer-policy: landing=no-referrer, its exception records strict-origin-when-cross-origin",
		],
	])("reports %s", (_, surfaces, line) => {
		expect(disagreements(surfaces, EXCEPTIONS)).toEqual([line])
	})

	test("reports an exception the surface's value has caught up with as stale", () => {
		const landing = EXCEPTIONS.landing ?? {}
		const caughtUp = { ...EXCEPTIONS, landing: { ...landing, "referrer-policy": { value: "no-referrer", note: "" } } }
		expect(disagreements(withHeader("landing", "referrer-policy", "no-referrer"), caughtUp)).toEqual([
			"referrer-policy: landing now agrees, so its exception is stale",
		])
	})
})
