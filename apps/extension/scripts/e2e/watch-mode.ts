import { parseCLI } from "vitest/node"

// Prints `watch` when the arguments start a watch run by `vitest run`'s own rule
// (`options.run = !options.watch`, so a dotted `--watch.enabled=…` is watch); a parse error throws.
// A file, never `node -e`: Bun's `node` shim drops `--` and `-w` from `-e`'s argv.
const { options } = parseCLI(["vitest", "run", ...process.argv.slice(2)])
console.log(options.watch ? "watch" : "run")
