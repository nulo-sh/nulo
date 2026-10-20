// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { existsSync, readdirSync } from "node:fs"
import type { Browser, Page } from "puppeteer"
import { test as base, expect, inject } from "vitest"
import path from "node:path"
import { TESTNET_RPC_URL } from "@/wallet/constants/network-endpoints"
import {
	type LaunchedBrowser,
	browserTraffic,
	discoverExtensionId,
	extensionUrl,
	gotoExtensionPage,
	launchBrowser,
	newPage,
	openScratchPage,
	stopBackground,
} from "./browser"
import { createAccount, getAccountAddress } from "./accounts"
import { clickByTestId, expectNoNameField, isFrameDetachError, patchPagePolling, typeIntoInput, waitForHash } from "./dom"
import { switchToLocalNetwork } from "./networks"
import { readLivenessBaseline, waitForWorkerLiveness } from "./session"
import { importTokenAndWaitForBalance } from "./tokens"
import { openPopup, seedLegalAcceptance, waitForServiceReady } from "./wallet-pages"
import { assertPgOk, openPlayground, type PgBundle, selectPgBundle, snapshotResultSeq, waitForPgResult } from "./playground"
import { approveCapabilities, approveConnect, approveVerify, waitForPopup, waitForPopupClosed } from "./popups"
import { TEST_PASSWORD } from "./constants"
import type { AztecTestConfig } from "./aztec"
import type { LegalSeed } from "./legal"
import { assertNoCspViolations, CSP_REPORT_ARMED, closeAfterCspCheck, readCspViolations } from "./csp-violations"
import {
	type EgressCanary,
	type EgressGuard,
	type HeldNode,
	CRS_HOSTS,
	LIVE_LIST_HOST,
	LIVE_NODE_HOST,
	guardArmed,
	ownGuardedLaunch,
} from "./egress-guard"
import { holdNodeStub } from "./node-stub"
import { heldListStorage } from "./token-list"
import { PollTimeoutError, pollUntil } from "./poll"

// Specs reach the page primitives and the popup openers through this hub; they live in leaves so
// the modules the hub imports can use them without importing the hub back.
export * from "./dom"
export * from "./wallet-pages"

export interface ExtensionContext {
	browser: Browser
	extensionId: string
	consoleErrors: string[]
	pageErrors: Error[]
	/** Tear the launch down through this, never through `browser.close()`: a driver may own a
	 *  WebDriver process and a profile directory that closing the browser does not release. */
	close(): Promise<void>
	/** Check this launch's recorded CSP violations now rather than at `close`. A test calls it
	 *  before it reloads the extension, which discards the record; `close` then only closes. */
	checkCspViolations(): Promise<void>
	/** The launch's egress guard, canary and stand-in Testnet node; absent where
	 *  no guard is armed, and no stand-in in a `live` launch. */
	egress?: { guard: EgressGuard; canary: EgressCanary; node: HeldNode | undefined }
}

/** Launch a fresh browser with the extension and wait for SW liveness.
 *  Exported so test files that need a fully-clean extension (no profile
 *  registered, no networks switched) can build their own fixture.
 *
 *  `userDataDir` persists the Chrome profile (chrome.storage.local included)
 *  across launches — closing the browser and relaunching on the same dir is a
 *  REAL extension cold boot over surviving data, the faithful way to exercise
 *  update/crash paths (CDP `Runtime.terminateExecution` leaves an
 *  unrevivable zombie SW — see migration.test.ts). `waitForLiveness: false`
 *  skips the liveness gate for boots expected to park or fail before the
 *  heartbeat starts (a held or failing storage migration).
 *
 *  `legal` is the Terms-acceptance state the launch starts from. A fresh profile defaults to
 *  `current`, so a spec that is not about the gate never meets it; a reused profile defaults to
 *  `keep`, so whatever the previous launch left is what the relaunch boots over.
 *
 *  `fixedWindowSize: false` launches without the driver's fixed window size (`LaunchOptions`).
 *
 *  `grantPermissionRequests: true` grants a permission request from a real click with no prompt
 *  (`LaunchOptions`; Firefox only).
 *
 *  `live: true` sends the Testnet node's host and the token list's host direct instead of holding
 *  the stand-in, and fails the close if the guard sees either. Only a run that provides `liveLeg` may
 *  ask: elsewhere the launch would make a gate depend on a live host.
 *
 *  `tokenList: "held"` boots the worker a second time over a stored signed list (`token-list.ts`),
 *  before any profile exists, so the list's price ids and, in an artifact run, its defaults apply. */
export async function launchExtension(
	opts: {
		userDataDir?: string
		waitForLiveness?: boolean
		legal?: LegalSeed
		fixedWindowSize?: boolean
		live?: true
		tokenList?: "held"
		grantPermissionRequests?: true
		/** A build other than the run's: a release's or an update candidate's. */
		extensionPath?: string
		installInSession?: true
		/** The build carries no CSP violation recorder, as a release build does not. */
		cspRecorder?: false
	} = {},
): Promise<ExtensionContext> {
	const { userDataDir, waitForLiveness = true, fixedWindowSize, grantPermissionRequests, installInSession } = opts
	const extensionPath = opts.extensionPath ?? inject("extensionPath")
	const cspArmed = CSP_REPORT_ARMED && opts.cspRecorder !== false
	// Read before Chrome writes the profile: `onInstalled` fires with reason "install" — the only
	// reason that opens the first-run tab — exactly when the profile has never held the extension.
	// A caller's freshly created empty `userDataDir` is therefore a fresh install, not a reuse.
	const freshProfile = !userDataDir || !existsSync(userDataDir) || readdirSync(userDataDir).length === 0

	// HEADLESS=0 flips to windowed mode for local debugging.
	const headless: boolean = process.env.HEADLESS !== "0"
	const launch = (egress?: { guardPort: number; liveHosts?: readonly string[] }) =>
		launchBrowser({ extensionPath, userDataDir, headless, fixedWindowSize, egress, grantPermissionRequests, installInSession })
	const settle = (browser: Browser) =>
		settleLaunchedExtension(browser, {
			freshProfile,
			waitForLiveness,
			legal: opts.legal ?? (freshProfile ? "current" : "keep"),
			holdTokenList: opts.tokenList === "held",
		})
	if (opts.live && inject("liveLeg") !== true) {
		throw new Error("a live launch reaches the live Testnet node and list host, which only an artifact run's live spec may do")
	}
	const directHosts = [...CRS_HOSTS, ...(opts.live ? [LIVE_NODE_HOST, LIVE_LIST_HOST] : [])]
	if (guardArmed(inject("egressGuard"))) return launchBehindEgressGuard(launch, settle, directHosts, cspArmed)

	const { browser, close: closeBrowser } = await launch()
	try {
		const extensionId = await settle(browser)
		return { browser, extensionId, consoleErrors: [], pageErrors: [], ...cspLatch(browser, extensionId, closeBrowser, cspArmed) }
	} catch (err) {
		// Nothing else holds this launch yet; an escaping error would strand its browser.
		await closeBrowser().catch(() => {})
		throw err
	}
}

