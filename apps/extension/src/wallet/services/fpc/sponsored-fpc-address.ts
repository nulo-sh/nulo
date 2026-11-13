/** The canonical SponsoredFPC's address: the same code wherever it sits, since the address commits to
 *  its class, salt and deployer. `protocol-fpcs.test.ts` pins it to the derivation, so it moves only
 *  with a reviewed artifact; the worker derives its own copy and never reads this one. */
export const SPONSORED_FPC_ADDRESS = "0x2d8fff82a3b0c15d0a89169e7d8d043e079ab94d52031f1de1e4972ebad169d3"

/** Whether `address` names Nulo's sponsor, the canonical SponsoredFPC. */
export function isSponsoredFpc(address: unknown): boolean {
	return address !== undefined && address !== null && String(address).toLowerCase() === SPONSORED_FPC_ADDRESS
}
