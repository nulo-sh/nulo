import type { ContractArtifact } from "@aztec-labs/stdlib/abi"

/**
 * The artifact with no debug info: each function's `debugSymbols` empty and its `debug` left out,
 * and an empty `fileMap`. Those fields only put Noir source locations into simulation error traces;
 * `@aztec-labs/stdlib` reads an empty `debugSymbols` as "no debug info", and the class id commits to
 * none of them. Works on the loaded form and on its JSON wire form alike.
 */
export function withoutDebugInfo(artifact: ContractArtifact): ContractArtifact {
	const functions = artifact.functions.map(({ debug: _debug, ...fn }) => ({ ...fn, debugSymbols: "" }))
	return { ...artifact, functions, fileMap: {} }
}
