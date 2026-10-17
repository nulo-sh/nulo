/**
 * Coverage focus: a single malformed note must NOT blank out the entire list.
 * The failure mode under test is the silent-render symptom the user reported
 * on `Settings → Developer → Account State → Notes` — fetch succeeded with
 * non-empty results, but no cards rendered. Root cause class: `parseNote`
 * throwing on one entry crashed the whole list. Fix: per-note try/catch
 * surfacing the bad entry as `renderError`.
 */

import { describe, expect, test, vi } from "vitest"
import { LoggerStore } from "@/wallet/logger"
import { loggedAfter } from "../../../../tests/helpers/logged"
import { ConfigStore } from "@/wallet/config"
import { NoteStatus } from "@aztec-labs/stdlib/note"
import { computeUniqueNoteHash } from "@aztec-labs/stdlib/hash"
import { NoteService } from "./service"
import type { Note } from "./spec"

// Barretenberg does not load under vitest, so the protocol hashes are deterministic fakes that name
// their inputs.
vi.mock("@aztec-labs/stdlib/hash", async (importOriginal) => ({
	...(await importOriginal<typeof import("@aztec-labs/stdlib/hash")>()),
	siloNoteHash: vi.fn(async (contract: unknown, noteHash: unknown) => `silo(${contract},${noteHash})`),
	computeUniqueNoteHash: vi.fn(async (nonce: unknown, siloed: unknown) => ({ toString: () => `unique(${nonce},${siloed})` })),
}))

type Fake<T> = T extends object ? { [K in keyof T]?: Fake<T[K]> } : T

/** Minimal NoteDao surface NoteService.parseNote touches. */
function fakeNoteDao(
	overrides: Partial<{
		contract: string
		slot: string
		tx: string
		items: unknown[]
		owner: string
		randomness: string
		nonce: string
		noteHash: string
	}> = {},
): unknown {
	const contract = overrides.contract ?? "0xc1"
	const slot = overrides.slot ?? "0x1"
	const tx = overrides.tx ?? "0xabc"
	const items = overrides.items ?? ["0x01", "0x02"]
	const owner = overrides.owner ?? "0xowner"
	const randomness = overrides.randomness ?? "0xrand"
	return {
		contractAddress: { toString: () => contract, toBigInt: () => BigInt(7) },
		storageSlot: { toString: () => slot },
		txHash: { toString: () => tx },
		owner: { toString: () => owner },
		randomness: { toString: () => randomness },
		note: { items: items.map((x) => ({ toString: () => String(x) })) },
		noteNonce: { toString: () => overrides.nonce ?? "0xnonce" },
		noteHash: { toString: () => overrides.noteHash ?? "0xnotehash" },
		siloedNullifier: { toString: () => "0xnullifier" },
		l2BlockNumber: 5,
		txIndexInBlock: 1,
		noteIndexInTx: 2,
	}
}

/** Note with a corrupted `note.items` — `.map` throws. Models the real
 *  failure observed in the field where one bad note crashes the whole page. */
function brokenNoteDao(): unknown {
	return {
		contractAddress: { toString: () => "0xbad" },
		storageSlot: { toString: () => "0x9" },
		txHash: { toString: () => "0xff" },
		note: {
			get items(): never {
				throw new Error("decode failed")
			},
		},
		noteNonce: { toString: () => "0xbadnonce" },
		noteHash: { toString: () => "0xbadhash" },
		siloedNullifier: { toString: () => "0xbadnullifier" },
	}
}

type ServiceHooks = {
	service: NoteService
	logger: LoggerStore
	setNotes: (n: unknown[]) => void
	setSchemas: (s: Record<string, Record<string, unknown>>) => void
	setClassIdForContract: (contract: string, classId: string | undefined) => void
}