/** Every launch, a spec's own included, answers once for the violations recorded while it ran; a
 *  second close is the plain teardown it always was. */
function cspLatch(
	browser: Browser,
	extensionId: string,
	closeBrowser: () => Promise<void>,
	armed: boolean,
): Pick<ExtensionContext, "close" | "checkCspViolations"> {
	let checked = !armed
	const read = () => readCspViolations(browser, extensionId)
	return {
		checkCspViolations: async () => {
			if (checked) return
			checked = true
			await assertNoCspViolations(read)
		},
		close: () => {
			if (checked) return closeBrowser()
			checked = true
			return closeAfterCspCheck(closeBrowser, read)
		},
	}
}

async function launchBehindEgressGuard(
	launch: (egress: { guardPort: number; liveHosts?: readonly string[] }) => Promise<LaunchedBrowser>,
	settle: (browser: Browser) => Promise<string>,
	directHosts: readonly string[],
	cspArmed: boolean,
): Promise<ExtensionContext> {
	const guarded = await ownGuardedLaunch({
		label: launchLabel(),
		traffic: browserTraffic,
		liveHosts: directHosts,
		launch: async (egress) => {
			const launched = await launch(egress)
			return { value: launched.browser, close: launched.close }
		},
		settle,
		probeCanary: fireCanary,
		wrapClose: (closeBrowser, browser, extensionId) => cspLatch(browser, extensionId, closeBrowser, cspArmed),
		holdNode: directHosts.includes(LIVE_NODE_HOST)
			? undefined
			: (browser, extensionId) => holdNodeStub(browser, extensionId, TESTNET_RPC_URL),
	})
	const { value: browser, settled: extensionId, wrapped, guard, canary, node } = guarded
	return {
		browser,
		extensionId,
		consoleErrors: [],
		pageErrors: [],
		close: guarded.close,
		checkCspViolations: wrapped.checkCspViolations,
		egress: { guard, canary, node },
	}
}

/** The file alone: vitest keeps the last test's name through a later hook, and a file-scoped
 *  fixture outlives the test that first asked for it. */
function launchLabel(): string {
	const { testPath } = expect.getState()
	return testPath ? path.basename(testPath) : "an e2e launch"
}

/** Starts a request for `url` from an extension page, under the extension's own CSP, and waits for
 *  the guard to record it. The page stays open until then: closing it could cancel the request. */
async function fireCanary(browser: Browser, extensionId: string, url: string, recorded: () => boolean, budgetMs: number): Promise<void> {
	const page = await openScratchPage(browser, extensionId)
	try {
		await page.evaluate((target: string) => {
			fetch(target, { mode: "no-cors", cache: "no-store" }).catch(() => {})
		}, url)
		await pollUntil(
			async () => recorded(),
			(seen) => seen,
			{
				label: "the guard recording the canary",
				timeoutMs: budgetMs,
				intervalMs: 100,
			},
		).catch((error: unknown) => {
			if (!(error instanceof PollTimeoutError)) throw error
		})
	} finally {
		await page.close().catch(() => {})
	}
}

/** Discover the extension id, wait for the worker, close the first-run tab and mark onboarding
 *  complete. Returns the extension id. */
