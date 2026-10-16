/**
 * Content-script message envelope validator.
 *
 * Defense-in-depth at the SW seam where `chrome.runtime.onMessage`
 * delivers content-script-originated messages to the upstream
 * `@aztec-labs/wallet-sdk` `BackgroundConnectionHandler`. The upstream
 * handler does its own type-switching, but adding a zod boundary
 * here drops adversarial / malformed envelopes early with a
 * structured debug log.
 *
 * Filter contract:
 *   - Messages with `origin: "content-script"` must match the
 *     `ContentScriptMessageSchema` shape (well-formed envelope,
 *     `type` is one of the upstream `InternalMessageType` values
 *     that content scripts are expected to send).
 *   - Messages with any other origin (e.g. ServiceClient responses,
 *     offscreen pings) are passed through untouched — the listener's
 *     receiver does its own filter on `origin === "background"` etc.
 *
 * Apart from the secure-message size bound and the discovery shape, which
 * nothing upstream enforces, NOT a security boundary on its own (the
 * upstream handler also filters), just a noise-reduction + invariant check
 * that catches malformed dispatches before they reach the upstream code.
 *
 * Pure function — no chrome.*, no globals. Tested directly with
 * synthetic payloads.
 */

import { WalletMessageType } from "@aztec-labs/wallet-sdk/types"
import { z } from "zod"

/**
 * Content-script-originated message shapes the SW expects to receive.
 *
 * Mirrors `@aztec-labs/wallet-sdk/extension/handlers.InternalMessageType`'s
 * content-script-to-background subset (DISCOVERY_REQUEST,
 * KEY_EXCHANGE_REQUEST, SECURE_MESSAGE, DISCONNECT_REQUEST, PING). If
 * the upstream enum gains a new content-script→background message
 * type, extend this set.
 *
 * PING is the dApp's unencrypted in-flight liveness probe; the upstream
 * handler answers PONG. Omitting it here silently degraded the dApp to
 * its legacy-peer path (dead-wallet detection waits for the full dead
 * window instead of a heartbeat round-trip).
 *
 * Background-to-content-script types (DISCOVERY_APPROVED,
 * KEY_EXCHANGE_RESPONSE, etc.) are NOT in this set — they appear with
 * `origin: "background"` and are filtered out by the origin check
 * before reaching the type validator.
 */
const CONTENT_SCRIPT_MESSAGE_TYPES = ["discovery-request", "key-exchange-request", "secure-message", "disconnect-request", "ping"] as const

/**
 * The longest secure-message ciphertext admitted, in base64 characters (one byte each), per
 * message, a batch included. A connected page's call is decrypted, queued and possibly held
 * whole, and its id is inside the ciphertext, so an oversized one is dropped unanswered here.
 * Twice the largest call the bundled artifacts produce (a `registerContract` carrying the
 * artifact), which a test re-measures.
 */
export const MAX_SECURE_MESSAGE_CIPHERTEXT_CHARS = 16 * 1024 * 1024

/** Twice AES-GCM's 12-byte IV, which is 16 base64 characters. */
const MAX_SECURE_MESSAGE_IV_CHARS = 32

const SECURE_MESSAGE_CONTENT_KEYS: ReadonlySet<string> = new Set(["iv", "ciphertext"])
const DISCOVERY_CONTENT_KEYS: ReadonlySet<string> = new Set(["type", "requestId", "appId", "chainInfo"])
const CHAIN_INFO_KEYS: ReadonlySet<string> = new Set(["chainId", "version"])

/** Keys are read from the raw value: zod's object parse skips an own `__proto__` key, even under
 *  `strictObject`, and a page's `JSON.parse` makes one an own key. */
const onlyOwnKeys =
	(keys: ReadonlySet<string>) =>
	(value: unknown): boolean =>
		typeof value === "object" && value !== null && Object.keys(value).every((key) => keys.has(key))

/** Twice a UUID; the session id is the discovery's request id. */
const MAX_REQUEST_ID_CHARS = 128

const EnvelopeSchema = z.object({
	origin: z.literal("content-script"),
	sessionId: z.string().max(MAX_REQUEST_ID_CHARS).optional(),
})

