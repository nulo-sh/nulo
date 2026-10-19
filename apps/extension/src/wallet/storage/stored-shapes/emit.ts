import { z } from "zod"

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/** Zod nodes JSON Schema cannot state, and the marker each is emitted with. Their behaviour is a
 *  function body: the snapshot sees a marker added, removed or relabelled, never a changed body. */
const MARKED_TYPES: Record<string, string> = {
	custom: "x-custom",
	pipe: "x-transform",
	transform: "x-transform",
	catch: "x-catch",
}
const UNREPRESENTABLE = new Set(["bigint", "date", "map", "set", "symbol", "undefined", "void", "never", "nan", "function", "promise"])

type ZodInternals = {
	_zod: {
		def: { type: string; coerce?: boolean; checks?: Array<{ _zod: { def: { check: string } } }>; in?: ZodInternals; out?: ZodInternals }
		parent?: ZodInternals
		traits: Set<string>
	}
	description?: string
}

const isTransform = (node: ZodInternals) => node._zod.traits.has("$ZodTransform")

/** The side of a pipe input mode leaves out, when it validates: a `.pipe(schema)` after a transform
 *  refuses rows no input-side schema shows. A `.transform()` or a preprocess leaves out only a body. */
function unemittedSide(node: ZodInternals): ZodInternals | undefined {
	const { type, in: input, out } = node._zod.def
	if (type !== "pipe" || !input || !out || isTransform(input) || isTransform(out)) return undefined
	return out
}

/** `.trim()`, `.toLowerCase()`, `.overwrite()` and `z.coerce` rewrite the parsed value with no trace in
 *  JSON Schema, so they are transforms too. */
function markersOf(node: ZodInternals): string[] {
	const { type, coerce, checks = [] } = node._zod.def
	const kinds = new Set(checks.map((check) => check._zod.def.check))
	const markers = [
		...(MARKED_TYPES[type] ? [MARKED_TYPES[type]] : []),
		...(coerce || kinds.has("overwrite") ? ["x-transform"] : []),
		...(UNREPRESENTABLE.has(type) ? ["x-unrepresentable"] : []),
		...(kinds.has("custom") ? ["x-refine"] : []),
	]
	return [...new Set(markers)]
}

/** A flag per undescribed marked node, keyed by the node, so clearing one never clears another's. */
const UNLABELLED = "x-unlabelled:"

/** The first node still carrying an {@link UNLABELLED} flag, as its path and markers. */
function findUnlabelled(node: unknown, path = ""): { path: string; markers: unknown } | undefined {
	if (typeof node !== "object" || node === null) return undefined
	const flag = Object.keys(node).find((key) => key.startsWith(UNLABELLED))
	if (flag) return { path: path || "/", markers: (node as Record<string, unknown>)[flag] }
	for (const [key, child] of Object.entries(node)) {
		const found = findUnlabelled(child, `${path}/${key}`)
		if (found) return found
	}
	return undefined
}

/**
 * The canonical JSON Schema of a stored shape, as its bytes are read: input mode, since stored
 * values are the codec's input, with object keys and `required` sorted so the output depends on
 * the schema alone. Every node zod cannot express must carry a `.describe()`, which the snapshot
 * records under its marker; an undescribed one throws, naming the shape and the path.
 */
export function emitSchema(shape: string, schema: z.ZodType): Json {
	const ids = new Map<ZodInternals, number>()
	const flagOf = (node: ZodInternals) => {
		if (!ids.has(node)) ids.set(node, ids.size)
		return `${UNLABELLED}${ids.get(node)}`
	}
	const toJson = (node: z.ZodType) =>
		z.toJSONSchema(node, {
			io: "input",
			unrepresentable: "any",
			override: ({ zodSchema, jsonSchema }) => label(zodSchema as unknown as ZodInternals, jsonSchema as Record<string, unknown>),
		}) as Record<string, unknown>
	function label(node: ZodInternals, target: Record<string, unknown>): void {
		const out = unemittedSide(node)
		if (out) {
			const { $schema: _, ...json } = toJson(out as unknown as z.ZodType)
			target["x-pipe-out"] = json
		}
		const markers = markersOf(node)
		if (!node.description) {
			if (markers.length > 0) target[flagOf(node)] = markers.join(" and ")
			return
		}
		// `.describe()` clones its schema and the clone inherits its original's output, wrapped nodes'
		// flags included: only the originals' flags are this description's to clear.
		for (let original = node._zod.parent; original; original = original._zod.parent) delete target[flagOf(original)]
		for (const marker of markers) target[marker] = node.description
	}
	const emitted = toJson(schema)
	const unlabelled = findUnlabelled(emitted)
	if (unlabelled) {
		throw new Error(`${shape}: the ${unlabelled.markers} node at ${unlabelled.path} needs a .describe() saying what it accepts`)
	}
	return canonical(emitted as Json, { schema: true })
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && [Object.prototype, null].includes(Object.getPrototypeOf(value))

/** Each key is defined, never assigned: an own `__proto__` key (JSON.parse makes one) is data that
 *  assignment would hand to the inherited setter and drop from every hash. */
function canonicalObject(value: Record<string, unknown>, options: { schema?: boolean }, path: string): Json {
	const out: { [key: string]: Json } = {}
	for (const key of Object.keys(value).sort()) {
		const item = value[key]
		if (item === undefined) continue
		const sorted = options.schema && key === "required" && Array.isArray(item) ? [...item].sort() : item
		const json = canonical(sorted, options, `${path}/${key}`)
		Object.defineProperty(out, key, { value: json, enumerable: true, writable: true, configurable: true })
	}
	return out
}

/** `value` with every object's keys sorted (and, in a schema, every `required` list); throws on
 *  anything JSON cannot carry, so a decoded value that is not plain data cannot be pinned by accident. */
export function canonical(value: unknown, options: { schema?: boolean } = {}, path = ""): Json {
	if (value === null || typeof value === "boolean" || typeof value === "string") return value
	if (typeof value === "number" && Number.isFinite(value)) return value
	if (Array.isArray(value)) return value.map((item, i) => canonical(item, options, `${path}/${i}`))
	if (isPlainObject(value)) return canonicalObject(value, options, path)
	const kind = typeof value === "object" ? (value.constructor?.name ?? "object") : `${typeof value} ${String(value)}`
	throw new Error(`${path || "/"}: a ${kind} is not JSON`)
}

/** Stable text of a canonical value, the form every comparison and pin uses. */
export const canonicalText = (value: unknown): string => JSON.stringify(canonical(value))