function makeService(): ServiceHooks {
	const config = new ConfigStore()
	const logger = new LoggerStore(config)
	const service = new NoteService(logger)

	const noteList: unknown[] = []
	let schemas: Record<string, Record<string, unknown>> = {}
	const classIdByContract = new Map<string, string | undefined>()

	const fakePxe = {
		getContracts: vi.fn(async () => [{ toBigInt: () => BigInt(7) }]),
		getNotes: vi.fn(async () => noteList),
		getNoteSchemas: vi.fn(async () => schemas),
		getContractInstance: vi.fn(async (_network: unknown, address: { toString: () => string }) => {
			const classId = classIdByContract.get(address.toString())
			if (classId === undefined) return undefined
			return { currentContractClassId: { toString: () => classId } }
		}),
	}
	const fakeNetworkService = {
		getNetwork: vi.fn(async () => ({
			id: "n",
			profileId: "p",
			chainId: 0,
			name: "Local",
			primaryEndpointId: "e1",
			endpoints: [{ id: "e1", rpcUrl: "http://x" }],
		})),
	}

	;(service as unknown as Fake<{ pxeService: unknown; networkService: unknown }>).pxeService = fakePxe
	;(service as unknown as Fake<{ pxeService: unknown; networkService: unknown }>).networkService = fakeNetworkService
	;(service as unknown as { isInitialized: boolean }).isInitialized = true
	;(service as unknown as { ensureInitialized: () => Promise<void> }).ensureInitialized = async () => {}

	return {
		service,
		logger,
		setNotes: (n) => {
			noteList.length = 0
			noteList.push(...n)
		},
		setSchemas: (s) => {
			schemas = s
		},
		setClassIdForContract: (contract, classId) => {
			classIdByContract.set(contract, classId)
		},
	}
}

describe("NoteService.getNotes", () => {
	test("returns parsed entries for healthy notes", async () => {
		const { service, setNotes } = makeService()
		setNotes([fakeNoteDao(), fakeNoteDao({ contract: "0xc2" })])

		const result = await service.getNotes("n", "0x0000000000000000000000000000000000000000000000000000000000000001")

		expect(result).toHaveLength(2)
		expect(result[0].contract).toBe("0xc1")
		expect(result[1].contract).toBe("0xc2")
		expect(result[0].rawContent).toEqual(["0x01", "0x02"])
		expect(result[0].renderError).toBeUndefined()
	})

	test("a single malformed note does NOT blank out the rest of the list", async () => {
		const { service, setNotes } = makeService()
		setNotes([fakeNoteDao({ contract: "0xa" }), brokenNoteDao(), fakeNoteDao({ contract: "0xb" })])

		const result = await service.getNotes("n", "0x0000000000000000000000000000000000000000000000000000000000000001")

		expect(result).toHaveLength(3)
		expect(result.map((n: Note) => n.contract)).toEqual(["0xa", "0xbad", "0xb"])
		expect(result[1].renderError).toBeDefined()
		expect(result[1].renderError).toMatch(/decode failed/)
		expect(result[1].rawContent).toEqual([])
		// healthy entries on either side are unaffected
		expect(result[0].renderError).toBeUndefined()
		expect(result[2].renderError).toBeUndefined()
	})

	test("malformed entry preserves contract/slot/tx fields when those parse ok", async () => {
		const { service, logger, setNotes } = makeService()
		setNotes([brokenNoteDao()])

		const result = await service.getNotes("n", "0x0000000000000000000000000000000000000000000000000000000000000001")

		expect(result).toHaveLength(1)
		expect(result[0].contract).toBe("0xbad")
		expect(result[0].storageSlot).toBe("0x9")
		expect(result[0].txHash).toBe("0xff")
		expect(result[0].renderError).toBeDefined()
		expect(loggedAfter(logger, "Failed to parse note")).toEqual([{ error: { name: "Error", message: "decode failed" } }])
	})

	test("propagates errors from the upstream PXE fetch", async () => {
		const { service } = makeService()
		;(service as unknown as { pxeService: { getContracts: () => Promise<unknown[]> } }).pxeService = {
			getContracts: () => Promise.reject(new Error("pxe down")),
		}

		await expect(service.getNotes("n", "0x0000000000000000000000000000000000000000000000000000000000000001")).rejects.toThrow(
			/PXE request failed/,
		)
	})
})

