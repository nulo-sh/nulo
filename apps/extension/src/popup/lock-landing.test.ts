import { describe, expect, test } from "vitest"
import { decideLockLanding, decideUnreachableLanding, isEstablishedAtDecision } from "./lock-landing"

const base = {
	hasProfile: false,
	onAuthRequiredRoute: false,
	isPasskeyRoute: false,
	hasCandidate: true,
	pageEstablished: false,
	holdsSession: false,
	onOpeningRoute: false,
}

describe("decideLockLanding", () => {
	test("a passkey-interaction route with no profile owns its ceremony: hold", () => {
		expect(decideLockLanding({ ...base, isPasskeyRoute: true })).toBe("passkey-hold")
		expect(decideLockLanding({ ...base, isPasskeyRoute: true, hasCandidate: false })).toBe("passkey-hold")
	})

	test("a passkey-interaction route WITH a profile is not exempt", () => {
		expect(decideLockLanding({ ...base, isPasskeyRoute: true, hasProfile: true, onAuthRequiredRoute: true })).toBe("lock")
		expect(decideLockLanding({ ...base, isPasskeyRoute: true, hasProfile: true })).toBe("settle")
	})

	test("no profile selected: select the candidate and go to auth, or settle when there is none", () => {
		expect(decideLockLanding(base)).toBe("select-and-auth")
		expect(decideLockLanding({ ...base, hasCandidate: false })).toBe("settle")
	})

	test("a profile selected on an auth-required page over no session: lock", () => {
		expect(decideLockLanding({ ...base, hasProfile: true, onAuthRequiredRoute: true })).toBe("lock")
	})

	test("a profile selected on a page that needs no session (auth, register): settle", () => {
		expect(decideLockLanding({ ...base, hasProfile: true })).toBe("settle")
	})

	test("an established page never gets a candidate selected: an import mid-restore keeps its flow", () => {
		expect(decideLockLanding({ ...base, pageEstablished: true })).toBe("settle")
		// The restart lock itself is unaffected.
		expect(decideLockLanding({ ...base, pageEstablished: true, hasProfile: true, onAuthRequiredRoute: true })).toBe("lock")
	})

	test("an import or a profile create whose session a restart dropped ends its flow", () => {
		const opened = { ...base, hasProfile: true, onOpeningRoute: true, holdsSession: true }
		expect(decideLockLanding(opened)).toBe("end-flow")
		// Established (a reconnect over the page, or an own window): the flow is over all the same.
		expect(decideLockLanding({ ...opened, pageEstablished: true })).toBe("end-flow")
	})

	test("an import or a profile create that opened no session keeps its flow, own window included", () => {
		const unopened = { ...base, hasProfile: true, onOpeningRoute: true }
		expect(decideLockLanding(unopened)).toBe("settle")
		expect(decideLockLanding({ ...unopened, pageEstablished: true })).toBe("settle")
		// No profile selected yet (the first create before its bootstrap): the no-profile rule decides.
		expect(decideLockLanding({ ...base, onOpeningRoute: true, holdsSession: true, pageEstablished: true })).toBe("settle")
	})

	test("a page that needs no session and opens none settles while the shell holds one", () => {
		expect(decideLockLanding({ ...base, hasProfile: true, holdsSession: true })).toBe("settle")
		// An auth-required page that held a session still locks.
		expect(decideLockLanding({ ...base, hasProfile: true, holdsSession: true, onAuthRequiredRoute: true })).toBe("lock")
	})

	test("a reconnect whose mount-time boot was lost (no route resolved yet) still lands on auth", () => {
		expect(decideLockLanding({ ...base, pageEstablished: false })).toBe("select-and-auth")
	})
})

describe("isEstablishedAtDecision", () => {
	test("a page the person reached while the run waited keeps its flow, whatever the run finds", () => {
		const pageEstablished = isEstablishedAtDecision(false, "/popup/auth", "/popup/profile/new?from=/popup/auth")
		expect(decideLockLanding({ ...base, pageEstablished })).toBe("settle")
		expect(decideUnreachableLanding({ hasProfile: false, hasCandidate: true, pageEstablished })).toBe("stay")
	})

	test("the page the run started on, replayed in place, still gets the candidate", () => {
		const pageEstablished = isEstablishedAtDecision(false, "/popup/auth", "/popup/auth")
		expect(decideLockLanding({ ...base, pageEstablished })).toBe("select-and-auth")
	})

	test("a run that began before any route resolved compares nothing; one established at its start stays so", () => {
		expect(isEstablishedAtDecision(false, undefined, "/popup/auth")).toBe(false)
		expect(isEstablishedAtDecision(true, "/popup/import", "/popup/import")).toBe(true)
	})
})

describe("decideUnreachableLanding", () => {
	const u = { hasProfile: false, hasCandidate: true, pageEstablished: false }
	test("a selected profile: the lock screen is the recovery", () => {
		expect(decideUnreachableLanding({ ...u, hasProfile: true })).toBe("auth")
		expect(decideUnreachableLanding({ ...u, hasProfile: true, pageEstablished: true })).toBe("auth")
	})
	test("no profile, no page yet: select the candidate and go to auth", () => {
		expect(decideUnreachableLanding(u)).toBe("select-and-auth")
	})
	test("no profile on an established page (import mid-restore): the banner shows in place", () => {
		expect(decideUnreachableLanding({ ...u, pageEstablished: true })).toBe("stay")
	})
	test("no profile, no candidate: stay", () => {
		expect(decideUnreachableLanding({ ...u, hasCandidate: false })).toBe("stay")
	})
})
