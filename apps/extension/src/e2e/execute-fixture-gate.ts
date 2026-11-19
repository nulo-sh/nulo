/**
 * The execute window's way to its fixtures: `undefined` unless the build is armed. Decided at module
 * scope on the build-time flag, so a release bundle drops `./execute-fixture` whole; a dynamic
 * import left in dead code would still emit the module as its own chunk.
 */
import { E2E_EXECUTE_FIXTURE } from "./config"
import { executeFixture } from "./execute-fixture"

export const armedExecuteFixture: typeof executeFixture | undefined = E2E_EXECUTE_FIXTURE ? executeFixture : undefined
