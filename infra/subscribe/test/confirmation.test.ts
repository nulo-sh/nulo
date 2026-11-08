import { expect, test } from "bun:test"
import { CONFIRM_URL, confirmationEmail, escapeHtml } from "../src/confirmation"

const TOKEN = "eyJlIjoicEBleGFtcGxlLmNvbSIsInQiOjF9.abc_DEF-123"

test("both parts carry the link to /confirm with the token in the fragment, and every link stays on nulo.sh", () => {
	const email = confirmationEmail(TOKEN)
	expect(CONFIRM_URL).toBe("https://nulo.sh/confirm")
	expect(email.text).toContain(`\nhttps://nulo.sh/confirm#${TOKEN}\n`)
	const hrefs = [...email.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])
	expect(hrefs.filter((href) => href === `https://nulo.sh/confirm#${TOKEN}`)).toHaveLength(2)
	for (const href of hrefs) expect(href).toMatch(/^https:\/\/nulo\.sh\//)
	expect(email).toMatchObject({ from: "Nulo <hello@news.nulo.sh>", reply_to: "hello@nulo.sh" })
})

test("loads nothing remote and leaves no template placeholder", () => {
	const { html } = confirmationEmail(TOKEN)
	expect(html).not.toMatch(/<img|<link|url\(|@import|\{\{/i)
	expect(html.match(/src=/g)).toBeNull()
})

test("escapes every character HTML gives meaning to", () => {
	expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;")
})
