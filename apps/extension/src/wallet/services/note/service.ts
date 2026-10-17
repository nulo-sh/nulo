// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { NoteStatus, type NoteDao } from "@aztec-labs/stdlib/note"
import { computeUniqueNoteHash, siloNoteHash } from "@aztec-labs/stdlib/hash"
import { canonicalSlotHex, type NoteFieldType, type NoteSchema } from "@nulo/aztec-runtime/pxe"
import type { ILogger } from "@/wallet/logger"
import type { ServiceCollection, ServiceSpec } from "@/wallet/base"
import { Service, defineRpcMethods } from "@nulo/extension-messaging/background"
import { NetworkService, networkInfoFrom, type Network } from "@/wallet/services/network/service"
import { PxeServiceClient } from "@/wallet/services/pxe/client"
import { getErrorMessage } from "@nulo/wallet-core/utils"
import { type Methods, type Note, type NoteReadStatus, type RawNote, type SyncedBlock, NOTE_SERVICE_NAME } from "./spec"

export * from "./spec"

/**
 * Decode a single packed note field. UintNote/NFTNote shapes only need
 * one Fr per field at the current lockfile (`u128 = 1 Fr`); future
 * shapes that pack multiple Frs into one field will need work here.
 */
function decodeField(value: { toString: () => string }, type: NoteFieldType): string {
	const raw = value.toString()
	switch (type) {
		case "u128":
			return BigInt(raw).toString()
		case "field":
			return raw
		case "address":
			try {
				return AztecAddress.fromFieldUnsafe({ toString: () => raw } as never).toString()
			} catch {
				return raw
			}
	}
}

/** A note field whose read throws renders as "" / 0 instead of failing the whole row. */
const safeString = (read: () => { toString(): string }): string => {
	try {
		return read().toString()
	} catch {
		return ""
	}
}
const safeNumber = (read: () => unknown): number => {
	try {
		return Number(read())
	} catch {
		return 0
	}
}

export class NoteService extends Service<Methods> implements ServiceSpec<Methods> {
	protected readonly rpcMethods = defineRpcMethods<Methods>()("getNotes", "getNotesRaw", "getBlockTimestamp", "getSyncedBlock")
	public static name = NOTE_SERVICE_NAME

	private pxeService: PxeServiceClient = null!
	private networkService: NetworkService = null!

	public constructor(logger: ILogger) {
		super(NOTE_SERVICE_NAME, logger)
	}

	protected async init(services: ServiceCollection) {
		this.pxeService = new PxeServiceClient(this.logger)
		this.networkService = services.get(NetworkService.name)
	}

	public async getNotes(networkId: string, account: string, contract?: string): Promise<Note[]> {
		const read = await this.readNotes(networkId, account, contract, "active")
		return read.map(({ note }) => note)
	}

	/**
	 * Chain-derived UTC seconds for an L2 block. Returns `undefined` when
	 * the node can't resolve it. Activity-feed consumers use this so their
	 * sort/render survives token remove + re-add (re-indexed records get
	 * the same chain timestamp; without this, they'd jump to `Date.now()`).
	 */
	public async getBlockTimestamp(networkId: string, blockNumber: number): Promise<number | undefined> {
		await this.ensureInitialized()
		try {
			const network = await this.networkService.getNetwork(networkId)
			return await this.pxeService.getBlockTimestamp(networkInfoFrom(network), blockNumber)
		} catch (error) {
			this.logWarn(`getBlockTimestamp failed for block ${blockNumber}`, error)
			return undefined
		}
	}

	public async getSyncedBlock(networkId: string): Promise<SyncedBlock> {
		await this.ensureInitialized()
		const network = await this.networkService.getNetwork(networkId)
		const header = await this.pxeService.getSyncedBlockHeader(networkInfoFrom(network))
		return { number: Number(header.getBlockNumber()), hash: (await header.hash()).toString() }
	}

	public async getNotesRaw(networkId: string, account: string, contract?: string, status: NoteReadStatus = "active"): Promise<RawNote[]> {
		const read = await this.readNotes(networkId, account, contract, status)
		const res: RawNote[] = []
		for (const { dao, note } of read) {
			res.push({
				...note,
				// Outside the per-note catch on purpose: a note without its identity must fail the read,
				// since a reader that reconciles rows takes a missing note for a vanished one.
				uniqueNoteHash: (
					await computeUniqueNoteHash(dao.noteNonce, await siloNoteHash(dao.contractAddress, dao.noteHash))
				).toString(),
				noteHash: safeString(() => dao.noteHash),
				l2BlockNumber: safeNumber(() => dao.l2BlockNumber),
				txIndexInBlock: safeNumber(() => dao.txIndexInBlock),
				noteIndexInTx: safeNumber(() => dao.noteIndexInTx),
			})
		}
		return res
	}

