/**
 * What a fee run need not wait for twice. A run builds its request once or twice.
 *
 * Of the node, every build asks the same independent questions: the predicted worst minimum fee,
 * each called contract's class and the account's initialization nullifier. Asked one after another
 * each costs the node's full round trip, so `forBuild` sends a build's reads together, to travel
 * while the PXE hands over the build's artifacts. Each build still makes its own reads: no node
 * answer outlives the build that asked for it, so a later build, and the cap priced after a
 * simulation, read the chain as it is then, from the endpoint that serves them then.
 *
 * Of the PXE: each called class's artifact, the largest value a build carries across the offscreen
 * boundary. A class id names its artifact's content, so a run's later build takes the artifact its
 * first build fetched. A run is one operation under one fence, and holds nothing once closed, so
 * no artifact is ever served to another profile or chain.
 */

import type { ContractArtifact } from "@aztec-labs/stdlib/abi"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import type { IAccountContract } from "@nulo/aztec-runtime/account"
import { predictedWorstMinFees } from "@nulo/aztec-runtime/fee-juice"

/** The reads one build asks once. */
const ASKED_ONCE: ReadonlySet<PropertyKey> = new Set([
	"getPredictedMinFees",
	"getCurrentMinFees",
	"getContract",
	"getNullifierMembershipWitness",
])

/** What a build is about to ask, so `forBuild` can ask it first. */
export type BuildReads = {
	/** The account whose request is built: its initialization nullifier is read. */
	readonly account: Pick<IAccountContract, "requiresInitialization">
	/** The contracts the request calls: each one's current class is read. */
	readonly contracts: readonly string[]
	/** False when the caller supplied its own fee cap, and the build reads no minimum fee. */
	readonly minFees: boolean
}

type Answers = Map<string, Promise<unknown>>

export class RunReads {
	private open = true
	private readonly artifacts = new Map<string, Promise<[string, ContractArtifact]>>()

	/**
	 * The node one build reads through, with that build's independent reads already sent. It
	 * answers them to this build alone and is never handed on: what a build returns carries `node`
	 * itself. A read that fails here is asked again by the build, which reports it where it always
	 * did. Call it only once the build may read: after its chain identity assert.
	 */
	public forBuild(node: AztecNode, reads: BuildReads): AztecNode {
		if (!this.open) return node
		const answers: Answers = new Map()
		const build = new Proxy(node, { get: (target, prop) => member(target, prop, answers) })
		const sent: Promise<unknown>[] = [reads.account.requiresInitialization(build)]
		if (reads.minFees) sent.push(predictedWorstMinFees(build))
		for (const contract of reads.contracts) sent.push(classOf(build, contract))
		for (const read of sent) read.catch(() => {})
		return build
	}

	/** The artifact of `classId`, fetched once per run. A failed fetch is not kept. */
	public artifact(classId: string, fetch: () => Promise<[string, ContractArtifact]>): Promise<[string, ContractArtifact]> {
		if (!this.open) return fetch()
		const known = this.artifacts.get(classId)
		if (known) return known
		const fetched = fetch()
		this.artifacts.set(classId, fetched)
		fetched.catch(() => {
			if (this.artifacts.get(classId) === fetched) this.artifacts.delete(classId)
		})
		return fetched
	}

	public close(): void {
		this.open = false
		this.artifacts.clear()
	}
}

/** `node`'s member, called on the node itself; a read a build asks once is answered from `answers`. */
function member(node: AztecNode, prop: PropertyKey, answers: Answers): unknown {
	const own: unknown = Reflect.get(node, prop, node)
	// A proxy must hand back a fixed property as it is.
	const fixed = Reflect.getOwnPropertyDescriptor(node, prop)
	if (typeof own !== "function" || (fixed && !fixed.configurable && !fixed.writable)) return own
	const ask = (args: unknown[]): unknown => Reflect.apply(own, node, args)
	if (!ASKED_ONCE.has(prop)) return (...args: unknown[]) => ask(args)
	return (...args: unknown[]) => {
		const key = keyOf(prop, args)
		if (key === undefined) return ask(args)
		const known = answers.get(key)
		if (known) return known
		const asked = Promise.resolve(ask(args))
		answers.set(key, asked)
		// A failed read is not an answer: the next ask goes to the node.
		asked.catch(() => {
			if (answers.get(key) === asked) answers.delete(key)
		})
		return asked
	}
}

/** A contract's current class, as a build asks for it. An unparseable address is the build's to refuse. */
async function classOf(node: AztecNode, contract: string): Promise<unknown> {
	return node.getContract(AztecAddress.fromStringUnsafe(contract))
}

/** One read's identity, or `undefined` when an argument has no text of its own and the read is asked each time. */
function keyOf(prop: PropertyKey, args: readonly unknown[]): string | undefined {
	const parts = [String(prop)]
	for (const arg of args) {
		const part = argKey(arg)
		if (part === undefined) return undefined
		parts.push(part)
	}
	return parts.join("|")
}

/** A primitive's text, or the text of a value that names itself (a field, an address, a block
 *  hash). A list, a byte view or a plain object has none: joined or default text can collide. */
function argKey(arg: unknown): string | undefined {
	if (arg === null || arg === undefined) return String(arg)
	if (typeof arg === "string" || typeof arg === "number" || typeof arg === "bigint" || typeof arg === "boolean")
		return `${typeof arg}:${arg}`
	if (typeof arg !== "object" || Array.isArray(arg) || ArrayBuffer.isView(arg)) return undefined
	const text: unknown = (arg as { toString?: unknown }).toString
	if (typeof text !== "function" || text === Object.prototype.toString) return undefined
	return `object:${text.call(arg)}`
}