describe("NoteService reads for incoming reconciliation", () => {
	const acc = "0x0000000000000000000000000000000000000000000000000000000000000001"
	const contract = "0x0000000000000000000000000000000000000000000000000000000000000002"
	const pxeOf = (service: NoteService) =>
		(service as unknown as { pxeService: { getNotes: ReturnType<typeof vi.fn>; getSyncedBlockHeader?: unknown } }).pxeService

	test("getNotesRaw reads unspent notes by default and spent ones too on request", async () => {
		const { service } = makeService()
		await service.getNotesRaw("n", acc, contract)
		await service.getNotesRaw("n", acc, contract, "active-or-nullified")
		const statuses = pxeOf(service).getNotes.mock.calls.map(([, filter]) => (filter as { status: NoteStatus }).status)
		expect(statuses).toEqual([NoteStatus.ACTIVE, NoteStatus.ACTIVE_OR_NULLIFIED])
	})

	test("getSyncedBlock returns the synced header's number and hash", async () => {
		const { service } = makeService()
		const hash = `0x${"ab".repeat(32)}`
		pxeOf(service).getSyncedBlockHeader = vi.fn(async () => ({
			getBlockNumber: () => 42,
			hash: async () => ({ toString: () => hash }),
		}))
		expect(await service.getSyncedBlock("n")).toEqual({ number: 42, hash })
	})
})

describe("NoteService.getNotesRaw — note identity", () => {
	const acc = "0x0000000000000000000000000000000000000000000000000000000000000001"

	test("each note, parsed or not, carries the unique hash of its nonce, contract and note hash, and never its nullifier", async () => {
		const { service, setNotes } = makeService()
		setNotes([fakeNoteDao({ contract: "0xa", nonce: "0xn1", noteHash: "0xh1" }), brokenNoteDao()])

		const raw = await service.getNotesRaw("n", acc)

		expect(raw.map((n) => n.uniqueNoteHash)).toEqual(["unique(0xn1,silo(0xa,0xh1))", "unique(0xbadnonce,silo(0xbad,0xbadhash))"])
		expect(raw[1].renderError).toMatch(/decode failed/)
		expect(JSON.stringify(raw)).not.toContain("nullifier")
	})

	test("a note whose identity cannot be computed rejects the read", async () => {
		const { service, setNotes } = makeService()
		setNotes([fakeNoteDao({ contract: "0xa" }), fakeNoteDao({ contract: "0xb" })])
		vi.mocked(computeUniqueNoteHash).mockRejectedValueOnce(new Error("hash unavailable"))

		await expect(service.getNotesRaw("n", acc)).rejects.toThrow("hash unavailable")
	})
})

