import { ContractNotFoundError, TokenDecimalsOutOfRangeError } from "@nulo/extension-messaging/errors"
import { isFieldAddress } from "@nulo/wallet-bridge"
import { ref } from "vue"
import { useToast } from "@/composables/toast"
import { useAppStore } from "@/stores/app.store"
import { ALREADY_EXISTS, INVALID_ADDRESS } from "@/utils/entity-rules"
import type { TaskServiceClient } from "@/wallet/services/task/client"
import { type BalanceUpdateContent, ContentKind, type Task } from "@/wallet/services/task/spec"
import type { TokenBalanceServiceClient } from "@/wallet/services/token-balance/client"
import type { TokenBalanceInfo } from "@/wallet/services/token-balance/spec"
import type { TokenServiceClient } from "@/wallet/services/token/client"
import { DECIMALS_MAX, type TokenInfo } from "@/wallet/services/token/spec"

/** Why `value` cannot be imported beside `tokens`, or `null`; an empty value has no verdict yet. */
export function contractVerdict(value: string | undefined, tokens: readonly { contract: string }[]): string | null {
	if (!value?.length) return null
	if (!isFieldAddress(value)) return INVALID_ADDRESS
	// Hex is case-insensitive: another spelling of a listed contract is that token.
	if (tokens.some((t) => t.contract.toLowerCase() === value.toLowerCase())) return ALREADY_EXISTS
	return null
}

export type TokenImportPhase = "idle" | "adding" | "loading-balance"

/**
 * `inScope` on an add: the token is on the chain and in the scope the import began in, so its row is
 * the screen's; on a refusal: that scope is still the screen's. `aborted` has nothing to report: the
 * wait was ended, the hook disposed, or another import was running.
 */
export type TokenImportOutcome =
	| { kind: "added"; token: TokenInfo; inScope: boolean }
	| { kind: "refused"; message: string; inScope: boolean }
	| { kind: "aborted" }

interface TokenImportDeps {
	/** Connected and disconnected by the caller; the task client's port must be open before an import,
	 *  since its events reach only an open port. */
	tokenService: Pick<TokenServiceClient, "getTokens" | "parseTokenInterface" | "addToken">
	tokenBalanceService: Pick<TokenBalanceServiceClient, "getTokenBalances" | "onTokenBalanceAdded">
	taskService: Pick<TaskServiceClient, "onTaskUpdated">
}

const BALANCE_WAIT_TIMEOUT_MS = 30_000
const ABORTED = { kind: "aborted" } as const
const WAIT_TOASTS = {
	success: "Token added",
	timeout: "Token added. Balance will appear in a moment",
	error: "Token added. Couldn't load balance. We'll retry automatically.",
} as const
const NO_INTERFACE = "Couldn't auto-detect this token's interface. Try a contract whose ABI matches a known standard."
const TOO_MANY_DECIMALS = `This token has more than ${DECIMALS_MAX} decimals. Nulo supports up to ${DECIMALS_MAX}.`

/** A lookup the node answered empty, and a token past the wallet's decimals, have copy of their own; any
 *  other refusal's text is a developer's, for the log. */
const refusalOf = (err: unknown) => {
	if (err instanceof ContractNotFoundError) return "There is no token at this address on this network."
	if (err instanceof TokenDecimalsOutOfRangeError) return TOO_MANY_DECIMALS
	return "Something went wrong. Try again."
}

type WaitOutcome = keyof typeof WAIT_TOASTS | "aborted"
type BalanceWait = ReturnType<typeof createBalanceWait>

/**
 * Subscribes to both service streams BEFORE `addToken` is called, so it cannot miss the events fired
 * while addToken's background handlers still run. Resolves "success" or "error" when the
 * BalanceUpdate task finishes, "timeout" with no terminal event in BALANCE_WAIT_TIMEOUT_MS after the
 * first balance row, "aborted" when ended.
 */
