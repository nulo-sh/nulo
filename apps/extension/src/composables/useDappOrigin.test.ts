import { describe, expect, test } from "vitest"
import { ref } from "vue"
import { useDappOrigin } from "./useDappOrigin"

describe("composables/useDappOrigin", () => {
	test("origin is empty when dapp is null or has no url", () => {
		expect(useDappOrigin(ref(null)).origin.value).toBe("")
		expect(useDappOrigin(ref({})).origin.value).toBe("")
	})

	test("four origins on one host read as four strings", () => {
		const origins = ["https://shop.example", "https://shop.example:8443", "http://shop.example", "http://shop.example:8080"]
		expect(origins.map((url) => useDappOrigin(ref({ url: `${url}/checkout?x=1` })).origin.value)).toEqual(origins)
	})

	test("a default port is dropped, as the origin a grant is keyed by drops it", () => {
		expect(useDappOrigin(ref({ url: "https://shop.example:443" })).origin.value).toBe("https://shop.example")
		expect(useDappOrigin(ref({ url: "http://shop.example:80" })).origin.value).toBe("http://shop.example")
	})

	test("reactive: updating the dapp ref re-derives both values", () => {
		const dapp = ref<{ url?: string } | null>({ url: "https://safe.com" })
		const { origin, isSuspicious } = useDappOrigin(dapp)
		expect(origin.value).toBe("https://safe.com")
		expect(isSuspicious.value).toBe(false)

		dapp.value = { url: "https://xn--exmple-cua.com:8443" }
		expect(origin.value).toBe("https://xn--exmple-cua.com:8443")
		expect(isSuspicious.value).toBe(true)
	})
})

/**
 * Origins as the SDK serializes a tab URL (`new URL(tab.url).origin`, or "unknown"), plus the
 * raw strings a stored row could carry. Values hold on Bun, jsdom, Chrome and Firefox; inputs whose
 * parse differs by engine (`https://xn--.example`, a space inside the host) are left out.
 */
describe("composables/useDappOrigin — hostile origins", () => {
	test.each([
		["https://dapp.example", "https://dapp.example", false],
		["https://DApp.EXAMPLE", "https://dapp.example", false],
		["https://dapp.example.", "https://dapp.example.", false],
		["https://dapp.example:8443", "https://dapp.example:8443", false],
		["http://dapp.example", "http://dapp.example", false],
		["https://dapp.example/path?q=1#h", "https://dapp.example", false],
		["https://user:pw@dapp.example", "https://dapp.example", false],
		["https://dapp.example@evil.example", "https://evil.example", false],
		["https://dapp.example%40evil.example", "https://dapp.example%40evil.example", false],
		["http://[::1]:5173", "http://[::1]:5173", false],
		["https://[::ffff:127.0.0.1]", "https://[::ffff:7f00:1]", false],
		["https://0x7f.1", "https://127.0.0.1", false],
		["https://dapp.example.evil.example", "https://dapp.example.evil.example", false],
		["https://dapp-example.com", "https://dapp-example.com", false],
		["https://exámple.com", "https://xn--exmple-qta.com", true],
		["https://аpple.com", "https://xn--pple-43d.com", true],
		["https://XN--EXMPLE-CUA.com", "https://xn--exmple-cua.com", true],
		["https://a.xn--p1ai", "https://a.xn--p1ai", true],
		["https://ｄａｐｐ.example", "https://dapp.example", false],
		["https://dapp.ex­ample", "https://dapp.example", false],
		["https://dapp.ex​ample", "https://dapp.example", false],
		["https://dapp.example。evil", "https://dapp.example.evil", false],
		["null", "null", false],
		["unknown", "unknown", false],
		["file:///etc/passwd", "file:///etc/passwd", false],
		["exámple", "exámple", true],
		["xn--exmple-cua", "xn--exmple-cua", true],
		["XN--EXMPLE-CUA", "XN--EXMPLE-CUA", false],
	])("%s → %s, flagged %s", (url, origin, suspicious) => {
		const view = useDappOrigin(ref({ url }))
		expect(view.origin.value).toBe(origin)
		expect(view.isSuspicious.value).toBe(suspicious)
	})
})
