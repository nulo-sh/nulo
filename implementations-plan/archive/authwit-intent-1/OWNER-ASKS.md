# authwit-intent-1: owner asks

The arc ships each ask in its "ships now" form; the owner can flip either later.

## OA-1: the text a dApp reads when its inner-hash intent names the signing account

Inside the orchestrator's no-ask record for this lane ("UI impact: none beyond the refusal's text"), so it ships as written and the PR body quotes it.

- **Surface:** the error a dApp receives for that `createAuthWit` request.
- **Ships now (option a):** code 4100, `data.walletErrorCode: "SCOPE_VIOLATION"`, message `An authorization's consumer cannot be the account that signs it. Name the contract that consumes it.`
- **Option b:** the generic scope refusal, "This request is outside the permissions you gave this app." No new public text, but no wider grant would fix the request.
- **Recommendation:** a. The developer is the one who can act on it, and classifiers that read the code keep working.

## OA-2: a History row for a refused `createAuthWit`

Not inside the record: a row needs persisted state that does not exist for `createAuthWit`.

- **Surface:** the History list.
- **Ships now (option a):** no row. Today no `createAuthWit` writes one, whether signed, rejected or refused, the refusal of an intent naming the authorization registry included.
- **Option b:** a new journal record for each refused `createAuthWit`, for example `Not allowed` / `Apps cannot ask your account to authorize its own transactions. Nothing was signed.` It adds persisted rows for a request kind that has none, a producer at dispatch with caps like the `sendTx` queued journal, and the wording above.
- **Recommendation:** a. If History should show authorizations, a plan for every `createAuthWit` outcome reads better than rows for refusals only.
