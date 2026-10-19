# Phase 2: #839 rows 1, 2 and the held row

- The hook loses `insertUnseenUpdated`, `refetchWhenDirty` and `added: "append"`; Holdings, Select token and Send drop them.
- Base copies at `993b3efc`. New cases red over base: Holdings' unseen-update and read-over-add cases, Select token's read-over-add case. Replaced cases red over new: the hook's three option cases, Holdings' two, Select token's one, Send's `append` pin. Send's restart control is green on both, as planned (D5).
- Mutations over the new code: listing an unseen update reddens the hook's case and Holdings'; dropping the dirty refetch reddens both read-over-add cases. Re-adding `append`'s other-chain push first stayed green: the hook's out-of-scope case only looked after the read landed over the push. One assertion before the land now reddens it.
- Shell note: zsh does not word-split an unquoted `$VAR` holding several paths; pass an array (`"${TS[@]}"`), or vitest gets one filter and finds no file.
