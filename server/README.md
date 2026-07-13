# BlueChip profiles service

Creator display names + link-in-bio pages for the block explorer. Backs the
`/creator/:idOrName` public links page and the `/mylinks` manage page.

Reads are public. Writes are authenticated with **ADR-36** signatures
(Keplr/Leap `signArbitrary`) verified fully server-side — no session, no
password, the wallet key is the identity. Links can be marked *gated*
(subscribers-only): the public API never returns a gated link's URL; the
signed `/links/unlock` endpoint checks the caller's `committing_info`
record on the creator's pool contract (via RPC) before revealing them.

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
| GET    | `/profiles/:idOrName`  | —      | Profile + links. `:idOrName` = wallet address, profile name, or pool address. Gated links come **without** `url` |
| GET    | `/search?q=`           | —      | `{ results: [{ name, wallet_address, pool_address }] }` — name substring (case-insensitive) or exact wallet/pool address, limit 20 |
| PUT    | `/profiles`            | signed | Upsert caller's profile `{ name, pool_address?, bio? }`. `409` on name conflict           |
| POST   | `/links`               | signed | Add link `{ title, url, gated, position? }`. Max 50 links per profile                     |
| PUT    | `/links/:id`           | signed | Update own link `{ id, title?, url?, gated?, position? }`                                 |
| DELETE | `/links/:id`           | signed | Delete own link (payload `{ id }`)                                                        |
| POST   | `/links/unlock`        | signed | Payload `{ owner }` (wallet, name, or pool). Returns gated links **with** URLs when the caller has a non-null `committing_info` on the owner's pool — or is the owner |

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
(`put_profile`, `add_link`, `update_link`, `delete_link`, `unlock_links`).
The server verifies: nonce exists/fresh and is consumed on use (replay-proof),
the pubkey hashes to the claimed `osmo1` address
(`bech32(ripemd160(sha256(pubkey)))`), and the secp256k1 signature verifies
over the ADR-36 SignDoc (`chain_id ""`, `sign/MsgSignData`).

### Validation rules

- `name`: 3–32 chars of `[a-zA-Z0-9 _.-]`, stored trimmed, unique case-insensitively
- `bio`: optional, ≤ 280 chars
- `pool_address`: optional, must be bech32 `osmo1...`
- `title`: ≤ 80 chars; `url`: ≤ 2048 chars, must parse as `http(s)` URL