async function settleLaunchedExtension(
	browser: Browser,
	{
		freshProfile,
		waitForLiveness,
		legal,
		holdTokenList,
	}: { freshProfile: boolean; waitForLiveness: boolean; legal: LegalSeed; holdTokenList: boolean },
): Promise<string> {
	const extensionId = await discoverExtensionId(browser)

	// The scratch page is ours, not `pages()[0]`: puppeteer can hand back a page
	// whose frame is half-initialized and detaches during the first navigation
	// (`openPopup` documents the same sequence and applies the same remedy), and
	// the only fix is to discard the page and re-create it — which we may not do
	// to Chrome's own startup page. That page is therefore left untouched, which
	// also guarantees the browser always keeps one open.
	let blankPage: Page | undefined
	for (let attempt = 1; ; attempt++) {
		let candidate: Page | undefined
		try {
			candidate = await openScratchPage(browser, extensionId)
			patchPagePolling(candidate)
			blankPage = candidate
			break
		} catch (err) {
			// `newPage()` itself can throw the detach, so it lives inside the try;
			// `candidate` is undefined in that case and there is nothing to close.
			await candidate?.close().catch(() => {})
			if (attempt >= 2 || !isFrameDetachError(err)) throw err
		}
	}
	// Wait for SW to fully initialize (liveness signal in chrome.storage.session).
	// runtime.ts writes the first liveness immediately after initWalletSdkHandler;
	// 30s timeout matches the helper in sw-resilience.test.ts and gives headroom
	// for slow CI runners on cold-boot Barretenberg wasm + service-graph init.
	if (waitForLiveness) {
		await blankPage.waitForFunction(
			async () => {
				try {
					const result = await chrome.storage.session.get("nulo:liveness")
					return !!result["nulo:liveness"]
				} catch {
					return false
				}
			},
			{ timeout: 30_000, polling: 500 },
		)
	}

	// `onInstalled` opens the extension's first-run tab and stores its id in session storage. Nothing
	// in the worker's boot awaits that open, so the id can land after liveness; on a fresh profile
	// the install is certain, so the id is REQUIRED — a launch that cannot find it would hand the
	// test an untracked extension page, and that is a setup failure, not a warning. A reused profile
	// was installed by an earlier launch and opens no tab; there the poll is only a courtesy. Close
	// the tab BEFORE marking onboarding complete: an onboarding page that mounts and reads the
	// completed flag replaces itself with a popup window and drops the tracked id. Every e2e drives
	// the popup flows directly; the tab-flow specs open their own tab.
	const firstRunTabClosed = await blankPage.evaluate(async () => {
		const key = "nulo:onboarding:tab-id"
		for (let attempt = 0; attempt < 20; attempt++) {
			const id = (await chrome.storage.session.get(key))[key]
			if (typeof id === "number") {
				await chrome.tabs.remove(id).catch(() => {})
				await chrome.storage.session.remove(key)
				return true
			}
			await new Promise((r) => setTimeout(r, 250))
		}
		return false
	})
	if (!firstRunTabClosed && freshProfile) {
		throw new Error("launchExtension: the first-run onboarding tab never registered its id within 5s of liveness")
	}

	// Default: bypass the new onboarding tab flow for all e2e tests. Existing
	// tests (registration, import-paths, passkey-paths, etc.) drive the
	// popup-based create/import flows directly via openPopup. Setting
	// onboardingCompleted=true makes popup/pages/register.vue + import.vue
	// skip their redirect-to-tab logic. Tests that specifically exercise the
	// onboarding tab flow (tests/e2e/onboarding-tab.test.ts) reset this flag
	// in their own setup before driving the tab.
	await blankPage.evaluate(async () => {
		await chrome.storage.local.set({ "nulo:onboarding:completed": true })
	})
	if (legal !== "keep") await seedLegalAcceptance(blankPage, legal)
	if (holdTokenList) blankPage = await rebootOverHeldList(browser, extensionId, blankPage)

	await blankPage.close()

	return extensionId
}

/**
 * The worker reads its stored list once, at start, so the list is written and the worker stopped
 * and woken again. Firefox ends its event page only while no extension page is open, so the scratch
 * page closes first, and wakes it only on an add-on event: the popup, whose service clients connect,
 * is what wakes it. The stored deadline keeps that boot from fetching.
 */
async function rebootOverHeldList(browser: Browser, extensionId: string, scratch: Page): Promise<Page> {
	const { local, session } = await heldListStorage()
	await scratch.evaluate(
		async (l: Record<string, string>, s: Record<string, unknown>) => {
			await chrome.storage.local.set(l)
			await chrome.storage.session.set(s)
		},
		local,
		session,
	)
	const baseline = await readLivenessBaseline(scratch)
	await scratch.close()
	await stopBackground({ browser, extensionId })
	const next = await newPage(browser)
	patchPagePolling(next)
	await gotoExtensionPage(next, extensionUrl(extensionId, "/src/popup/index.html"))
	await waitForWorkerLiveness(next, baseline)
	return next
}

/** Register a profile with a test password. Leaves the extension on #/popup/general.
 *  Exported so a cold-shard warm-up tap (and any other test infra that
 *  drives the full register flow outside the fixture pipeline) can reuse it. */
export async function registerProfile(ctx: ExtensionContext): Promise<void> {
	const page = await openPopup(ctx)

	await waitForHash(page, "#/popup/register")

	await waitForServiceReady(page, 30_000)

	await clickByTestId(page, "register-create-btn")

	// Wait for RegisterPopup submit button to mount
	await page.waitForSelector('[data-testid="register-submit-btn"]', {
		visible: true,
		timeout: 30_000,
	})

	// A fresh install's first profile has no name field; it is created as "Main".
	await expectNoNameField(page, "register-page", "register-name-input")

	await page.waitForSelector('input[placeholder="Strong password"]', {
		visible: true,
		timeout: 30_000,
	})

	await typeIntoInput(page, "Strong password", TEST_PASSWORD)
	await typeIntoInput(page, "Repeat password", TEST_PASSWORD)

	// Submit (waitForFunction inside clickByTestId gates on :disabled)
	await clickByTestId(page, "register-submit-btn")

	await waitForHash(page, "#/popup/general", 30_000)
	await page.waitForSelector('[data-testid="balance-amount"]', { visible: true, timeout: 30_000 })
	await page.close()
}

/**
 * Drive the wallet-sdk handshake through the local @nulo/playground page:
 *   1) Open the playground (?test=1 disables HMR + persistence), on `opts.chainInfo`'s chain if given
 *   2) Click `pg-btn-connect` — fires `WalletManager.getAvailableWallets`
 *   3) Approve at `/windows/discover` (testid `discover-allow-btn`)
 *   4) After ECDH key exchange, approve the emoji check the same window shows
 *   5) Wait for the playground status pill to flip to `connected`
 *
 * Returns the dApp Page so the caller can keep driving it; the caller is
 * responsible for closing it (or letting the browser teardown handle it).
 *
 * Exported alongside `registerProfile` so a cold-shard warm-up tap
 * can perform the same setup without going through the fixture pipeline.
 */
