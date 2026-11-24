import type { ContractArtifact } from "@aztec-labs/stdlib/abi"

/**
 * The artifact with no debug info: each function's `debugSymbols` empty and its `debug` left out,
 * and an empty `fileMap`. The class id commits to none of them. `@aztec-labs/stdlib` reads an empty
 * `debugSymbols` as "no debug info": simulation errors lose their Noir source locations, and a
 * public revert also loses the contract and function names `@aztec-labs/pxe` adds only with debug
 * info. Works on the loaded form and on its JSON wire form alike.
 */
export function withoutDebugInfo(artifact: ContractArtifact): ContractArtifact {
	const functions = artifact.functions.map(({ debug: _debug, ...fn }) => ({ ...fn, debugSymbols: "" }))
	return { ...artifact, functions, fileMap: {} }
}
