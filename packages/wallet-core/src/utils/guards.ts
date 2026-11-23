/**
 * Shape guards for untrusted values. `@nulo/legal` keeps its own `isPlainObject`: it does not
 * depend on this package.
 */

/** A non-null object that is not an array: what a JSON object decodes to. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value)

/** Any non-null object, arrays and boxed primitives included. */
export const isObjectLike = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

/** A non-null object whose prototype is `Object.prototype` or `null`: refuses arrays, boxed
 *  primitives and class instances, so only plain data passes. */
export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
	if (!isObjectLike(value)) return false
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}
