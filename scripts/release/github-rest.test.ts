import { expect, test } from "bun:test"
import { refusal } from "./github-rest"

test.each([
	[
		"GitHub's message",
		Response.json({ message: "Bad credentials" }, { status: 401 }),
		"GET repos/o/r/releases: HTTP 401: Bad credentials",
	],
	["a body that is not JSON", new Response("<html>", { status: 502 }), "GET repos/o/r/releases: HTTP 502"],
	["a message that is not a string", Response.json({ message: 7 }, { status: 500 }), "GET repos/o/r/releases: HTTP 500"],
])("a refusal with %s names the method, the path without its query and the status", async (_, res, text) => {
	expect((await refusal(res, "GET", "repos/o/r/releases?per_page=100")).message).toBe(text)
})
