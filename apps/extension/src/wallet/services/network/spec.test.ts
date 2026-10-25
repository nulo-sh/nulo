import { describe, expect, test } from "vitest"
import {
	ERR_RPC_URL_HIDDEN_CHARACTERS,
	ERR_RPC_URL_IPV6_LOOPBACK,
	type Network,
	NetworkRowSchema,
	NetworkSchema,
	NodeStatus,
	NodeStatusSchema,
	networkInfoFrom,
	primaryEndpointUrl,
	RpcUrlSchema,
} from "./spec"

// The schema's acceptance set is a security boundary: these rows pin it input by input. The
// adapter's own table (aztec-node-factory-adapter.test.ts) covers the same inputs, so a row whose
// verdict differs between the two files is a deliberate policy difference (Unicode space, which the
// schema trims).
const ACCEPTED = [
	"https://rpc.example.com",
	"HTTPS://RPC.EXAMPLE.COM/Path?Q=1",
	"https://@b.example",
	"http://localhost:8080",
	"HTTP://localhost:8080",
	"http://LOCALHOST:8080",
	"http://127.0.0.1:8080",
	"http://127.1:8080",
	"https://[2001:db8::1]:8443",
	"https://exämple.com",
	" https://rpc.example.com",
	"https://rpc.example.com ",
	" https://rpc.example.com",
	"https://rpc.example.com/path ",
	"https://rpc.example.com/?q=x ",
	"https:rpc.example.com",
	"http://localhost\\@evil.com",
]

const REFUSED = [
	"https://a@b.example",
	"https://user:pass@b.example",
	"https://user@evil.com@safe.com",
	"http://user@localhost:8080",
	"http://localhost.:8080",
	"http://sub.localhost:8080",
	"http://127.0.0.2:8080",
	"http://0.0.0.0:8080",
	"http://[::ffff:127.0.0.1]:8080",
	"http://[::1]:8080",
	"http://[0:0:0:0:0:0:0:1]:8080",
	"https://rpc.example.com:65536",
	"",
	"ws://localhost:8080",
	"javascript:alert(1)",
	"file:///etc/passwd",
	"localhost:8080",
]

describe("RpcUrlSchema", () => {
	test.each(ACCEPTED)("accepts %j", (url) => {
		expect(RpcUrlSchema.safeParse(url).success).toBe(true)
	})

	test.each(REFUSED)("refuses %j", (url) => {
		expect(RpcUrlSchema.safeParse(url).success).toBe(false)
	})

	test("a hidden character inside the URL carries its own line, never the transport message", () => {
		for (const url of [
			"https://rpc.example/p\u00A0q",
			"https://rpc .example/",
			"https://rpc.exa\tmple/",
			"https://rpc.example/a\rb",
			"https://rpc.example/a\nb",
		]) {
			const result = RpcUrlSchema.safeParse(url)
			expect(result.success).toBe(false)
			expect(result.error?.issues.map((i) => i.message)).toContain(ERR_RPC_URL_HIDDEN_CHARACTERS)
			expect(result.error?.issues.some((i) => i.message.startsWith("RPC URL must use"))).toBe(false)
		}
	})

	test("the parsed value is the trimmed URL", () => {
		expect(RpcUrlSchema.parse(" https://rpc.example/\u00A0")).toBe("https://rpc.example/")
	})

	test("a URL that parses but fails the allowlist carries the refine's message", () => {
		const result = RpcUrlSchema.safeParse("http://example.com")
		expect(result.success).toBe(false)
		expect(result.error?.issues.map((i) => i.message)).toEqual([
			"RPC URL must use https:// or http://localhost / http://127.0.0.1 and contain no userinfo",
		])
	})

	test("plain HTTP to [::1], in either spelling, carries its own line", () => {
		for (const url of ["http://[::1]:8080", "http://[0:0:0:0:0:0:0:1]:8080"]) {
			expect(RpcUrlSchema.safeParse(url).error?.issues.map((i) => i.message)).toEqual([ERR_RPC_URL_IPV6_LOOPBACK])
		}
	})
})

const network = (over: Partial<Network> = {}): Network => ({
	id: "n1",
	profileId: "p1",
	chainId: 7,
	l1ChainId: 1,
	name: "Seven",
	primaryEndpointId: "e2",
	endpoints: [
		{ id: "e1", rpcUrl: "https://one.example" },
		{ id: "e2", rpcUrl: "https://two.example" },
	],
	kind: "custom",
	...over,
})

describe("NetworkRowSchema and NetworkSchema", () => {
	const row: Network = {
		id: "n1",
		profileId: "p1",
		chainId: 1,
		l1ChainId: 1,
		name: "Testnet",
		primaryEndpointId: "e1",
		endpoints: [{ id: "e1", rpcUrl: "https://rpc.example.com" }],
	}

	test("the row codec loads a row with no endpoints; the strict schema refuses it", () => {
		const empty = { ...row, endpoints: [] }
		expect(NetworkRowSchema.safeParse(empty).success).toBe(true)
		expect(NetworkSchema.safeParse(empty).success).toBe(false)
	})

	test("both take every chain kind and refuse an unknown one", () => {
		for (const schema of [NetworkRowSchema, NetworkSchema]) {
			for (const kind of ["mainnet", "testnet", "devnet", "local", "custom"]) {
				expect(schema.safeParse({ ...row, kind }).success).toBe(true)
			}
			expect(schema.safeParse({ ...row, kind: "staging" }).success).toBe(false)
		}
	})
})

describe("NodeStatusSchema", () => {
	test("accepts a member and refuses the reverse-mapped key name of a numeric enum", () => {
		expect(NodeStatusSchema.safeParse(NodeStatus.InvalidChain)).toEqual({ success: true, data: NodeStatus.InvalidChain })
		expect(NodeStatusSchema.safeParse("Active").success).toBe(false)
	})
})

describe("networkInfoFrom", () => {
	test("projects the primary endpoint's URL, not the first endpoint's", () => {
		expect(networkInfoFrom(network())).toEqual({ profileId: "p1", chainId: 7, rpcUrl: "https://two.example" })
	})

	test("a primaryEndpointId that names no endpoint throws", () => {
		expect(() => networkInfoFrom(network({ primaryEndpointId: "gone" }))).toThrow(new Error("Network n1 has no primary endpoint"))
	})
})

describe("primaryEndpointUrl", () => {
	test("the primary endpoint's URL", () => {
		expect(primaryEndpointUrl(network())).toBe("https://two.example")
	})

	test("undefined for a dangling primaryEndpointId, never the first endpoint", () => {
		expect(primaryEndpointUrl(network({ primaryEndpointId: "gone" }))).toBeUndefined()
	})

	test("undefined for a row with no endpoints array", () => {
		expect(primaryEndpointUrl(network({ endpoints: undefined as never }))).toBeUndefined()
	})
})