export async function connectPlayground(ctx: ExtensionContext, opts: Parameters<typeof openPlayground>[1] = {}): Promise<Page> {
	// Internal phase-tag so the outer `[dappConnectedExtensionPerTest:connectPlayground]`
	// error tells us WHICH step inside this function fails. Without this we
	// only know "30s timeout somewhere in here" — useless for triage.
	const step = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
		try {
			return await fn()
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			throw new Error(`connectPlayground:${name} — ${msg}`, { cause: err })
		}
	}

	const dappPage = await step("openPlayground", () => openPlayground(ctx, opts))

	// Set up popup listeners BEFORE the click so we don't miss the events.
	const discoverP = waitForPopup(ctx, "discover", { timeout: 30_000 })

	// Bumped from 5s to 30s — under network-suite load the playground vite
	// server cold-load + dapp Vue mount can take 10-20s; clickByTestId polls
	// for ~10s on its own which is still usually enough, but the explicit
	// waitForSelector here was the load-bearing 5s timeout that cascaded
	// into ~40 fixture failures.
	await step("waitForConnectBtn", () => dappPage.waitForSelector('[data-testid="pg-btn-connect"]', { visible: true, timeout: 30_000 }))
	await step("clickConnect", () => clickByTestId(dappPage, "pg-btn-connect"))

	const discoverPage = await step("awaitDiscoverPopup", () => discoverP)
	const verifyPage = await step("approveConnect", () => approveConnect(ctx, discoverPage))
	await step("approveVerify", () => approveVerify(verifyPage))

	await step("waitForConnectedStatus", () =>
		dappPage.waitForSelector('[data-testid="pg-status"][data-status="connected"]', { timeout: 30_000 }),
	)
	return dappPage
}

// ── Fixture setup helpers ─────────────────────────────────────────────────

/** Wraps each setup step so a throw carries a `[<prefix>:<step>]` tag. Without
 *  it a failure deep in fixture setup surfaces downstream as an opaque
 *  `Cannot read properties of undefined (reading 'playgroundPage')` (the test
 *  body destructures a fixture result that `use()` never produced because setup
 *  threw). The tag converts that collapse into a precise origin line. */
type PhaseTagger = <T>(name: string, fn: () => Promise<T>) => Promise<T>

function makePhase(prefix: string) {
	return async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
		try {
			return await fn()
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			throw new Error(`[${prefix}:${name}] ${msg}`)
		}
	}
}

/** Drive a fresh browser through register → Local Network → playground-connect,
 *  the shared spine of every dapp-connected fixture. `beforeClose` runs after
 *  the network switch but before the setup popup closes (used to create extra
 *  accounts whose cost must land in the fixture hookTimeout, not the test
 *  budget). Returns the connected context plus the `phase` tagger so the caller
 *  can keep tagging its own follow-up steps under the same prefix. */
async function setupConnectedPlayground(
	prefix: string,
	beforeClose?: (page: Page, phase: PhaseTagger) => Promise<void>,
): Promise<{ ctx: ExtensionContext; playgroundPage: Page; phase: PhaseTagger }> {
	const phase = makePhase(prefix)
	const ctx = await phase("launchExtension", () => launchExtension())
	await phase("registerProfile", () => registerProfile(ctx))
	const setupPage = await phase("openPopup", () => openPopup(ctx))
	await phase("waitForHashGeneral", () => waitForHash(setupPage, "#/popup/general", 30_000))
	await phase("switchToLocalNetwork", () => switchToLocalNetwork(setupPage))
	if (beforeClose) await beforeClose(setupPage, phase)
	await setupPage.close()
	const playgroundPage = await phase("connectPlayground", () => connectPlayground(ctx))
	return { ctx, playgroundPage, phase }
}

/** Drive the playground's requestCapabilities flow for `bundle`, then approve
 *  the cap popup for whichever accounts `pick` selects; returns the granted
 *  addresses once the popup has closed. All timeouts match the cold-shard budget (60s for the popup
 *  target + the account-row render — chrome.windows.create + SW handler boot +
 *  loadInteractionPayload's PXE/accountService warmup can each exceed 30s on a
 *  cold CI runner; 30s for the dApp result). `pick` owns the per-fixture
 *  selection + its failure messages (single account vs first-two). */
export async function grantCapBundle(
	ctx: ExtensionContext,
	playgroundPage: Page,
	bundle: PgBundle,
	pick: (accountIds: (string | null)[], capPopup: Page) => Promise<string[]>,
): Promise<string[]> {
	await selectPgBundle(playgroundPage, bundle)
	const seqGrant = await snapshotResultSeq(playgroundPage)
	const capPopupP = waitForPopup(ctx, "capabilities", { timeout: 60_000 })
	await clickByTestId(playgroundPage, "pg-btn-requestCapabilities")
	const capPopup = await capPopupP
	await capPopup.waitForSelector('[data-testid="cap-account-item"]', { timeout: 60_000 })
	const accountIds = await capPopup.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('[data-testid="cap-account-item"]')].map((r) => r.getAttribute("data-account-id")),
	)
	const granted = await pick(accountIds, capPopup)
	await approveCapabilities(capPopup, { accounts: granted })
	await assertPgOk(playgroundPage, await waitForPgResult(playgroundPage, "requestCapabilities", seqGrant, 30_000), "grantCapBundle")
	// The window resolves the request before it closes, so the dApp's answer can precede its teardown.
	await waitForPopupClosed(capPopup, 10_000)
	return granted
}

/** Select the first exposed account; throws the canonical empty-popup message. */
const pickFirstAccount = async (accountIds: (string | null)[]): Promise<string[]> => {
	const address = accountIds[0]
	if (!address) throw new Error("capabilities popup returned no accounts")
	return [address]
}

// ── Fixtures ────────────────────────────────────────────────────────────

type TwoAccountDapp = ExtensionContext & { playgroundPage: Page; accountAddresses: string[] }

/** Ground truth from the wallet's own storage — every account and network row, raw (values may
 *  be serialized strings) — so a "<2 accounts exposed" failure discriminates wrong-chain creation
 *  from popup-side filtering. */
