# Phase 10 — #35 userinfo refused at the last gate, and the arc 3 gate

- `rpcTransportVerdict` judges userinfo first (`{ allowed: false, refusal: "userinfo" }`); `RpcUrlSchema` lost its inline check and keeps its message; the adapter maps the refusal to `"userinfo is not permitted in an RPC URL"` and an unparseable string to the fixed `"not a valid URL"`. Its other two reasons still name the host or scheme, never the URL.
- The adapter table's whitespace rows hold a Unicode space (the schema trims it, the adapter does not), so a byte-literal replace missed them; the rows were rewritten by pattern. New rows: `https://user:hunter2@rpc.example.com:65536` (unparseable with credentials) → `not a valid URL`; a test that no refusal reason contains its input URL. Exact constant reasons are the proof that no credential reaches one.
- Base proof: with 8917dd1's `rpc-url.ts` and adapter, the three new verdict rows and the ten flipped or new adapter rows fail.
