/**
 * A profile or account purge racing a balance commit that is already past its re-read: the real
 * service, queue and repository over an in-memory `chrome.storage`, with the projector and peers
 * stubbed. Whatever order the purge's delete and the commit's write land in, no purged row survives
 * and none is emitted.
 */

import { describe, expect, test } from "vitest"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { ACCOUNT_SERVICE_NAME } from "@/wallet/services/account/spec"
import { EXECUTION_SERVICE_NAME } from "@/wallet/services/execution/spec"
import { NETWORK_SERVICE_NAME } from "@/wallet/services/network/spec"
import { ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { PROFILE_SERVICE_NAME } from "@/wallet/services/profile/spec"
import { TASK_SERVICE_NAME } from "@/wallet/services/task/spec"
import { TOKEN_SERVICE_NAME } from "@/wallet/services/token/spec"
import { TRANSACTION_SERVICE_NAME } from "@/wallet/services/transaction/spec"
import { svc } from "../composition-harness"
import type { ProjectedBalance } from "./balance-projector"
import { BalanceRepository } from "./balance-repository"
import { TokenBalanceService } from "./service"
import { TOKEN_BALANCE_STORAGE_ROOT, type TokenBalanceRaw } from "./spec"

const TOKEN = { id: 100, profileId: "A", chainId: 1, contract: "0xtok100", name: "T", symbol: "T", decimals: 18 }
const ROW: TokenBalanceRaw = {
	id: 1,
	token: 100,
	account: "0xa",
	profileId: "A",
	chainId: 1,
	contract: "0xtok100",
	privateBalance: "0",
	publicBalance: "0",
	updatedAt: 5,
}
/** Matches both purges' raw predicates and fails the row schema. */
const MALFORMED = { token: 100, profileId: "A", chainId: 1, account: "0xa", junk: true }
const key = (id: string) => `${TOKEN_BALANCE_STORAGE_ROOT}@${id}`

const ok = (b: TokenBalanceRaw): ProjectedBalance => ({ kind: "ok", id: b.id, privateBalance: "7", publicBalance: "7" })
const failed = (b: TokenBalanceRaw): ProjectedBalance => ({ kind: "error", id: b.id, error: "node unreachable", transient: false })

type Purge = (service: TokenBalanceService) => Promise<void>
const purgeTokens: Purge = (s) => s.purgeForTokens([100], "A")
const purgeAccounts: Purge = (s) => s.purgeForAccounts([{ chainId: 1, address: "0xa" }], "A")

async function world(project: (b: TokenBalanceRaw) => ProjectedBalance = ok) {
	const api = new FakeBrowserApi()
	api.reset()
	await new BalanceRepository(api).set(ROW)
	const failures: string[] = []
	const services = new ServiceCollection()
	services.add(
		svc(PROFILE_SERVICE_NAME, {
			onActiveProfileChanged: new EventHandler(),
			getActiveProfile: async () => ({ id: "A", name: "A" }),
			getDeletionState: () => new ProfileDeletionState(),
		}),
	)
	services.add(svc(NETWORK_SERVICE_NAME, {}))
	services.add(
		svc(ACCOUNT_SERVICE_NAME, {
			registerAccountPurgeSubscriber: () => {},
			onAccountAdded: new EventHandler(),
			getAccountsRaw: async () => [{ address: "0xa", chainId: 1, index: 0, profileId: "A" }],
		}),
	)
	services.add(
		svc(TOKEN_SERVICE_NAME, {
			onTokenAdded: new EventHandler(),
			onTokenDeleted: new EventHandler(),
			getTokensRaw: async () => [TOKEN],
		}),
	)
	services.add(svc(TRANSACTION_SERVICE_NAME, { onTransactionUpdated: new EventHandler() }))
	services.add(svc(EXECUTION_SERVICE_NAME, {}))
	let nextTask = 0
	services.add(
		svc(TASK_SERVICE_NAME, {
			createNewTask: () => ({ id: `t${++nextTask}` }),
			startNewTask: () => ({ id: `t${++nextTask}` }),
			hasTask: () => true,
			startTask: () => {},
			completeTask: () => {},
			failTask: (_: string, message: string) => failures.push(message),
		}),
	)
	const service = new TokenBalanceService(new LoggerStore(new ConfigStore()), api, { subscribe: () => ({ cancel: () => {} }) } as never)
	services.add(service)
	await services.start()
	const emitted: number[] = []
	service.onTokenBalanceUpdated.add((b) => {
		emitted.push(b.id)
	})
	// biome-ignore lint/suspicious/noExplicitAny: test-only reach-in to the queue and repository init wired
	const internals = service as any
	internals.queue.projector = { project: async (batch: TokenBalanceRaw[]) => batch.map(project) }
	const repo = internals.repo as BalanceRepository
	const stored = async (id: string) => (await api.storage.local.get(key(id)))[key(id)]
	return { api, service, repo, queue: internals.queue as { tick(): Promise<void> }, failures, emitted, stored }
}

/** Parks the commit's re-read after storage answered, runs `during`, then lets the commit go on. */
async function syncWithReReadParked(w: Awaited<ReturnType<typeof world>>, during: () => Promise<void>) {
	await w.service.refreshTokenBalance(ROW.id)
	const realGet = w.repo.get.bind(w.repo)
	let reached!: () => void
	const parked = new Promise<void>((r) => (reached = r))
	let release!: () => void
	const gate = new Promise<void>((r) => (release = r))
	w.repo.get = async (id) => {
		const row = await realGet(id)
		w.repo.get = realGet
		reached()
		await gate
		return row
	}
	const ticking = w.queue.tick()
	await parked
	await during()
	release()
	await ticking
}

describe("a purge racing a balance commit", () => {
	test("control: with no purge the commit writes the row and emits once", async () => {
		const w = await world()
		await syncWithReReadParked(w, async () => {})
		expect(JSON.parse((await w.stored("1")) as string)).toMatchObject({ privateBalance: "7" })
		expect(w.emitted).toEqual([1])
		expect(w.failures).toEqual([])
	})

	test("the deletion purge lands while the commit is past its re-read: no row, the task fails, nothing is emitted", async () => {
		const w = await world()
		await syncWithReReadParked(w, () => purgeTokens(w.service))
		expect(await w.stored("1")).toBeUndefined()
		expect(w.failures).toEqual(["Balance record deleted mid-sync"])
		expect(w.emitted).toEqual([])
	})

	test.each([
		["a projected balance", ok],
		["a sync failure record", failed],
	])("storage applying the purge's delete before %s's write: the write is undone and not emitted", async (_, project) => {
		const w = await world(project)
		await w.service.refreshTokenBalance(ROW.id)
		const realSet = w.repo.set.bind(w.repo)
		w.repo.set = async (row) => {
			w.repo.set = realSet
			await purgeTokens(w.service)
			await realSet(row)
		}
		await w.queue.tick()
		expect(await w.stored("1")).toBeUndefined()
		expect(w.emitted).toEqual([])
	})

	test.each([
		["purgeForTokens", purgeTokens],
		["purgeForAccounts", purgeAccounts],
	])("%s deleting the row through its malformed pass fences it: the commit writes nothing back", async (_, purge) => {
		const w = await world()
		await syncWithReReadParked(w, async () => {
			await w.api.storage.local.set({ [key("1")]: JSON.stringify(MALFORMED) })
			await purge(w.service)
		})
		expect(await w.stored("1")).toBeUndefined()
		expect(w.failures).toEqual(["Balance record deleted mid-sync"])
		expect(w.emitted).toEqual([])
	})

	test('a malformed row at key "01" fences nothing: live row 1 still commits and emits', async () => {
		const w = await world()
		await w.api.storage.local.set({ [key("01")]: JSON.stringify({ ...MALFORMED, token: 200 }) })
		await syncWithReReadParked(w, () => w.service.purgeForTokens([200], "A"))
		expect(await w.stored("01")).toBeUndefined()
		expect(JSON.parse((await w.stored("1")) as string)).toMatchObject({ privateBalance: "7" })
		expect(w.emitted).toEqual([1])
	})
})
