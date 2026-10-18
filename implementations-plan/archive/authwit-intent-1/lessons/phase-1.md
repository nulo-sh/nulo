# authwit-intent-1: phase 1 (the refusal)

- `biome format --write $FILES` with a multi-line `$FILES` from `git diff --name-only` wrote nothing (zsh keeps it one word); pass the paths explicitly. Root `bunx biome` is also wrong here: use `node_modules/.bin/biome`, the locked 2.5.13.
- `FunctionCall`'s last argument is one `AbiType`, not an array; the binding test passes `FN.returnType as never` as its sibling helper does.
- Red proofs: dropping the refusal call turned the checker row, the dispatcher test and the binding test red (3); dropping the rebuild line turned two `errors.test.ts` rows red. Controls stayed green.
- `authwit-variants` at retry 0, load1 138 at start: 4 passed, suite 83 s, 342 s with the build. No scenario added.