function dumpAccountAndNetworkRows(popup: Page): Promise<string> {
	return popup.evaluate(async () => {
		const all = await chrome.storage.local.get(null)
		const out: string[] = []
		for (const [k, v] of Object.entries(all)) {
			if (k.startsWith("nulo:core:accounts") || k.startsWith("nulo:core:networks")) {
				out.push(`${k} => ${(typeof v === "string" ? v : JSON.stringify(v)).slice(0, 400)}`)
			}
		}
		return out.join(" ||| ")
	})
}

/** The two-account dApp fixture body, shared by its `transaction` and `transaction-contracts`
 *  variants: a second account created in the setup phase, then the bundle pre-granted to the
 *  first two accounts the cap popup exposes. */
function firstTwoAccountsFixture(label: string, bundle: "transaction" | "transaction-contracts") {
	// biome-ignore lint/correctness/noEmptyPattern: vitest fixture API requires {} destructuring
	return async ({}: object, use: (v: TwoAccountDapp) => Promise<void>) => {
		// Captured in the second-account setup step and referenced by the
		// cap-pick failure message below, so a "<2 accounts exposed" failure
		// discriminates wrong-chain creation from popup-side filtering.
		let postCreateDump = ""
		const { ctx, playgroundPage, phase } = await setupConnectedPlayground(label, async (setupPage, phase) => {
			// A fresh profile exposes ONE account; multi-account consumers (the
			// from-characterization + the authwit consume-as-caller flow) need a
			// real second account in the cap popup, so create it here where the
			// cost lands in hookTimeout.
			await phase("createSecondAccount", () => createAccount(setupPage, "Second"))
			// Persistence assertion: the row rendering proves only the optimistic
			// appStore push; verify the SERVICE write landed before moving on.
			await phase("assertSecondAccountPersisted", async () => {
				postCreateDump = await setupPage.evaluate(async () => {
					const all = await chrome.storage.local.get(null)
					return Object.entries(all)
						.filter(([k]) => k.startsWith("nulo:core:accounts"))
						.map(([, v]) => (typeof v === "string" ? v : JSON.stringify(v)))
						.join(" ||| ")
				})
				if (!postCreateDump.includes('"Second"')) {
					throw new Error(`account "Second" not in storage immediately after creation. Stored: ${postCreateDump.slice(0, 600)}`)
				}
			})
		})

		// Pre-grant the bundle to the first two accounts the cap popup exposes;
		// fewer than two is a setup failure, diagnosed below.
		const accountAddresses = await phase("grantFirstTwoAccountsTransactionCap", () =>
			grantCapBundle(ctx, playgroundPage, bundle, async (accountIds, capPopup) => {
				const granted = accountIds.slice(0, Math.min(2, accountIds.length)).filter((a): a is string => !!a)
				if (granted.length === 0) throw new Error("capabilities popup returned no accounts")
				// The fixture creates a second account upstream; if the cap popup
				// exposes fewer, fail HERE with the ids so the discriminator
				// (creation failed vs popup filtered) is in the error itself.
				if (granted.length < 2) {
					throw new Error(
						`capabilities popup exposed only [${accountIds.join(", ")}] — expected the created second account.\nAT-CAP-TIME: ${await dumpAccountAndNetworkRows(capPopup)}\nPOST-CREATE: ${postCreateDump}`,
					)
				}
				return granted
			}),
		)

		await use(Object.assign(ctx, { playgroundPage, accountAddresses }))
		await ctx.close()
	}
}

/** The sandbox config the network setup provides; throws where none is, as on a smoke run. */
export function requireAztecConfig(): AztecTestConfig {
	const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
	if (!aztecConfig) throw new Error("aztecTestConfig not provided — is the local Aztec node running?")
	return aztecConfig
}

/** What the funded network fixtures mint to the wallet's account, and so expect on its token row. */
const FIXTURE_TOKEN_RAW = 1000n * 10n ** 18n

async function launchOnLocalNetwork(): Promise<{ ctx: ExtensionContext; page: Page }> {
	const ctx = await launchExtension()
	await registerProfile(ctx)
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general", 30_000)
	await switchToLocalNetwork(page)
	return { ctx, page }
}

