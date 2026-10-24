// @vitest-environment node
// Node, not jsdom: the compatibility pin encrypts with WebCrypto, as the page's SDK does.
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { jsonStringify } from "@aztec-labs/foundation/json-rpc"
import { loadContractArtifact } from "@aztec-labs/stdlib/abi"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { encrypt } from "@aztec-labs/wallet-sdk/crypto"
import { ExtensionProvider } from "@aztec-labs/wallet-sdk/extension/provider"
import { wireInstance } from "@nulo/wallet-bridge/testing"
import { resolvePackageRoot } from "@nulo/resolve-asset"
import { describe, expect, it, vi } from "vitest"
import { MAX_SECURE_MESSAGE_CIPHERTEXT_CHARS, isSubframeSender, validateContentScriptMessage } from "./content-script-validator"

describe("isSubframeSender (defense-in-depth)", () => {
	it("returns false for top-frame messages (frameId === 0)", () => {
		expect(isSubframeSender({ tab: { id: 1, url: "https://app.example.com" }, frameId: 0 })).toBe(false)
	})

	it("returns true for subframe messages (frameId > 0)", () => {
		// This is the subframe attack signature: iframe at evil.com inside
		// app.example.com sends a content-script message; sender.frameId
		// is non-zero, sender.tab.url is the TOP-frame URL.
		expect(isSubframeSender({ tab: { id: 1, url: "https://app.example.com" }, frameId: 1 })).toBe(true)
		expect(isSubframeSender({ tab: { id: 1, url: "https://app.example.com" }, frameId: 99 })).toBe(true)
	})

	it("returns false for non-tab senders (extension internals)", () => {
		// ServiceClient / offscreen messages have no `tab` field.
		expect(isSubframeSender({ frameId: 0 })).toBe(false)
		expect(isSubframeSender({})).toBe(false)
	})

	it("returns false when frameId is undefined (defensive — fail open for ambiguous cases)", () => {
		// Some chrome runtime calls deliver MessageSender without frameId. We
		// don't want to reject those; the upstream handler still gets to
		// decide.
		expect(isSubframeSender({ tab: { id: 1, url: "https://app.example.com" } })).toBe(false)
	})
})

describe("validateContentScriptMessage", () => {
	it("passes through non-object inputs", () => {
		expect(validateContentScriptMessage(undefined).kind).toBe("passthrough")
		expect(validateContentScriptMessage(null).kind).toBe("passthrough")
		expect(validateContentScriptMessage("string").kind).toBe("passthrough")
		expect(validateContentScriptMessage(42).kind).toBe("passthrough")
	})

	it("passes through messages without a content-script origin", () => {
		expect(validateContentScriptMessage({}).kind).toBe("passthrough")
		expect(validateContentScriptMessage({ origin: "background", type: "X" }).kind).toBe("passthrough")
		// ServiceClient response shape uses `from`/`to`/`type` (no `origin`).
		expect(validateContentScriptMessage({ from: "svc", to: "uid", type: "Response", content: {} }).kind).toBe("passthrough")
		// Offscreen ping shape — no origin.
		expect(validateContentScriptMessage({ pong: true }).kind).toBe("passthrough")
	})

	it("validates a well-formed discovery-request envelope", () => {
		const result = validateContentScriptMessage({
			origin: "content-script",
			type: "discovery-request",
			content: { type: "aztec-wallet-discovery", requestId: "abc", appId: "test", chainInfo: { chainId: "1", version: "1" } },
		})
		expect(result.kind).toBe("valid")
		if (result.kind === "valid") {
			expect(result.message.type).toBe("discovery-request")
		}
	})

	it("validates a well-formed key-exchange-request with sessionId", () => {
		const result = validateContentScriptMessage({
			origin: "content-script",
			type: "key-exchange-request",
			sessionId: "sess-123",
			content: { type: "key-exchange-request", requestId: "abc", publicKey: {} },
		})
		expect(result.kind).toBe("valid")
		if (result.kind === "valid") {
			expect(result.message.sessionId).toBe("sess-123")
		}
	})

	it("validates a secure-message envelope (encrypted payload as opaque content)", () => {
		const result = validateContentScriptMessage({
			origin: "content-script",
			type: "secure-message",
			sessionId: "sess-1",
			content: { iv: "...", ciphertext: "..." },
		})
		expect(result.kind).toBe("valid")
	})

	it("validates a disconnect-request envelope", () => {
		const result = validateContentScriptMessage({
			origin: "content-script",
			type: "disconnect-request",
			sessionId: "sess-1",
		})
		expect(result.kind).toBe("valid")
	})

	it("validates a ping envelope (the dApp's in-flight liveness probe)", () => {
		// Regression pin: "ping" was missing from the enum, so every heartbeat
		// died at this boundary and the dApp degraded to its legacy-peer path.
		const result = validateContentScriptMessage({
			origin: "content-script",
			type: "ping",
			sessionId: "sess-1",
		})
		expect(result.kind).toBe("valid")
	})

	it("rejects content-script envelope with unknown type", () => {
		const result = validateContentScriptMessage({
			origin: "content-script",
			type: "evil-payload-type",
			content: {},
		})
		expect(result.kind).toBe("invalid")
		if (result.kind === "invalid") {
			expect(result.reason).toMatch(/schema check/)
		}
	})

	it("rejects content-script envelope missing required `type` field", () => {
		const result = validateContentScriptMessage({
			origin: "content-script",
			content: {},
		})
		expect(result.kind).toBe("invalid")
	})

	it("rejects content-script envelope with non-string sessionId", () => {
		const result = validateContentScriptMessage({
			origin: "content-script",
			type: "secure-message",
			sessionId: 12345, // attacker tries to inject a non-string
			content: { iv: "", ciphertext: "" },
		})
		expect(result.kind).toBe("invalid")
	})

	it("rejects an envelope with a background-to-content-script type from a content-script origin", () => {
		// Adversarial: an attacker page (or compromised content script)
		// tries to send a "discovery-approved" message to confuse the SW
		// into approving its own discovery. Schema rejects since
		// "discovery-approved" is NOT in the content-script→background
		// type set.
		const result = validateContentScriptMessage({
			origin: "content-script",
			type: "discovery-approved",
			sessionId: "fake",
			content: {},
		})
		expect(result.kind).toBe("invalid")
	})
})

