import { expectTypeOf, test } from "vitest"
import type { z } from "zod"
import type { RouteSnapshotSchema } from "./route-snapshot"
import type { RouteSnapshot } from "./spec"

test("the schema reads exactly the snapshot's type: a state or failure only one side lists does not compile", () => {
	expectTypeOf<z.output<typeof RouteSnapshotSchema>>().toEqualTypeOf<RouteSnapshot | null>()
})
