/** The PrivateFPC's canonical address, the same on every network; `protocol-fpcs.test.ts` pins it to
 *  the derivation, so it moves only with a reviewed artifact. */
export const PRIVATE_FPC_ADDRESS = "0x0516ebb4f9c7988eb3cf6dd9459a47556f7a92db06b17cfa47ffb37fd35c6915"

/** Whether `address` names the PrivateFPC, which charges a fee to the sender's own Private Fee Juice. */
export function isPrivateFpc(address: unknown): boolean {
	return address !== undefined && address !== null && String(address).toLowerCase() === PRIVATE_FPC_ADDRESS
}