const ContentScriptMessageSchema = z.discriminatedUnion("type", [
	EnvelopeSchema.extend({
		type: z.literal("secure-message"),
		// Upstream queues the whole `content` for the session's decrypt, so any other key would carry
		// data past the bound.
		content: z.custom<object>(onlyOwnKeys(SECURE_MESSAGE_CONTENT_KEYS)).pipe(
			z.object({
				iv: z.string().max(MAX_SECURE_MESSAGE_IV_CHARS),
				ciphertext: z.string().max(MAX_SECURE_MESSAGE_CIPHERTEXT_CHARS),
			}),
		),
	}),
	EnvelopeSchema.extend({
		type: z.literal("discovery-request"),
		// The page writes `content` whole and upstream keeps its fields on the pending discovery, so it
		// passes only in the SDK's shape: the fields `ExtensionProvider.discoverWallets` posts, each
		// string bounded (a chain field is a 66-character `Fr`).
		content: z.custom<object>(onlyOwnKeys(DISCOVERY_CONTENT_KEYS)).pipe(
			z.object({
				type: z.literal(WalletMessageType.DISCOVERY),
				requestId: z.string().max(MAX_REQUEST_ID_CHARS),
				appId: z.string().max(256),
				chainInfo: z
					.custom<object>(onlyOwnKeys(CHAIN_INFO_KEYS))
					.pipe(z.object({ chainId: z.string().max(80), version: z.string().max(80) })),
			}),
		),
	}),
	EnvelopeSchema.extend({
		type: z.enum(CONTENT_SCRIPT_MESSAGE_TYPES).exclude(["secure-message", "discovery-request"]),
		// Its shape varies by `type` and the upstream handler validates it per type.
		content: z.unknown().optional(),
	}),
])

export type ContentScriptMessageEnvelope = z.infer<typeof ContentScriptMessageSchema>

export type ValidationResult =
	| { kind: "passthrough" } // not a content-script message; let other listeners handle
	| { kind: "valid"; message: ContentScriptMessageEnvelope }
	| { kind: "invalid"; reason: string; details?: unknown }

/**
 * Inspect an arbitrary chrome.runtime message and return one of:
 *   - `passthrough`: the message is NOT a content-script-originated
 *     envelope (it might be a ServiceClient response, offscreen ping,
 *     etc.). The caller should still forward it to other listeners.
 *   - `valid`: the message is a well-formed content-script envelope.
 *   - `invalid`: the message claims to be from content-script but
 *     fails the shape check. The caller should drop it.
 */
/**
 * Classify a `chrome.runtime.MessageSender` as top-frame
 * or subframe.
 *
 * Returns `true` if the sender is a subframe (iframe / sub-document) and the
 * wrapper should reject the message under the default policy. Returns `false`
 * for top-frame messages, non-tab senders (extension internals), and any case
 * where `frameId` is undefined.
 *
 * Background: upstream `BackgroundConnectionHandler` attributes origin via
 * `sender.tab?.url` (the TOP-frame URL), not `sender.url` (the actual frame
 * URL). An iframe at `https://evil.com/x.html` embedded in
 * `https://app.example.com` would be credited to the top-frame's origin —
 * inheriting whatever grants the user gave the parent page. The fix is to
 * refuse forwarding at the Nulo wrapper before the upstream handler sees it.
 */
export function isSubframeSender(sender: { tab?: unknown; frameId?: number }): boolean {
	return sender.tab !== undefined && sender.frameId !== undefined && sender.frameId !== 0
}

export function validateContentScriptMessage(message: unknown): ValidationResult {
	if (typeof message !== "object" || message === null) {
		return { kind: "passthrough" }
	}
	const origin = (message as { origin?: unknown }).origin
	if (origin !== "content-script") {
		return { kind: "passthrough" }
	}
	const parsed = ContentScriptMessageSchema.safeParse(message)
	if (!parsed.success) {
		return {
			kind: "invalid",
			reason: "ContentScriptMessage envelope failed schema check",
			details: parsed.error.issues,
		}
	}
	return { kind: "valid", message: parsed.data }
}