describe("NoteService.getNotes — schema-decoded content", () => {
	const acc = "0x0000000000000000000000000000000000000000000000000000000000000001"

	test("UintNote at known classId+slot decodes value as bigint string", async () => {
		const { service, setNotes, setSchemas, setClassIdForContract } = makeService()
		setClassIdForContract("0xtoken", "0xCLASS")
		setSchemas({
			"0xCLASS": {
				"0x3": { noteName: "UintNote", contractName: "Aztec Token", fields: [{ name: "value", type: "u128" }] },
			},
		})
		setNotes([fakeNoteDao({ contract: "0xtoken", slot: "0x3", items: ["0x64"], owner: "0xown", randomness: "0xr1" })])

		const [note] = await service.getNotes("n", acc)
		expect(note.type).toBe("UintNote")
		expect(note.contractName).toBe("Aztec Token")
		expect(note.content).toEqual({ value: "100", owner: "0xown", randomness: "0xr1" })
	})

	test("schema without contractName leaves Note.contractName undefined (back-compat)", async () => {
		// Schemas predating the contractName addition shouldn't break;
		// the field is optional on Note.
		const { service, setNotes, setSchemas, setClassIdForContract } = makeService()
		setClassIdForContract("0xc", "0xCLASS")
		setSchemas({
			"0xCLASS": { "0x3": { noteName: "UintNote", fields: [{ name: "value", type: "u128" }] } },
		})
		setNotes([fakeNoteDao({ contract: "0xc", slot: "0x3", items: ["0x01"] })])

		const [note] = await service.getNotes("n", acc)
		expect(note.type).toBe("UintNote")
		expect(note.contractName).toBeUndefined()
	})

	test("NFTNote at known classId+slot keeps token_id as hex field", async () => {
		const { service, setNotes, setSchemas, setClassIdForContract } = makeService()
		setClassIdForContract("0xnft", "0xNFTCLASS")
		setSchemas({
			"0xNFTCLASS": {
				"0x7": { noteName: "NFTNote", fields: [{ name: "token_id", type: "field" }] },
			},
		})
		setNotes([fakeNoteDao({ contract: "0xnft", slot: "0x7", items: ["0xabc123"], owner: "0xown", randomness: "0xr2" })])

		const [note] = await service.getNotes("n", acc)
		expect(note.type).toBe("NFTNote")
		expect(note.content).toEqual({ token_id: "0xabc123", owner: "0xown", randomness: "0xr2" })
	})

	test("padded storage slot still matches its canonical short-hex schema key", async () => {
		const { service, setNotes, setSchemas, setClassIdForContract } = makeService()
		setClassIdForContract("0xtoken", "0xCLASS")
		setSchemas({
			"0xCLASS": {
				"0x3": { noteName: "UintNote", fields: [{ name: "value", type: "u128" }] },
			},
		})
		setNotes([
			fakeNoteDao({
				contract: "0xtoken",
				slot: "0x0000000000000000000000000000000000000000000000000000000000000003",
				items: ["0x05"],
			}),
		])

		const [note] = await service.getNotes("n", acc)
		expect(note.type).toBe("UintNote")
		expect(note.content?.value).toBe("5")
	})

	test("unknown classId leaves note with raw rendering only", async () => {
		const { service, setNotes, setSchemas, setClassIdForContract } = makeService()
		setClassIdForContract("0xunknown", "0xUNKNOWNCLASS")
		setSchemas({
			"0xCLASS": { "0x3": { noteName: "UintNote", fields: [{ name: "value", type: "u128" }] } },
		})
		setNotes([fakeNoteDao({ contract: "0xunknown", slot: "0x3", items: ["0x64"] })])

		const [note] = await service.getNotes("n", acc)
		expect(note.type).toBeUndefined()
		expect(note.content).toBeUndefined()
		expect(note.rawContent).toEqual(["0x64"])
	})

	test("known classId, unknown slot leaves note with raw rendering only", async () => {
		const { service, setNotes, setSchemas, setClassIdForContract } = makeService()
		setClassIdForContract("0xtoken", "0xCLASS")
		setSchemas({
			"0xCLASS": { "0x3": { noteName: "UintNote", fields: [{ name: "value", type: "u128" }] } },
		})
		setNotes([fakeNoteDao({ contract: "0xtoken", slot: "0x99", items: ["0x42"] })])

		const [note] = await service.getNotes("n", acc)
		expect(note.type).toBeUndefined()
		expect(note.content).toBeUndefined()
		expect(note.rawContent).toEqual(["0x42"])
	})

	test("classId lookup is batched: single fetch per unique contract", async () => {
		const { service, setNotes, setSchemas, setClassIdForContract } = makeService()
		setClassIdForContract("0xtoken", "0xCLASS")
		setSchemas({
			"0xCLASS": { "0x3": { noteName: "UintNote", fields: [{ name: "value", type: "u128" }] } },
		})
		setNotes([
			fakeNoteDao({ contract: "0xtoken", slot: "0x3", items: ["0x01"], owner: "0xa", randomness: "0xr1" }),
			fakeNoteDao({ contract: "0xtoken", slot: "0x3", items: ["0x02"], owner: "0xb", randomness: "0xr2" }),
			fakeNoteDao({ contract: "0xtoken", slot: "0x3", items: ["0x03"], owner: "0xc", randomness: "0xr3" }),
		])

		const result = await service.getNotes("n", acc)
		expect(result).toHaveLength(3)
		expect(
			(service as unknown as { pxeService: { getContractInstance: { mock: { calls: unknown[] } } } }).pxeService.getContractInstance
				.mock.calls,
		).toHaveLength(1)
	})

	test("schema fetch failure falls back to raw rendering, not list-blanking error", async () => {
		const { service, setNotes } = makeService()
		;(service as unknown as { pxeService: { getNoteSchemas: () => Promise<unknown> } }).pxeService.getNoteSchemas = () =>
			Promise.reject(new Error("offscreen unreachable"))
		setNotes([fakeNoteDao({ items: ["0x07"] })])

		const result = await service.getNotes("n", acc)
		expect(result).toHaveLength(1)
		expect(result[0].rawContent).toEqual(["0x07"])
		expect(result[0].renderError).toBeUndefined()
		expect(result[0].type).toBeUndefined()
	})
})