function createBalanceWait(deps: TokenImportDeps, submittingAccount: string) {
	let expectedTokenId: number | null = null
	let pendingTbId: number | null = null
	let timer: ReturnType<typeof setTimeout> | null = null
	let resolveOutcome: ((outcome: WaitOutcome) => void) | null = null

	const promise = new Promise<WaitOutcome>((resolve) => {
		resolveOutcome = (outcome) => {
			if (!resolveOutcome) return
			resolveOutcome = null
			cleanup()
			resolve(outcome)
		}
	})

	const startTimer = () => {
		if (timer !== null) return
		timer = setTimeout(() => resolveOutcome?.("timeout"), BALANCE_WAIT_TIMEOUT_MS)
	}

	const onBalanceAdded = (tb: TokenBalanceInfo) => {
		if (pendingTbId !== null) return
		if (expectedTokenId !== null && tb?.token?.id !== expectedTokenId) return
		if (tb?.account !== submittingAccount) return
		pendingTbId = tb.id
		startTimer()
	}

	const onTaskUpdated = (task: Task) => {
		if (task?.content?.kind !== ContentKind.BalanceUpdate) return
		if (pendingTbId === null || (task.content as BalanceUpdateContent).tbId !== pendingTbId) return
		if (!task.finishedAt) return
		resolveOutcome?.(task.error ? "error" : "success")
	}

	const cleanup = () => {
		deps.tokenBalanceService.onTokenBalanceAdded.remove(onBalanceAdded)
		deps.taskService.onTaskUpdated.remove(onTaskUpdated)
		if (timer !== null) {
			clearTimeout(timer)
			timer = null
		}
	}

	deps.tokenBalanceService.onTokenBalanceAdded.add(onBalanceAdded)
	deps.taskService.onTaskUpdated.add(onTaskUpdated)

	return {
		promise,
		setExpectedToken(tokenId: number) {
			expectedTokenId = tokenId
		},
		seedPending(tbId: number, tokenId: number) {
			expectedTokenId = tokenId
			pendingTbId = tbId
			startTimer()
		},
		abort() {
			resolveOutcome?.("aborted")
		},
	}
}

/** The identity an import runs under, read at its press: the store is reactive and can switch mid-wait. */
type Submission = { profileId: string; networkId: string; chainId: number; account: string; epoch: number }

interface ImportRun {
	deps: TokenImportDeps
	submission: Submission
	wait: BalanceWait
	/** False once the hook is disposed: the import starts no further call. */
	live: () => boolean
	added: (token: TokenInfo, label: string) => Extract<TokenImportOutcome, { kind: "added" }>
	refused: (message: string) => TokenImportOutcome
	waiting: () => void
}

async function listedRefusal(run: ImportRun, contract: string): Promise<TokenImportOutcome | undefined> {
	const listed = await run.deps.tokenService.getTokens(run.submission.profileId, run.submission.chainId)
	if (!run.live()) return ABORTED
	const verdict = contractVerdict(contract, listed)
	return verdict ? run.refused(verdict) : undefined
}

async function addAndWait(run: ImportRun, contract: string): Promise<TokenImportOutcome> {
	const { deps, submission: s, wait } = run
	// A dispose can land in the turn after the listed check.
	if (!run.live()) return ABORTED
	const parsingResult = await deps.tokenService.parseTokenInterface(s.networkId, contract)
	if (!run.live()) return ABORTED
	// Registry-only: an interface no known standard matches is refused; a dApp can still register it
	// with an explicit artifact.
	if (!parsingResult.isComplete) return run.refused(NO_INTERFACE)

	const newToken = await deps.tokenService.addToken(s.profileId, s.networkId, s.account, parsingResult, { origin: "popup" })
	if (!run.live()) return ABORTED
	wait.setExpectedToken(newToken.id)
	// No balance row for this account will ever be created on another chain.
	if (newToken.chainId !== s.chainId) return { ...run.added(newToken, WAIT_TOASTS.success), inScope: false }

	// addToken returns an already-listed token without re-emitting `onTokenAdded`, so a synced row has
	// no event to wait for.
	const existing = await deps.tokenBalanceService.getTokenBalances(newToken.id, s.account)
	if (!run.live()) return ABORTED
	if (existing.length > 0 && (existing[0].updatedAt ?? 0) > 0) return run.added(newToken, WAIT_TOASTS.success)
	// A row created before the subscription saw it: its timer starts now.
	if (existing.length > 0) wait.seedPending(existing[0].id, newToken.id)

	run.waiting()
	const waited = await wait.promise
	// Ended mid-wait; the worker keeps refreshing.
	if (!run.live() || waited === "aborted") return ABORTED
	return run.added(newToken, WAIT_TOASTS[waited])
}

