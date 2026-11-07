// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { EventSelector } from "@aztec-labs/stdlib/abi"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import type { ZodFor } from "@aztec-labs/foundation/schemas"
import { Note, NoteStatus } from "@aztec-labs/stdlib/note"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { inTxSchema, TxHash } from "@aztec-labs/stdlib/tx"
import { BlockNumberSchema } from "@aztec-labs/foundation/branded-types"
import type { PackedPrivateEvent, NotesFilter } from "@aztec-labs/pxe/client/bundle"
import z from "zod"
import type { EndpointState } from "../routing/endpoint-health"
import type { TransportFailure } from "../utils/fetch"
import type { RouteSnapshot } from "./spec"

export const NoteDaoSchema = z.object({
	note: Note.schema,
	contractAddress: AztecAddress.schema,
	owner: AztecAddress.schema,
	storageSlot: Fr.schema,
	randomness: Fr.schema,
	noteNonce: Fr.schema,
	noteHash: Fr.schema,
	siloedNullifier: Fr.schema,
	txHash: TxHash.schema,
	l2BlockNumber: BlockNumberSchema,
	l2BlockHash: z.string(),
	txIndexInBlock: z.number(),
	noteIndexInTx: z.number(),
})

export const PackedPrivateEventSchema = z.intersection(
	inTxSchema(),
	z.object({
		packedEvent: z.array(Fr.schema),
		eventSelector: EventSelector.schema,
	}),
) satisfies ZodFor<PackedPrivateEvent>

export const NotesFilterSchema = z.object({
	contractAddress: AztecAddress.schema,
	owner: AztecAddress.schema.optional(),
	storageSlot: Fr.schema.optional(),
	status: z.enum(NoteStatus).optional(),
	siloedNullifier: Fr.schema.optional(),
	scopes: z.array(AztecAddress.schema),
}) satisfies ZodFor<NotesFilter>

const ENDPOINT_STATES = ["unknown", "ready", "down", "behind", "wrong-chain"] as const satisfies readonly EndpointState[]
const TRANSPORT_FAILURES = [
	"unreachable",
	"timeout",
	"server",
	"malformed",
	"overloaded",
	"refused",
] as const satisfies readonly TransportFailure[]

/** `getRouteSnapshot`'s answer. An object key beyond these is refused, so a URL never rides along. */
export const RouteSnapshotSchema: z.ZodType<RouteSnapshot | null> = z
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
