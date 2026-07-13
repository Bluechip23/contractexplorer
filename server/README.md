# BlueChip profiles service

Creator display names + link-in-bio pages for the block explorer. Backs the
`/creator/:idOrName` public links page and the `/mylinks` manage page.

Reads are public. Writes are authenticated with **ADR-36** signatures
(Keplr/Leap `signArbitrary`) verified fully server-side — no session, no
password, the wallet key is the identity.

Creators define named **subscription tiers** (USD prices) on the pools their
wallet created, and gate links behind one or more tiers. The public API never
returns a gated link's URL; the signed `/links/unlock` endpoint checks the
caller's `committing_info` record on the relevant pool contract(s) via RPC and
reveals only the links the caller has paid enough to unlock. Pool ownership is
verified **on-chain** (`fee_info {}` → `creator_wallet_address`) before a wallet
can attach a pool to its profile or a tier — a creator can never point at a pool
it did not create.

## Run

```bash
cd server
npm install
npm run dev          # tsc && node dist/index.js
```

Plain Docker (no TLS — for local testing or behind your own proxy):

```bash
docker build -t bluechip-profiles .
docker run -p 4317:4317 -v profiles-data:/data bluechip-profiles
```

## Production deploy (Docker Compose + automatic HTTPS)

`docker-compose.yml` runs the service behind **Caddy**, which fetches and
auto-renews a Let's Encrypt TLS certificate for your API subdomain — no
manual cert steps. Aimed at a first-time Docker user:

1. **Install Docker** on your server (Docker Engine + the Compose plugin).
   On Ubuntu: `curl -fsSL https://get.docker.com | sh`.
2. **Point DNS at the server.** Add an `A` record for your API subdomain —
   e.g. `api.bluechipsblockexplorer.com` → your server's public IP. (This is
   a *different* record from the site itself, which is on GitHub Pages.)
   Wait for it to resolve (`dig api.bluechipsblockexplorer.com`).
3. **Open ports 80 and 443** on the server firewall — Caddy needs both (80
   for the ACME challenge, 443 to serve). Port 4317 stays internal.
4. **Bring it up** from the `server/` directory:

   ```bash
   PROFILES_DOMAIN=api.bluechipsblockexplorer.com \
   ACME_EMAIL=you@example.com \
   PROFILES_ALLOWED_ORIGINS=https://bluechipsblockexplorer.com \
   docker compose up -d --build
   ```

   First start takes ~30s while Caddy provisions the certificate. Check it:
   `curl https://api.bluechipsblockexplorer.com/health` → `{"ok":true}`.

The frontend is already wired to this subdomain (the Pages deploy sets
`REACT_APP_PROFILES_URL=https://api.bluechipsblockexplorer.com`). To use a
different host, change it in `.github/workflows/deploy.yml` and here.

Update later with `git pull && docker compose up -d --build`. The SQLite DB
lives in the `profiles-data` volume and survives rebuilds.

## Environment

| Variable                   | Default                              | Purpose                                        |
| -------------------------- | ------------------------------------ | ---------------------------------------------- |
| `PROFILES_PORT`            | `4317`                               | HTTP listen port                               |
| `PROFILES_DB`              | `./profiles.db`                      | SQLite file path                               |
| `PROFILES_RPC`             | `https://rpc.osmotest5.osmosis.zone` | RPC used for `committing_info` checks          |
| `PROFILES_ALLOWED_ORIGINS` | *(any)*                              | Comma-separated CORS allowlist; omit to allow any origin |
| `RATE_LIMIT_PER_MIN`       | `300`                                | Per-IP request budget; `0` disables            |

