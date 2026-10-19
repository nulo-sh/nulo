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
	_zod: { def: { type: string; checks?: Array<{ _zod: { def: { check: string } } }> }; parent?: unknown }
	description?: string
}

function markersOf(node: ZodInternals): string[] {
	const { type, checks = [] } = node._zod.def
	return [
		...(MARKED_TYPES[type] ? [MARKED_TYPES[type]] : []),
		...(UNREPRESENTABLE.has(type) ? ["x-unrepresentable"] : []),
		...(checks.some((check) => check._zod.def.check === "custom") ? ["x-refine"] : []),
	]
}

/**
 * The canonical JSON Schema of a stored shape, as its bytes are read: input mode, since stored
 * values are the codec's input, with object keys and `required` sorted so the output depends on
 * the schema alone. Every node zod cannot express must carry a `.describe()`, which the snapshot
 * records under its marker; an undescribed one throws, naming the shape and the path.
 */
export function emitSchema(shape: string, schema: z.ZodType): Json {
	const visited: Array<{ node: ZodInternals; path: readonly (string | number)[] }> = []
	const emitted = z.toJSONSchema(schema, {
		io: "input",
		unrepresentable: "any",
		override: ({ zodSchema, jsonSchema, path }) => {
			const node = zodSchema as unknown as ZodInternals
			visited.push({ node, path })
			if (!node.description) return
			for (const marker of markersOf(node)) (jsonSchema as Record<string, unknown>)[marker] = node.description
		},
	})
	// `.describe()` clones its schema; the undescribed original is visited too, as the clone's parent.
	const parents = new Set(visited.map(({ node }) => node._zod.parent).filter(Boolean))
	for (const { node, path } of visited) {
		const markers = markersOf(node)
		if (markers.length > 0 && !node.description && !parents.has(node)) {
			throw new Error(`${shape}: the ${markers.join(" and ")} node at /${path.join("/")} needs a .describe() saying what it accepts`)
		}
	}
	return canonical(emitted as Json, { schema: true })
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && [Object.prototype, null].includes(Object.getPrototypeOf(value))

function canonicalObject(value: Record<string, unknown>, options: { schema?: boolean }, path: string): Json {
	const out: { [key: string]: Json } = {}
	for (const key of Object.keys(value).sort()) {
		const item = value[key]
		if (item === undefined) continue
		const sorted = options.schema && key === "required" && Array.isArray(item) ? [...item].sort() : item
		out[key] = canonical(sorted, options, `${path}/${key}`)
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
