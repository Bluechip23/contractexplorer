# BlueChip Subscribe Widget

An embeddable subscribe button + subscription gate for BlueChip creator
pools on Osmosis. One `<script>` tag, no build tools, no npm — designed
for creators who want to paste it into their own website.

What it does:

- **Subscribe button** — connects Keplr, registers the Osmosis chain,
  and commits native OSMO to your creator pool (a "subscription").
  Handles pre- vs post-threshold commits correctly. Commits are valued
  in USD via on-chain TWAP; the contract enforces a $5 minimum before
  the pool's threshold is hit and $1 after.
- **Subscription gate** — hides a block of your page until the viewer's
  wallet has a qualifying on-chain commit record for your pool.
- **JS API** — the same primitives (`connect`, `subscribe`,
  `checkSubscription`) for custom UIs.

The bundle is fully self-contained (CosmJS is compiled in — note that
CosmJS publishes no browser bundle of its own, so plain `<script
src="unpkg/...">` approaches do not work). ~300 KB gzipped.

## Quick start

```html
<!-- 1. Load the widget (pin a commit/tag in production) -->
<script src="https://cdn.jsdelivr.net/gh/Bluechip23/bluechipblockexplorer@main/widget/dist/bluechip-widget.min.js"></script>

<!-- 2. Drop a subscribe button anywhere -->
<div data-bluechip-subscribe
     data-pool="osmo1YOUR_POOL_ADDRESS"
     data-amount="25"></div>

<!-- 3. Optionally gate content behind a subscription -->
<div data-bluechip-gate
     data-pool="osmo1YOUR_POOL_ADDRESS"
     data-min-usd="5">
    Subscriber-only content here.
</div>
```

That's the whole integration. The **only value you must supply is your
pool address** (`data-pool`) — chain ID (`osmo-test-5`), RPC/REST
endpoints (`https://rpc.osmotest5.osmosis.zone` /
`https://lcd.osmotest5.osmosis.zone`), denom (`uosmo`), and gas settings
default to the Osmosis testnet deployment. You can also self-host the
file: copy `dist/bluechip-widget.min.js` next to your site and load it
from there.

`data-pool` is your **creator pool contract address** — the per-creator
contract instantiated by the BlueChip factory (on osmo-test-5 the factory
is `osmo1p93hcfzjnjfv0vtfxmunpqc25tq3p2vzh76hq3wxfz2zyayw4hzq4ac3vt`).
Do **not** put the factory address in `data-pool`; the widget talks to
pools, not the factory.

### Overriding defaults

Call `init` before the widgets are used (e.g. right after the script
tag) to change endpoints or set a site-wide default pool. When the
contracts launch on Osmosis mainnet, the same widget targets it via
these overrides:

```html
<script>
BluechipWidget.init({
    pool: "osmo1YOUR_POOL_ADDRESS",       // default pool for all mounts
    chainId: "osmosis-1",                  // optional overrides
    chainName: "Osmosis",                  //   (defaults: osmo-test-5)
    rpc:  "https://your.rpc.example",
    rest: "https://your.lcd.example",
});
</script>
```

## Declarative attributes

| Attribute | Applies to | Meaning |
|---|---|---|
| `data-pool` | both | Creator pool address (falls back to `init({pool})`) |
| `data-amount` | subscribe | Pre-filled amount in whole OSMO (converted to `uosmo` micro-units) |
| `data-fixed-amount` | subscribe | Hide the input; always use `data-amount` |
| `data-label` | both | Button text |
| `data-min-usd` | gate | Minimum lifetime USD committed to unlock |
| `data-denied-text` | gate | Message when the viewer doesn't qualify |

Elements added after page load can be mounted with
`BluechipWidget.scan()` or the programmatic `mountSubscribe` /
`mountGate`.

## JS API

```js
BluechipWidget.init(overrides?)                    // configure; returns active config
BluechipWidget.connect()                           // -> { address, client }
BluechipWidget.getAddress()                        // address via Keplr only (no RPC)
BluechipWidget.subscribe({ pool, amount })         // -> { txHash, address }
BluechipWidget.checkSubscription({ pool, address?, minUsd? })
//   -> { subscribed, totalUsd, record }           // record = raw committing_info
BluechipWidget.mountSubscribe(elOrSelector, opts)
BluechipWidget.mountGate(elOrSelector, opts)
BluechipWidget.toMicro('1.5') / BluechipWidget.fromMicro('1500000')
```

## Security model of the gate

`data-bluechip-gate` is a **client-side convenience** — it hides DOM
until the check passes, and anyone can bypass it with dev tools. It is
the right tool for perks, greetings, and soft-gating. To protect content
that actually matters, verify wallet ownership server-side with an
ADR-36 signature (`keplr.signArbitrary` + `verifyADR36Amino`) and run the
same `committing_info` LCD query from your backend — the full recipe is
in the integration guide (`docs/FRONTEND_MIGRATION.md` in
bluechip-osmosis-contract, Pattern B).

## Development

```bash
npm install
npm run build    # dist/bluechip-widget.js + .min.js (dist is committed)
npm test         # typecheck + unit tests (pure msg/amount/gate helpers)
npm run smoke    # real-Chromium test with stubbed Keplr + fake RPC node
npm run check    # all of the above
```

`dist/` is committed on purpose so the file is hotlinkable from a CDN
(jsDelivr) without a registry publish. Rebuild and commit `dist` whenever
`src` changes.

Bundle size: ~1.6 MB raw / ~300 KB gzipped. Most of it is CosmJS's
protobuf types; libsodium is already stubbed out (Keplr holds the keys,
the widget never signs locally). If it ever needs to be materially
smaller, the path is to hand-roll the single `MsgExecuteContract` tx
flow instead of shipping `SigningCosmWasmClient`.
