import { expect, test } from "bun:test"
import config from "../vite.config"

test("the dev server binds the IPv4 loopback", () => {
	expect(config.server?.host).toBe("127.0.0.1")
})
