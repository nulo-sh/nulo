/** The PrivateFPC's canonical address, the same on every network; `protocol-fpcs.test.ts` pins it to
 *  the derivation, so it moves only with a reviewed artifact. */
export const PRIVATE_FPC_ADDRESS = "0x2e189d0c28cb86234a17951a94131e19620cda595fa8f9c5c10c24268ceb6db4"

/** Whether `address` names the PrivateFPC, which charges a fee to the sender's own Private Fee Juice. */
export function isPrivateFpc(address: unknown): boolean {
	return address !== undefined && address !== null && String(address).toLowerCase() === PRIVATE_FPC_ADDRESS
}
