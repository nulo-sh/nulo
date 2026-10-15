# The Nulo token list, `nulo-token-list/1`

`https://tokens.nulo.sh/v1/list.json` is the list of default tokens the Nulo wallet offers on each
Aztec network. Anyone may read it; any wallet may use it. This page is enough to verify a copy by
hand. A change that breaks a reader moves to `/v2/`.

## Envelope

The file is a JSON object, at most 64 KiB:

```json
{
	"format": "nulo-token-list-envelope/1",
	"keyId": "nulo-ci-1",
	"payload": "<base64url, no padding>",
	"signature": "<base64url, no padding, 64 bytes>"
}
```

- `signature` is an Ed25519 signature (RFC 8032) over the UTF-8 bytes `nulo-token-list/1` and a
  newline (`0x0a`), followed by the exact bytes `payload` decodes to. Nothing is canonicalized.
- `keyId` names one of the public keys below. Refuse an envelope whose `keyId` you do not pin.
- Verify before you parse the payload. base64url has exactly one spelling per value here: no
  padding, no `+` or `/`, no stray trailing bits.

### Public keys

| keyId | Ed25519 public key (raw 32 bytes, base64url) | Role |
|---|---|---|
| `nulo-ci-1` | `Al201vPu8pwqVmqmVBOxQqozL55HI0oViOA1QVeU6k4` | signs every publish, in the `token-list` GitHub environment after an owner approval |
| `nulo-recovery-1` | `zxIA-cxJ7IPlSvaDWEW5V8UgFfzne2RsHoCN8kg1tl0` | offline; signs only after a rotation |

The wallet reads its keys from [`packages/token-list/src/keys.ts`](../../packages/token-list/src/keys.ts),
and a test keeps this table equal to it. The keys in that file at a released tag are the keys that
release accepts. A key removed from the file has been rotated out: refuse lists it signed.

## Payload

The payload is a UTF-8 JSON object:

```json
{
	"format": "nulo-token-list/1",
	"sequence": 1760000000,
	"issuedAt": "2025-10-09T08:53:20.000Z",
	"tokens": [
		{
			"chainId": 2904119610,
			"address": "0x0f8d…9ecf",
			"classId": "0x24c3…1505",
			"symbol": "USDC",
			"decimals": 6,
			"name": "Test USDC",
			"priceId": "usd-coin"
		}
	],
	"flagged": [
		{
			"chainId": 2904119610,
			"address": "0x2a6c…41d7"
		}
	]
}
```

| Field | Rule |
|---|---|
| `sequence` | Integer, 1 to 2^53 − 1: the signing time in seconds. Accept a list only if its `sequence` is above the last one you accepted. Nulo also refuses one below the floor its release compiles ([`floor.json`](../../packages/token-list/src/floor.json)), the sequence of the last list that delisted or flagged a token. |
| `issuedAt` | ISO 8601 UTC instant of the signing. |
| `chainId` | Unsigned 32-bit integer: the Aztec wallet chain id, `(l1ChainId ^ rollupVersion) >>> 0`. |
| `address`, `classId` | `0x` + 64 lower-case hex digits, below the BN254 scalar field modulus `0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001`. Other spellings are refused, never normalized. |
| `symbol` | 1 to 32 characters. |
| `name` | 1 to 80 characters. |
| `decimals` | Integer, 0 to 18. |
| `priceId` | Optional CoinGecko id. Absent means unpriced. |
| `flagged` | Optional array of `{chainId, address}` pairs, under the rules above: tokens the publisher flags as scams. Absent means none. |

`symbol` and `name` contain no control, format (bidi overrides, zero-width joiners) or line and
paragraph separator characters. Each (`chainId`, `address`) pair appears once across `tokens` and
`flagged`: a flagged token is never listed.

### What a reader does with it

- Ignore keys it does not know, in the payload and in each entry.
- Skip an entry whose `classId` it cannot verify on chain. Nulo seeds only Token classes it bundles
  an artifact for, and checks the class, symbol and decimals against the chain before it adds a row.
- Leave an entry unpriced when its `priceId` is not one it knows.
- Use at most the first 16 entries per `chainId`. The publisher never signs more than 16.
- Warn wherever a flagged token shows, whoever added it, and never treat a flagged pair as listed.

A list is a suggestion of which contracts to show, not a statement that a token is safe or worth
anything. The class, symbol and decimals are checked against the chain. The name is a label: Nulo
shows it before the chain answers and where it names a known contract, and a token row takes the
chain's name. The chain is the source of truth for balances.

## Verify by hand

```sh
curl -s https://tokens.nulo.sh/v1/list.json > list.json
bun -e '
const env = JSON.parse(await Bun.file("list.json").text())
const b64 = (s) => Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0))
const payload = b64(env.payload)
const message = new Uint8Array([...new TextEncoder().encode("nulo-token-list/1\n"), ...payload])
const key = await crypto.subtle.importKey("raw", b64(process.argv[1]), "Ed25519", false, ["verify"])
console.log(await crypto.subtle.verify("Ed25519", key, b64(env.signature), message))
console.log(new TextDecoder().decode(payload))
' '<the nulo-ci-1 public key>'
```

`true` and the payload mean the list is the one Nulo signed. Compare its `sequence` with the last
one you saw.