/**
 * The New token import. Callers own the clients' connections; one import runs at a time, and a call
 * while one runs returns `aborted`.
 */
export function useTokenImport(deps: TokenImportDeps) {
	const appStore = useAppStore()
	const { openToast } = useToast()
	const phase = ref<TokenImportPhase>("idle")
	let activeWait: BalanceWait | null = null
	/** Bumped by `abort`, so an import it detached no longer owns `phase` or `activeWait`. */
	let generation = 0
	let disposed = false

	/** Undefined for a moment after a network switch whose chain had no account yet. */
	function submission(): Submission | undefined {
		const { profile, network, account } = appStore
		if (!profile || !network || !account?.address) return undefined
		return {
			profileId: profile.id,
			networkId: network.id,
			chainId: network.chainId,
			account: account.address,
			epoch: appStore.scopeEpoch,
		}
	}

	function importRun(submission: Submission, mine: number, wait: BalanceWait): ImportRun {
		const inScope = () => appStore.scopeEpoch === submission.epoch
		return {
			deps,
			submission,
			wait,
			live: () => !disposed,
			refused: (message) => ({ kind: "refused", message, inScope: inScope() }),
			added: (token, label) => {
				openToast({ kind: "success", label })
				return { kind: "added", token, inScope: inScope() }
			},
			waiting: () => {
				if (mine === generation) phase.value = "loading-balance"
			},
		}
	}

	async function run(contract: string, checkListed: boolean): Promise<TokenImportOutcome> {
		if (phase.value !== "idle" || disposed) return ABORTED
		const s = submission()
		if (!s) return { kind: "refused", message: "Account is still loading. Please wait a moment and try again.", inScope: true }
		const mine = ++generation
		phase.value = "adding"
		const wait = createBalanceWait(deps, s.account)
		activeWait = wait
		const step = importRun(s, mine, wait)
		try {
			const listed = checkListed ? await listedRefusal(step, contract) : undefined
			return listed ?? (await addAndWait(step, contract))
		} catch (err) {
			// The caller's disconnect after `dispose` rejects the call in flight: nobody is left to tell.
			if (disposed) return ABORTED
			console.debug("[new-token] add refused", { reason: err })
			return step.refused(refusalOf(err))
		} finally {
			wait.abort()
			release(mine)
		}
	}

	/** Frees `phase` for the next import, unless `abort` already handed it on. */
	function release(mine: number) {
		if (mine !== generation) return
		activeWait = null
		phase.value = "idle"
	}

	/** Detaches the running import: its wait ends and `phase` frees, but a parse in flight still goes on
	 *  to add (`dispose` stops that). */
	function abort() {
		activeWait?.abort()
		activeWait = null
		generation++
		phase.value = "idle"
	}

	return {
		phase,
		/** The popup's submit: its field has already judged `contract`. */
		importToken: (contract: string) => run(contract, false),
		/** The field's check against the listed tokens, then the same import. */
		importPasted: (contract: string) => run(contract, true),
		abort,
		/** Terminal: ends the wait, and an import in flight starts no further call. */
		dispose() {
			disposed = true
			abort()
		},
	}
}