describe("validateContentScriptMessage — a discovery request's content", () => {
	const envelope = (content: unknown, sessionId?: unknown) => ({
		origin: "content-script",
		type: "discovery-request",
		sessionId,
		content,
	})
	const wire = { type: "aztec-wallet-discovery", requestId: "r", appId: "a", chainInfo: { chainId: "1", version: "1" } }
	const withChain = (chainInfo: object) => ({ ...wire, chainInfo: { ...wire.chainInfo, ...chainInfo } })

	async function postedDiscovery(): Promise<unknown> {
		const posted: string[] = []
		vi.stubGlobal("window", { postMessage: (m: string) => posted.push(m), addEventListener: () => {}, removeEventListener: () => {} })
		try {
			await ExtensionProvider.discoverWallets({ chainId: new Fr(31337n), version: new Fr(1n) }, { appId: "test-dapp", timeout: 1 })
		} finally {
			vi.unstubAllGlobals()
		}
		return JSON.parse(posted[0] ?? "null")
	}

	it("admits the message ExtensionProvider.discoverWallets posts, its chain fields 66 characters long", async () => {
		const content = (await postedDiscovery()) as { chainInfo: { chainId: string } }
		expect(content.chainInfo.chainId).toHaveLength(66)
		expect(validateContentScriptMessage(envelope(content)).kind).toBe("valid")
	})

	it("admits every field at its bound (control)", () => {
		const atBounds = {
			...wire,
			requestId: "r".repeat(128),
			appId: "a".repeat(256),
			chainInfo: { chainId: "1".repeat(80), version: "1".repeat(80) },
		}
		expect(validateContentScriptMessage(envelope(atBounds, "s".repeat(128))).kind).toBe("valid")
	})

	it("admits every field at its bound in astral characters, counted in UTF-16 units (control)", () => {
		const atBounds = {
			...wire,
			requestId: "😀".repeat(64),
			appId: "😀".repeat(128),
			chainInfo: { chainId: "😀".repeat(40), version: "😀".repeat(40) },
		}
		expect(validateContentScriptMessage(envelope(atBounds, "😀".repeat(64))).kind).toBe("valid")
	})

	it.each<[string, unknown]>([
		["a content key the SDK does not send", { ...wire, appName: "x" }],
		["a chainInfo key the SDK does not send", withChain({ extra: "1" })],
		["an own __proto__ key in content", JSON.parse(`{"__proto__":"x",${JSON.stringify(wire).slice(1)}`)],
		["an own __proto__ key in chainInfo", { ...wire, chainInfo: JSON.parse('{"chainId":"1","version":"1","__proto__":"x"}') }],
		["a requestId over 128 characters", { ...wire, requestId: "r".repeat(129) }],
		["an appId over 256 characters", { ...wire, appId: "a".repeat(257) }],
		["a chainId over 80 characters", withChain({ chainId: "1".repeat(81) })],
		["a version over 80 characters", withChain({ version: "1".repeat(81) })],
		["a requestId of 65 astral characters, 130 UTF-16 units", { ...wire, requestId: "😀".repeat(65) }],
		["an appId of 129 astral characters, 258 UTF-16 units", { ...wire, appId: "😀".repeat(129) }],
		["a chainId of 41 astral characters, 82 UTF-16 units", withChain({ chainId: "😀".repeat(41) })],
		["a version of 41 astral characters, 82 UTF-16 units", withChain({ version: "😀".repeat(41) })],
		["another content type", { ...wire, type: "aztec-wallet-discovery-response" }],
		["no content", undefined],
	])("refuses %s", (_label, content) => {
		expect(validateContentScriptMessage(envelope(content)).kind).toBe("invalid")
	})

	it("refuses a session id over 128 characters on any envelope", () => {
		expect(validateContentScriptMessage(envelope(wire, "s".repeat(129))).kind).toBe("invalid")
		expect(validateContentScriptMessage({ origin: "content-script", type: "ping", sessionId: "s".repeat(129) }).kind).toBe("invalid")
	})

	it("refuses a session id of 65 astral characters, 130 UTF-16 units", () => {
		expect(validateContentScriptMessage({ origin: "content-script", type: "ping", sessionId: "😀".repeat(64) }).kind).toBe("valid")
		expect(validateContentScriptMessage({ origin: "content-script", type: "ping", sessionId: "😀".repeat(65) }).kind).toBe("invalid")
	})
})

