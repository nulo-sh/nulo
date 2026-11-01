import { expect, test } from "vitest"
import { privateFetchInit } from "./private-fetch"

test("the init sends no cookie, referrer or cache validator, follows no redirect, and carries only the caller's headers", () => {
	const { signal } = new AbortController()
	const promise = { credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", cache: "no-store", signal }
	expect(privateFetchInit(signal)).toEqual({ headers: undefined, ...promise })
	const wider = { headers: { "x-key": "k" }, credentials: "include", redirect: "follow", mode: "no-cors" } as { headers: HeadersInit }
	expect(privateFetchInit(signal, wider)).toEqual({ headers: { "x-key": "k" }, ...promise })
})
