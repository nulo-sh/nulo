import { FpcType } from "@/wallet/services/fpc/spec"

/** The canonical Sponsored FPC's address, in the lower case discovery stores. */
export const SPONSOR_FPC_ADDRESS = "0x2d8fff82a3b0c15d0a89169e7d8d043e079ab94d52031f1de1e4972ebad169d3"

/** The canonical protocol FPC addresses `src/wallet/services/fpc/protocol-fpcs.test.ts` pins. */
export const PROTOCOL_FPCS = [
	{ type: FpcType.DefaultSponsoredFpc, name: "Sponsored", address: SPONSOR_FPC_ADDRESS },
	{ type: FpcType.PrivateFpc, name: "Private Fee Juice", address: "0x0516ebb4f9c7988eb3cf6dd9459a47556f7a92db06b17cfa47ffb37fd35c6915" },
] as const