describe("validateContentScriptMessage — a secure message's content", () => {
	const secure = (content: unknown) => ({ origin: "content-script", type: "secure-message", sessionId: "sess-1", content })
	const IV = "A".repeat(16)

	it("admits a ciphertext at the budget and refuses one a character over it", () => {
		const atBudget = "A".repeat(MAX_SECURE_MESSAGE_CIPHERTEXT_CHARS)
		expect(validateContentScriptMessage(secure({ iv: IV, ciphertext: atBudget })).kind).toBe("valid")
		expect(validateContentScriptMessage(secure({ iv: IV, ciphertext: `${atBudget}A` })).kind).toBe("invalid")
	})

	it("counts the iv and ciphertext budgets in UTF-16 units, so astral characters pass at half the count", () => {
		const atBudget = "😀".repeat(MAX_SECURE_MESSAGE_CIPHERTEXT_CHARS / 2)
		expect(validateContentScriptMessage(secure({ iv: "😀".repeat(16), ciphertext: atBudget })).kind).toBe("valid")
		expect(validateContentScriptMessage(secure({ iv: IV, ciphertext: `${atBudget}😀` })).kind).toBe("invalid")
		expect(validateContentScriptMessage(secure({ iv: "😀".repeat(17), ciphertext: "" })).kind).toBe("invalid")
	})

	it.each<[string, unknown]>([
		["an iv over 32 characters", { iv: "A".repeat(33), ciphertext: "" }],
		["a ciphertext that is not a string", { iv: IV, ciphertext: ["A"] }],
		["no content", undefined],
		["content that is not an object", "A"],
		["a key beside iv and ciphertext", { iv: IV, ciphertext: "", padding: "A" }],
		["an own __proto__ key beside iv and ciphertext", JSON.parse(`{"iv":"${IV}","ciphertext":"","__proto__":"A"}`)],
	])("refuses %s", (_label, content) => {
		expect(validateContentScriptMessage(secure(content)).kind).toBe("invalid")
	})
})

describe("MAX_SECURE_MESSAGE_CIPHERTEXT_CHARS — every bundled artifact's registration fits", () => {
	/** Every artifact JSON the wallet bundles; a bump can change which is largest, so all are read. */
	const artifactFiles = [
		["@aztec-labs/noir-contracts.js", "artifacts"],
		["@aztec-foundation/aztec-standards", "target"],
	].flatMap(([pkg, dir]) => {
		const root = join(resolvePackageRoot(pkg, { from: import.meta.url }), dir)
		return readdirSync(root)
			.filter((name) => name.endsWith(".json"))
			.map((name) => join(root, name))
	})

	it("each call validates and the largest is at most half the budget", async () => {
		const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt"])
		let largest = 0
		for (const file of artifactFiles) {
			const artifact = loadContractArtifact(JSON.parse(readFileSync(file, "utf8")))
			// As the SDK's `ExtensionWallet` wraps and encrypts a `registerContract` call.
			const call = {
				type: "registerContract",
				args: [wireInstance(`0x${"0b".repeat(32)}`), artifact],
				messageId: crypto.randomUUID(),
				chainInfo: { chainId: "1", version: "1" },
				appId: "test-dapp",
				walletId: "nulo",
			}
			const content = await encrypt(key, jsonStringify(call))
			expect(validateContentScriptMessage({ origin: "content-script", type: "secure-message", sessionId: "s", content }).kind).toBe(
				"valid",
			)
			largest = Math.max(largest, content.ciphertext.length)
		}
		expect(artifactFiles.length).toBeGreaterThanOrEqual(40)
		expect(2 * largest).toBeLessThanOrEqual(MAX_SECURE_MESSAGE_CIPHERTEXT_CHARS)
		// A fixed scan over about 100 MB of artifacts takes 3 to 6 s, past the 5 s default.
	}, 60_000)
})