export const test = base.extend<{
	/** Fresh browser with extension loaded, no profile. */
	extension: ExtensionContext
	/** Fresh browser with extension + registered profile on #/popup/general. */
	registeredExtension: ExtensionContext
	/** Like `registeredExtension` but a fresh browser per test. Use this
	 *  for tests that wipe profile/account state mid-flow (reset-profile,
	 *  destructive recovery flows) so the wipe doesn't leak into siblings. */
	registeredExtensionPerTest: ExtensionContext
	/** `registeredExtension` over a held signed list, whose price ids price its tokens. */
	listedExtension: ExtensionContext
	/** `registeredExtensionPerTest` over a held signed list. */
	listedExtensionPerTest: ExtensionContext
	/** Registered extension + Local Network + dapp connected via @nulo/playground.
	 *  File-scoped: shared across tests in the same file. Use `dappConnectedExtensionPerTest`
	 *  for parameterized files where each case needs a clean session. */
	dappConnectedExtension: ExtensionContext & { playgroundPage: Page }
	/** Like `dappConnectedExtension` but per-test fresh browser/session. Use this
	 *  for files with multiple parameterized cases (sim-methods, authwit-variants,
	 *  tx-sendTx-multicall) so cap state from one case doesn't leak to the next. */
	dappConnectedExtensionPerTest: ExtensionContext & { playgroundPage: Page }
	/** Per-test fresh browser + registered profile + Local Network + dapp
	 *  connected via @nulo/playground + `accounts` capability ALREADY GRANTED
	 *  for the playground origin. Use this for tests that exercise an
	 *  account-cap-gated RPC (registerToken, getAccounts post-grant) without
	 *  paying the cold cap-popup round-trip during the test budget — the
	 *  cap-popup work happens in fixture setup, which has hookTimeout=300s.
	 *  The exposed `accountAddress` is the first account from the cap popup
	 *  (the one the fixture selected on the dApp's behalf).
	 *  See implementations-plan/archive/e2e-stabilization/plan.md (Cap fixtures). */
	dappConnectedExtensionWithAccountsCap: ExtensionContext & { playgroundPage: Page; accountAddress: string }
	/** Per-test fresh browser + registered profile + Local Network + dapp
	 *  connected + `transaction` bundle (accounts + transaction caps) ALREADY
	 *  GRANTED for the playground origin. Use this for tests that exercise a
	 *  transaction-cap-gated RPC (sendTx, multicall) without paying the cold
	 *  cap-popup round-trip during the test budget — the cap-popup work happens
	 *  in fixture setup, which has hookTimeout=300s. The exposed `accountAddress`
	 *  is the first account from the cap popup (the one the fixture selected on
	 *  the dApp's behalf). */
	dappConnectedExtensionWithTransactionCap: ExtensionContext & { playgroundPage: Page; accountAddress: string }
	/** Same as `dappConnectedExtensionWithTransactionCap` BUT pre-grants the
	 *  `transaction` bundle for up to the FIRST TWO accounts the cap popup
	 *  exposes. Use this for tests that characterize multi-account session
	 *  behavior (multi-account-from) without paying the cap-popup cold tax
	 *  during the test budget. The exposed `accountAddresses` is the array
	 *  of granted accounts (1 or 2 entries depending on what the wallet
	 *  exposed). */
	dappConnectedExtensionWithFirstTwoAccountsCap: ExtensionContext & {
		playgroundPage: Page
		accountAddresses: string[]
	}
	/** `dappConnectedExtensionWithFirstTwoAccountsCap` with the `transaction-contracts`
	 *  bundle: the dApp may also register its own contracts (the self-pay phase gate
	 *  introduces a token whose minter is one of the two granted accounts). */
	dappConnectedExtensionWithFirstTwoAccountsContractsCap: ExtensionContext & {
		playgroundPage: Page
		accountAddresses: string[]
	}
	/** Fresh browser with extension loaded, **no profile registered**. Per-test
	 *  scope. Use for tests that drive the import or register flow from
	 *  scratch (e.g. tests/e2e/import-paths.test.ts). */
	freshExtensionPerTest: ExtensionContext
	/** Registered + switched to Local Network. */
	localNetworkExtension: ExtensionContext
	/** Local network + token imported + public tokens minted to account. */
	tokenReadyExtension: ExtensionContext & { accountAddress: string }
	/** Token ready + FeeJuice bridged and claimed to account. */
	feeJuiceReadyExtension: ExtensionContext & { accountAddress: string }
	/** Extension imports a pre-funded account via importPlain. The account has
	 *  both public + private FeeJuice on Local Network, ready for fee-methods.test
	 *  scenarios. */
	feeJuiceImportedExtension: ExtensionContext & { accountAddress: string }
}>({
	extension: [
		// biome-ignore lint/correctness/noEmptyPattern: vitest fixture API requires {} destructuring
		async ({}, use) => {
			const ctx = await launchExtension()
			await use(ctx)
			await ctx.close()
		},
		{ scope: "file" },
	],

	registeredExtension: [
		// biome-ignore lint/correctness/noEmptyPattern: vitest fixture API requires {} destructuring
		async ({}, use) => {
			const ctx = await launchExtension()
			await registerProfile(ctx)
			await use(ctx)
			await ctx.close()
		},
		{ scope: "file" },
	],

	registeredExtensionPerTest: [
		// biome-ignore lint/correctness/noEmptyPattern: vitest fixture API requires {} destructuring
		async ({}, use) => {
			const ctx = await launchExtension()
			await registerProfile(ctx)
			await use(ctx)
			await ctx.close()
		},
		{ scope: "test" },
	],

	listedExtension: [
		// biome-ignore lint/correctness/noEmptyPattern: vitest fixture API requires {} destructuring
		async ({}, use) => {
			const ctx = await launchExtension({ tokenList: "held" })
			await registerProfile(ctx)
			await use(ctx)
			await ctx.close()
		},
		{ scope: "file" },
	],

	listedExtensionPerTest: [
		// biome-ignore lint/correctness/noEmptyPattern: vitest fixture API requires {} destructuring
		async ({}, use) => {
			const ctx = await launchExtension({ tokenList: "held" })
			await registerProfile(ctx)
			await use(ctx)
			await ctx.close()
		},
		{ scope: "test" },
	],

	freshExtensionPerTest: [
		// biome-ignore lint/correctness/noEmptyPattern: vitest fixture API requires {} destructuring
		async ({}, use) => {
			const ctx = await launchExtension()
			await use(ctx)
			await ctx.close()
		},
		{ scope: "test" },
	],

	dappConnectedExtension: [
		async ({ registeredExtension }, use) => {
			// Switch to Local Network BEFORE connecting the playground. The playground passes
			// Fr.ZERO chainInfo (= chainId 0 = Local Network) while the e2e build seeds Testnet as
			// the active network. The wallet now provisions a chain's default account on a dApp's
			// request, so the mismatch alone no longer empties the account picker (pinned by
			// cap-chain-mismatch.test.ts) — but sendTx/sim tests need the ACTIVE network on the
			// sandbox (funded accounts, fee estimation, sync), which only the switch provides.
			const setupPage = await openPopup(registeredExtension)
			await waitForHash(setupPage, "#/popup/general", 30_000)
			await switchToLocalNetwork(setupPage)
			await setupPage.close()
			const playgroundPage = await connectPlayground(registeredExtension)
			await use(Object.assign(registeredExtension, { playgroundPage }))
		},
		{ scope: "file" },
	],

	dappConnectedExtensionPerTest: [
		// biome-ignore lint/correctness/noEmptyPattern: vitest fixture API requires {} destructuring
		async ({}, use) => {
			const { ctx, playgroundPage } = await setupConnectedPlayground("dappConnectedExtensionPerTest")
			await use(Object.assign(ctx, { playgroundPage }))
			await ctx.close()
		},
		{ scope: "test" },
	],

	dappConnectedExtensionWithAccountsCap: [
		// biome-ignore lint/correctness/noEmptyPattern: vitest fixture API requires {} destructuring
		async ({}, use) => {
			const { ctx, playgroundPage, phase } = await setupConnectedPlayground("dappConnectedExtensionWithAccountsCap")
			// Pre-grant ONLY the `accounts` capability for the playground origin
			// (NOT the wider `basic` bundle). Runs inside the fixture hookTimeout
			// (300s) so the cold cap-popup work doesn't eat any consumer's per-test
			// budget. The selected address is returned so consumers needn't
			// re-derive it from popup rows.
			const [accountAddress] = await phase("grantAccountsCap", () =>
				grantCapBundle(ctx, playgroundPage, "accounts", pickFirstAccount),
			)
			await use(Object.assign(ctx, { playgroundPage, accountAddress }))
			await ctx.close()
		},
		{ scope: "test" },
	],

	dappConnectedExtensionWithTransactionCap: [
		// biome-ignore lint/correctness/noEmptyPattern: vitest fixture API requires {} destructuring
		async ({}, use) => {
			const { ctx, playgroundPage, phase } = await setupConnectedPlayground("dappConnectedExtensionWithTransactionCap")
			// Pre-grant the `transaction` bundle (accounts + transaction caps).
			// Same scope rules as the accounts-cap fixture: per-test, playground
			// origin only, cold cap-popup round-trip paid in hookTimeout (300s).
			const [accountAddress] = await phase("grantTransactionCap", () =>
				grantCapBundle(ctx, playgroundPage, "transaction", pickFirstAccount),
			)
			await use(Object.assign(ctx, { playgroundPage, accountAddress }))
			await ctx.close()
		},
		{ scope: "test" },
	],

	dappConnectedExtensionWithFirstTwoAccountsCap: [
		firstTwoAccountsFixture("dappConnectedExtensionWithFirstTwoAccountsCap", "transaction"),
		{ scope: "test" },
	],
	dappConnectedExtensionWithFirstTwoAccountsContractsCap: [
		firstTwoAccountsFixture("dappConnectedExtensionWithFirstTwoAccountsContractsCap", "transaction-contracts"),
		{ scope: "test" },
	],

	localNetworkExtension: [
		// biome-ignore lint/correctness/noEmptyPattern: vitest fixture API requires {} destructuring
		async ({}, use) => {
			const { ctx, page } = await launchOnLocalNetwork()
			await page.close()
			await use(ctx)
			await ctx.close()
		},
		{ scope: "file" },
	],

	tokenReadyExtension: [
		// biome-ignore lint/correctness/noEmptyPattern: vitest fixture API requires {} destructuring
		async ({}, use) => {
			const aztecConfig = requireAztecConfig()

			const { ctx, page } = await launchOnLocalNetwork()

			const accountAddress = await getAccountAddress(page)
			console.log("[tokenReady] Extension account address:", accountAddress)
			console.log("[tokenReady] Token address:", aztecConfig.tokenAddress)

			// Lazy import to avoid loading WASM for smoke tests
			const { createTestWallet, createSponsoredFeeOptions, mintPublicTokens } = await import("./aztec")
			let walletCleanup: (() => Promise<void>) | undefined
			try {
				const { wallet, cleanup } = await createTestWallet(aztecConfig.nodeUrl)
				walletCleanup = cleanup
				const feeOptions = await createSponsoredFeeOptions(wallet)
				await mintPublicTokens(
					wallet,
					aztecConfig.tokenAddress,
					accountAddress,
					FIXTURE_TOKEN_RAW,
					aztecConfig.minterAddress,
					feeOptions,
				)
			} finally {
				await walletCleanup?.()
			}

			// The extension's PXE syncs blocks independently and may take 30-60s on a fresh node; each
			// refresh advances the sync. Fail-HARD: a fixture that quietly degrades moves the failure into
			// whichever consumer reads the balance first, with worse evidence. Token-scoped, so fiat or
			// superstring text cannot satisfy it.
			await importTokenAndWaitForBalance(page, accountAddress, aztecConfig.tokenAddress, FIXTURE_TOKEN_RAW.toString(), 60_000)
			console.log(`[tokenReady] balance row fresh + exact`)

			await page.close()

			await use(Object.assign(ctx, { accountAddress }))
			await ctx.close()
		},
		{ scope: "file" },
	],

	feeJuiceReadyExtension: [
		// biome-ignore lint/correctness/noEmptyPattern: vitest fixture API requires {} destructuring
		async ({}, use) => {
			const aztecConfig = requireAztecConfig()

			const { ctx, page } = await launchOnLocalNetwork()

			const accountAddress = await getAccountAddress(page)
			console.log("[feeJuiceReady] Extension account address:", accountAddress)

			const { createTestWallet, createSponsoredFeeOptions, mintPublicTokens, bridgeFeeJuice, waitForL1ToL2Message, claimFeeJuice } =
				await import("./aztec")
			let walletCleanup: (() => Promise<void>) | undefined
			try {
				const { wallet, accounts, node, cleanup } = await createTestWallet(aztecConfig.nodeUrl)
				walletCleanup = cleanup
				const minterAddress = accounts[0]
				const feeOptions = await createSponsoredFeeOptions(wallet)

				await mintPublicTokens(
					wallet,
					aztecConfig.tokenAddress,
					accountAddress,
					FIXTURE_TOKEN_RAW,
					aztecConfig.minterAddress,
					feeOptions,
				)

				// Bridge FeeJuice from L1 → L2
				console.log("[feeJuiceReady] Bridging FeeJuice from L1...")
				const claim = await bridgeFeeJuice(node, accountAddress)

				// Wait for the L1→L2 message to be CLAIMABLE. 5.0 mints no empty blocks, so force L2
				// blocks (a tiny sponsored mint) until the anchor covers the message's checkpoint.
				console.log("[feeJuiceReady] Waiting for L1→L2 message...")
				await waitForL1ToL2Message(
					node,
					claim.messageHash.toString(),
					() =>
						// Self-mint to the TEST wallet's account: each forced block must
						// not add to the extension account, whose balance is asserted
						// EXACTLY by the fail-hard row wait below.
						mintPublicTokens(
							wallet,
							aztecConfig.tokenAddress,
							minterAddress.toString(),
							1n,
							aztecConfig.minterAddress,
							feeOptions,
						),
					90_000,
				)

				// Claim FeeJuice on L2 (use SponsoredFPC to pay for the claim tx)
				console.log("[feeJuiceReady] Claiming FeeJuice on L2...")
				await claimFeeJuice(wallet, accountAddress, minterAddress, claim, feeOptions)
				console.log("[feeJuiceReady] FeeJuice claimed successfully")
			} finally {
				await walletCleanup?.()
			}

			// Fail-HARD, as tokenReadyExtension's.
			await importTokenAndWaitForBalance(page, accountAddress, aztecConfig.tokenAddress, FIXTURE_TOKEN_RAW.toString())
			console.log(`[feeJuiceReady] balance row fresh + exact`)

			await page.close()
			await use(Object.assign(ctx, { accountAddress }))
			await ctx.close()
		},
		{ scope: "file" },
	],

	feeJuiceImportedExtension: [
		// biome-ignore lint/correctness/noEmptyPattern: vitest fixture API requires {} destructuring
		async ({}, use) => {
			const aztecConfig = requireAztecConfig()

			// Phase 1: setup pre-funded account on-chain (script-side).
			const { createTestWallet, setupPreFundedAccount, createSponsoredFeeOptions, mintPublicTokens } = await import("./aztec")
			const { wallet, accounts, node, cleanup } = await createTestWallet(aztecConfig.nodeUrl)
			let prefunded: { words: string[]; masterBase64: string; accountAddress: { toString(): string } }
			try {
				const feePayer = accounts[0]
				if (!feePayer) throw new Error("expected at least one sandbox-deployed test account")
				const feeOptions = await createSponsoredFeeOptions(wallet)
				// forceBlock: 5.0 mints no empty blocks, so FJ-claim readiness only advances on a real
				// tx. A tiny sponsored mint is the cheapest block-producer available here.
				prefunded = await setupPreFundedAccount(wallet, node, feePayer, {
					forceBlock: () =>
						mintPublicTokens(wallet, aztecConfig.tokenAddress, feePayer.toString(), 1n, aztecConfig.minterAddress, feeOptions),
				})
				console.log(`[feeJuiceImported] pre-funded account: ${prefunded.accountAddress.toString()}`)

				// Mint test tokens for the imported account so transfer flows have something to send.
				await mintPublicTokens(
					wallet,
					aztecConfig.tokenAddress,
					prefunded.accountAddress.toString(),
					FIXTURE_TOKEN_RAW,
					aztecConfig.minterAddress,
					feeOptions,
				)
				console.log("[feeJuiceImported] minted test tokens for imported account")
			} finally {
				await cleanup()
			}

			// Phase 2: launch fresh extension + import the master via importPlain.
			const ctx = await launchExtension()
			const page = await openPopup(ctx)

			await waitForHash(page, "#/popup/register", 30_000)
			await waitForServiceReady(page, 30_000)

			// Navigate to import page (the register page has an "Import" link, but
			// direct hash nav is simpler for tests).
			await page.evaluate(() => {
				window.location.hash = "#/popup/import"
			})
			await waitForHash(page, "#/popup/import", 5_000)

			// Loaded at call time: a static import would load `@nulo/wallet-crypto`, and bb.js through
			// it, into every spec that imports this hub.
			const { importSeed, POPUP_IMPORT_SHELL } = await import("../helpers/import-drivers")
			await importSeed(page, prefunded.words.join(" "), TEST_PASSWORD, POPUP_IMPORT_SHELL)

			// Switch to Local Network — popup auto-creates a Local-chain account
			// with the SAME address the script pre-funded.
			await switchToLocalNetwork(page)

			// Wait for nulo:ui:activeAccount to settle on the Local-chain address.
			const accountAddress = prefunded.accountAddress.toString()
			await page.waitForFunction(
				async (expected: string) => {
					const r = await chrome.storage.local.get("nulo:ui:activeAccount")
					return r["nulo:ui:activeAccount"] === expected
				},
				{ timeout: 30_000, polling: 500 },
				accountAddress,
			)
			console.log(`[feeJuiceImported] extension account on Local: ${accountAddress}`)

			// Trigger gas-balance-card render by visiting general; both balances
			// should be non-zero (script pre-funded both public + private FJ).
			await page.waitForSelector('[data-testid="gas-balance-public"]', { visible: true, timeout: 30_000 })
			await page.waitForFunction(
				() => {
					const pub = document.querySelector('[data-testid="gas-balance-public"]')?.textContent ?? ""
					const priv = document.querySelector('[data-testid="gas-balance-private"]')?.textContent ?? ""
					const nonZero = (s: string) => /\d/.test(s) && !/^0(\.0+)?\s*FJ/i.test(s.trim())
					return nonZero(pub) && nonZero(priv)
				},
				{ timeout: 60_000, polling: 2_000 },
			)
			console.log("[feeJuiceImported] gas-balance card shows non-zero public + private FJ")

			// The send flow needs a token registered before send-from-type is selectable. Fail-HARD, as
			// tokenReadyExtension's.
			await importTokenAndWaitForBalance(page, accountAddress, aztecConfig.tokenAddress, FIXTURE_TOKEN_RAW.toString())
			console.log(`[feeJuiceImported] token balance row fresh + exact`)

			await page.close()
			await use(Object.assign(ctx, { accountAddress }))
			await ctx.close()
		},
		{ scope: "file" },
	],
})