Compose-only variables: `PROFILES_DOMAIN` (API subdomain for the TLS cert)
and `ACME_EMAIL` (Let's Encrypt account email).

## API

CORS allows any origin by default (writes are wallet-signature authenticated,
so there is no cookie/CSRF surface); set `PROFILES_ALLOWED_ORIGINS` to lock it
to your site. Bodies are JSON, limited to 64 KB.

| Method | Path                   | Auth   | Description                                                                              |
| ------ | ---------------------- | ------ | ---------------------------------------------------------------------------------------- |
| GET    | `/health`              | —      | `{ ok: true }`                                                                            |
| GET    | `/auth/nonce?address=` | —      | Issues a one-shot nonce (random 32-hex, 5-minute TTL) for the address                     |
| GET    | `/profiles/:idOrName`  | —      | `{ profile, links, tiers }`. `:idOrName` = wallet address, profile name, or pool address. Each link carries `tier_ids`; gated links come **without** `url`. `tiers` = public tier fields `{ id, pool_address, name, price_usd, position }` |
| GET    | `/search?q=`           | —      | `{ results: [{ name, wallet_address, pool_address }] }` — name substring (case-insensitive) or exact wallet/pool address, limit 20 |
| PUT    | `/profiles`            | signed | Upsert caller's profile `{ name, pool_address?, bio? }`. `409` on name conflict. When `pool_address` is set it must be created by the signer on-chain (`403` otherwise, `502` if the check fails) |
| POST   | `/links`               | signed | Add link `{ title, url, tier_ids?, position? }`. `gated` is derived: ≥1 tier ⇒ gated. Max 50 links per profile |
| PUT    | `/links/:id`           | signed | Update own link `{ id, title?, url?, tier_ids?, position? }`. Sending `tier_ids` replaces the link's tiers and re-derives `gated` |
| DELETE | `/links/:id`           | signed | Delete own link (payload `{ id }`)                                                        |
| POST   | `/tiers`               | signed | Create a tier `{ pool_address, name, price_usd }`. Requires a profile; max 5 tiers per wallet; pool must be created by the signer on-chain (`403`/`502`). Returns `{ tier }` |
| PUT    | `/tiers/:id`           | signed | Update own tier `{ id, name?, price_usd?, position? }` (pool is immutable — move = delete + recreate). Returns `{ tier }` |
| DELETE | `/tiers/:id`           | signed | Delete own tier (payload `{ id }`). Its `link_tiers` rows cascade                          |
| POST   | `/links/unlock`        | signed | Payload `{ owner }` (wallet, name, or pool). Per-link check: returns only the gated links the caller qualifies for (with `url`). The owner always gets all |

### Signed request format

Every write body is:

```json
{
  "address":   "osmo1...",
  "pub_key":   "<base64 compressed secp256k1>",
  "signature": "<base64 64-byte r||s>",
  "nonce":     "<from /auth/nonce>",
  "payload":   { "intent": "<endpoint intent>", ... }
}
```

The wallet signs (ADR-36 / `signArbitrary`) the string:

```
bluechip-profiles:<nonce>:<sha256hex of canonical JSON payload>
```

Canonical JSON = recursively key-sorted `JSON.stringify` with `undefined`
fields dropped. `payload.intent` binds the signature to one endpoint
(`put_profile`, `add_link`, `update_link`, `delete_link`, `add_tier`,
`update_tier`, `delete_tier`, `unlock_links`).
The server verifies: nonce exists/fresh and is consumed on use (replay-proof),
the pubkey hashes to the claimed `osmo1` address
(`bech32(ripemd160(sha256(pubkey)))`), and the secp256k1 signature verifies
over the ADR-36 SignDoc (`chain_id ""`, `sign/MsgSignData`).

### Validation rules

- `name`: 3–32 chars of `[a-zA-Z0-9 _.-]`, stored trimmed, unique case-insensitively
- `bio`: optional, ≤ 280 chars
- `pool_address`: optional, must be bech32 `osmo1...` **and** created by the signer on-chain
- `title`: ≤ 80 chars; `url`: ≤ 2048 chars, must parse as `http(s)` URL
- `tier` `name`: 1–40 chars, no control/zero-width/bidi characters
- `tier` `price_usd`: integer **micro-USD** string (6 decimals), `> 0`, `≤ 1e15` (`$1,000,000,000`)
- `tier_ids`: array of positive integers, deduped, ≤ 20 per link; every id must belong to the caller
- at most **5 tiers per wallet**, across all their pools

## Data model

Two tables back tiers and gating (all created idempotently by `migrate()`):

```
tiers(id PK, wallet_address → profiles ON DELETE CASCADE, pool_address,
      name, price_usd /* micro-USD string */, position, created_at, updated_at)

link_tiers(link_id → links ON DELETE CASCADE,
           tier_id → tiers ON DELETE CASCADE,
           PRIMARY KEY(link_id, tier_id))
```

`links.gated` is a denormalized cache of "has ≥1 `link_tiers` row", set on
every link create/update. Deleting a tier cascades its `link_tiers` rows; a
link left with zero tiers is no longer gated to anyone but the owner until
re-gated by the creator.

## Tier gating semantics

A link may be gated by tiers across several pools. To decide whether a viewer
unlocks a link:

1. Group the link's tiers by pool and take the **cheapest** tier price in each
   pool (higher tiers therefore automatically grant the lower ones — we only
   ever compare against the cheapest).
2. Query the viewer's `committing_info { wallet }` **once per distinct pool**
   (cached for the request) to get `total_paid_usd` (micro-USD).
3. The link unlocks if, for **any** associated pool, `total_paid_usd ≥ that
   pool's cheapest gate price`. Cross-pool is **OR** — satisfying one pool is
   enough.

The **owner** always sees every gated link (no RPC round-trip). Any RPC failure
during the check fails the whole request closed with `502` rather than
partially unlocking. All money comparisons are integer/BigInt on the micro-USD
strings — never floats.

## On-chain ownership enforcement

`PUT /profiles` (when `pool_address` is set) and `POST /tiers` both call the
pool's `fee_info {}` query and require `fee_info.creator_wallet_address` to
equal the signing wallet, returning `403` when it does not and `502` when the
RPC query itself fails. This removes the "point at someone else's pool" trust
gap on both the featured pool and every tier.
