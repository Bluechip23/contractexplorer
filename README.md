# BlueChip Creator Explorer

Frontend for the BlueChip creator-pool contracts on **Osmosis**: discover
creator pools, commit (subscribe) to creators, trade creator tokens, provide
liquidity, track your portfolio — and publish a creator link-in-bio page with
subscription-gated links.

The app talks directly to the deployed CosmWasm contracts
([bluechip-osmosis-contract](https://github.com/Bluechip23/bluechip-osmosis-contract));
nothing here depends on a bespoke chain anymore.

## Apps in this repository

- **`/` (root)** — the explorer frontend (Create React App). `npm install && npm start`.
- **`server/`** — the creator-profiles service backing the link-in-bio pages:
  creator names, links, and the subscribers-only link gate (verified
  server-side against the pool's on-chain commit ledger). See
  [`server/README.md`](server/README.md).
- **`indexer/`** — the event indexer that powers time-series features:
  price/volume history, buy-sell pressure, the trade feed, per-transaction
  commit history, and creator income statements. The frontend works without
  it (those panels explain how to enable it); see
  [`indexer/README.md`](indexer/README.md). ⚠️ Still pointed at the legacy
  chain's event schema — retargeting it to the Osmosis deployment is a
  follow-up.
- **`widget/`** — the embeddable subscribe (commit) button + subscription
  gate for creator websites. A single self-contained `<script>` tag; the
  only thing a creator edits is their pool address. See
  [`widget/README.md`](widget/README.md).

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `REACT_APP_NETWORK` | `testnet` | `testnet` (osmo-test-5) or `mainnet` (osmosis-1) |
| `REACT_APP_RPC_ENDPOINT` | network default | Osmosis RPC endpoint |
| `REACT_APP_API_ENDPOINT` | network default | Osmosis LCD endpoint |
| `REACT_APP_FACTORY_ADDRESS` | testnet deployment | BlueChip factory contract |
| `REACT_APP_ROUTER_ADDRESS` | testnet deployment | Multi-hop swap router contract |
| `REACT_APP_PROFILES_URL` | `http://localhost:4317` | Creator-profiles service |
| `REACT_APP_INDEXER_URL` | `http://localhost:4316` | Event indexer |
| `REACT_APP_USE_MOCK_DATA` | unset | `true` forces demo data; `false` forces chain |

The mainnet factory is not deployed yet — when `REACT_APP_NETWORK=mainnet`,
`REACT_APP_FACTORY_ADDRESS` and `REACT_APP_ROUTER_ADDRESS` are required.
