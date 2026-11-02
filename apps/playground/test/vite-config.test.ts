/**
 * A server bound to `localhost` takes the resolver's first answer (`::1` on most hosts), while Node's
 * client drops `::1` on a host with no non-loopback IPv6 address, so the e2e setup's probe of
 * `http://localhost:<port>` never connects there; every client of `localhost` reaches `127.0.0.1`.
 */
import { expect, test } from "bun:test"
import config from "../vite.config"

test("the dev server binds the IPv4 loopback", () => {
	expect(config.server?.host).toBe("127.0.0.1")
})
