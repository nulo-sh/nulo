import { z } from "zod"

/**
 * A string of at most `maxUnits` UTF-16 code units (`string.length`), the unit a size budget meters.
 * zod 4.6 counts `.max()` in code points, so astral characters alone would pass it at up to twice the
 * units. The refinement runs only once `.max()` has passed, so a refused string carries one
 * `too_big` issue either way.
 */
export const boundedString = (maxUnits: number) =>
	z
		.string()
		.max(maxUnits, { abort: true })
		.superRefine((value, ctx) => {
			if (value.length > maxUnits)
				ctx.addIssue({ code: "too_big", origin: "string", maximum: maxUnits, inclusive: true, input: value })
		})
		.describe(`at most ${maxUnits} UTF-16 code units`)
