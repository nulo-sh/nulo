// Its own package entry, importing only zod and types: the popup reads this schema, and a value
// import of the `pxe` barrel puts the PXE and its kernel artifacts in the popup's module graph.
import z from "zod"
import type { EndpointState } from "../routing/endpoint-health"
import type { TransportFailure } from "../utils/fetch"

const ENDPOINT_STATES = ["unknown", "ready", "down", "behind", "wrong-chain"] as const satisfies readonly EndpointState[]
const TRANSPORT_FAILURES = [
	"unreachable",
	"timeout",
	"server",
	"malformed",
	"overloaded",
	"refused",
] as const satisfies readonly TransportFailure[]

/** `getRouteSnapshot`'s answer. An object key beyond these is refused, so a URL never rides along.
 *  Unannotated on purpose: its inferred type is pinned to `RouteSnapshot | null`, so a value the
 *  owning types gain fails to compile until it is listed here. */
export const RouteSnapshotSchema = z
	.object({
		activeId: z.string().nullable(),
		endpoints: z.array(
			z
				.object({
					id: z.string(),
					state: z.enum(ENDPOINT_STATES),
					since: z.number(),
					failure: z.enum(TRANSPORT_FAILURES).optional(),
				})
				.strict(),
		),
	})
	.strict()
	.nullable()
