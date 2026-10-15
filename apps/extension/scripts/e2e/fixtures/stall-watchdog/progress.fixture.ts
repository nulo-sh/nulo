import { test } from "vitest"

test("logs every half second", async () => {
	for (let i = 0; i < 10; i++) {
		console.log(`tick ${i}`)
		await new Promise((resolve) => setTimeout(resolve, 500))
	}
})