	/** Fetches and parses the notes. Each note parses in isolation, so a single malformed note can't
	 *  blank out the entire page: it surfaces as a `renderError` card on the UI instead. */
	private async readNotes(
		networkId: string,
		account: string,
		contract: string | undefined,
		status: NoteReadStatus,
	): Promise<Array<{ dao: NoteDao; note: Note }>> {
		await this.ensureInitialized()
		const network = await this.networkService.getNetwork(networkId)
		const noteStatus = status === "active-or-nullified" ? NoteStatus.ACTIVE_OR_NULLIFIED : NoteStatus.ACTIVE
		let notes: NoteDao[]
		try {
			notes = contract
				? await this.fetchContractNotes(network, account, AztecAddress.fromStringUnsafe(contract), noteStatus)
				: await this.fetchKnownContractsNotes(network, account, noteStatus)
		} catch (error) {
			this.logError("Failed to fetch incoming notes", error)
			throw new Error("PXE request failed")
		}

		// Resolve contract → classId once per unique address; needed to look
		// up the matching note schema. PXE caches contract instances, but
		// each call still crosses to offscreen — a per-batch cache cuts
		// round-trips when many notes share a contract.
		const classIdByContract = new Map<string, string | undefined>()
		const noteSchemas = await this.loadNoteSchemasSafe()

		const res: Array<{ dao: NoteDao; note: Note }> = []
		for (const dao of notes) {
			try {
				res.push({ dao, note: await this.parseNote(network, dao, classIdByContract, noteSchemas) })
			} catch (error) {
				const message = getErrorMessage(error)
				this.logError("Failed to parse note", { error })
				res.push({
					dao,
					note: {
						contract: safeString(() => dao.contractAddress),
						storageSlot: safeString(() => dao.storageSlot),
						txHash: safeString(() => dao.txHash),
						rawContent: [],
						renderError: message,
					},
				})
			}
		}
		return res
	}

	/** Schema fetch is best-effort: a failed lookup just leaves notes with
	 *  raw rendering. We don't want a transient PXE blip blanking the list. */
	private async loadNoteSchemasSafe(): Promise<Record<string, Record<string, NoteSchema>>> {
		try {
			return await this.pxeService.getNoteSchemas()
		} catch (error) {
			this.logWarn("Failed to load note schemas; falling back to raw rendering", error)
			return {}
		}
	}

	private async fetchKnownContractsNotes(network: Network, account: string, status: NoteStatus): Promise<NoteDao[]> {
		const res = []
		const knownContracts = await this.pxeService.getContracts(networkInfoFrom(network))
		for (const contract of knownContracts.filter((x) => x.toBigInt() > 6n)) {
			res.push(...(await this.fetchContractNotes(network, account, contract, status)))
		}
		return res
	}

	private async fetchContractNotes(network: Network, account: string, contract: AztecAddress, status: NoteStatus): Promise<NoteDao[]> {
		return await this.pxeService.getNotes(networkInfoFrom(network), {
			contractAddress: contract,
			status,
			scopes: [AztecAddress.fromStringUnsafe(account)],
		})
	}

	private async parseNote(
		network: Network,
		note: NoteDao,
		classIdByContract: Map<string, string | undefined>,
		noteSchemas: Record<string, Record<string, NoteSchema>>,
	): Promise<Note> {
		const contract = note.contractAddress.toString()
		const storageSlot = note.storageSlot.toString()
		const txHash = note.txHash.toString()
		const rawContent = note.note.items.map((x) => x.toString())

		const schema = await this.lookupSchema(network, note, classIdByContract, noteSchemas)
		const content = this.buildContent(note, schema)

		return {
			contract,
			storageSlot,
			txHash,
			rawContent,
			...(schema ? { type: schema.noteName, contractName: schema.contractName } : {}),
			...(content ? { content } : {}),
		}
	}

	/** Look up `(classId, slotHex)` in the static schema map. Returns
	 *  `undefined` for any unknown class or slot — caller falls back to
	 *  raw items rendering. */
	private async lookupSchema(
		network: Network,
		note: NoteDao,
		classIdByContract: Map<string, string | undefined>,
		noteSchemas: Record<string, Record<string, NoteSchema>>,
	): Promise<NoteSchema | undefined> {
		const contract = note.contractAddress.toString()
		if (!classIdByContract.has(contract)) {
			classIdByContract.set(contract, await this.fetchClassId(network, note.contractAddress))
		}
		const classId = classIdByContract.get(contract)
		if (!classId) return undefined
		const slotHex = canonicalSlotHex(note.storageSlot.toString())
		return noteSchemas[classId]?.[slotHex]
	}

	private async fetchClassId(network: Network, address: AztecAddress): Promise<string | undefined> {
		try {
			const instance = await this.pxeService.getContractInstance(networkInfoFrom(network), address)
			return instance?.currentContractClassId.toString()
		} catch (error) {
			this.logWarn("Failed to load contract instance for note schema lookup", address.toString(), error)
			return undefined
		}
	}

	/** Build the named-fields `content` map. Always includes `owner` and
	 *  `randomness` (side-channel from NoteDao). Schema-decoded fields
	 *  fill in front; absence of a schema returns `undefined` (caller
	 *  renders raw items). */
	private buildContent(note: NoteDao, schema: NoteSchema | undefined): Record<string, string> | undefined {
		if (!schema) return undefined
		const items = note.note.items
		const out: Record<string, string> = {}
		for (let i = 0; i < schema.fields.length; i++) {
			const field = schema.fields[i]
			const item = items[i]
			if (!item) continue
			out[field.name] = decodeField(item, field.type)
		}
		try {
			out.owner = note.owner.toString()
		} catch {
			// owner missing on malformed daos — skip
		}
		try {
			out.randomness = note.randomness.toString()
		} catch {
			// randomness missing — skip
		}
		return out
	}
}
