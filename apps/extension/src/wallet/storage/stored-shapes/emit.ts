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
	_zod: { def: { type: string; coerce?: boolean; checks?: Array<{ _zod: { def: { check: string } } }> } }
	description?: string
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

const UNLABELLED = "x-unlabelled"

/** The first node still carrying {@link UNLABELLED}, as its path and markers. */
function findUnlabelled(node: unknown, path = ""): { path: string; markers: unknown } | undefined {
	if (typeof node !== "object" || node === null) return undefined
	if (UNLABELLED in node) return { path: path || "/", markers: (node as Record<string, unknown>)[UNLABELLED] }
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
	const emitted = z.toJSONSchema(schema, {
		io: "input",
		unrepresentable: "any",
		override: ({ zodSchema, jsonSchema }) => {
			const node = zodSchema as unknown as ZodInternals
			const target = jsonSchema as Record<string, unknown>
			const markers = markersOf(node)
			// `.describe()` clones its schema and the clone inherits the original's output first, so the
			// flag a bare original leaves survives only where the bare original itself is emitted.
			if (!node.description) {
				if (markers.length > 0) target[UNLABELLED] = markers.join(" and ")
				return
			}
			delete target[UNLABELLED]
			for (const marker of markers) target[marker] = node.description
		},
	})
	const unlabelled = findUnlabelled(emitted)
	if (unlabelled) {
		throw new Error(`${shape}: the ${unlabelled.markers} node at ${unlabelled.path} needs a .describe() saying what it accepts`)
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
