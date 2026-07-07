# BlueChip Block Explorer

Code for the BlueChip blockchain block explorer.

## Apps in this repository

- **`/` (root)** — the explorer frontend (Create React App). `npm install && npm start`.
- **`indexer/`** — the event indexer that powers all time-series features:
  price/volume history, buy-sell pressure, the trade feed, per-transaction
  commit history, and creator income statements. The frontend works without
  it (those panels explain how to enable it); see
  [`indexer/README.md`](indexer/README.md) to run it.
- **`widget/`** — the embeddable subscribe button + subscription gate for
  creator websites. A single self-contained `<script>` tag; the only thing
  a creator edits is their pool address. See
  [`widget/README.md`](widget/README.md).

Set `REACT_APP_INDEXER_URL` (default `http://localhost:4316`) to point the
frontend at your indexer instance.
