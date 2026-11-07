import type { PxeFactory } from "./chain-runtime"

/** For a fake factory whose test never picks a send with no runtime built for its endpoints. */
export const NO_ROUTE: PxeFactory["createRoute"] = () => {
	throw new Error("this test builds no send route")
}
