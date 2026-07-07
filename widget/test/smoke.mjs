// Browser smoke test: loads the built bundle in real Chromium with a
// stubbed Keplr and a fake Tendermint JSON-RPC node, then asserts
//
//  1. the gate flow unlocks content from a committing_info LCD response,
//  2. the subscribe flow builds a transaction whose body carries the
//     exact `commit` execute msg + funds the contracts expect.
//
// Run `npm run build` first (npm run check does both).

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BUNDLE = new URL('../dist/bluechip-widget.js', import.meta.url).pathname;
const CHROMIUM =
    process.env.CHROMIUM_PATH ??
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const RPC = 'https://bluechip.rpc.bluechip.link';
const REST = 'https://bluechip.api.bluechip.link';
const POOL = 'bluechip1pool00000000000000000000000000000000';
const WALLET = 'bluechip1fan000000000000000000000000000000000';

// ---------------------------------------------------------------------------
// Tiny protobuf writers — just enough for the two ABCI responses we fake.
// ---------------------------------------------------------------------------
function varint(n) {
    const out = [];
    let v = n;
    while (v > 127) { out.push((v & 0x7f) | 0x80); v >>>= 7; }
    out.push(v);
    return out;
}
function lenDelim(fieldNo, bytes) {
    return [fieldNo << 3 | 2, ...varint(bytes.length), ...bytes];
}
const utf8 = (s) => [...Buffer.from(s, 'utf8')];

/** cosmwasm QuerySmartContractStateResponse { data: bytes = JSON } */
function smartStateResponse(json) {
    return Buffer.from(lenDelim(1, utf8(JSON.stringify(json))));
}
/** cosmos-sdk QueryAccountResponse { account: Any<BaseAccount> } */
function accountResponse(address) {
    const baseAccount = [
        ...lenDelim(1, utf8(address)),
        (3 << 3), ...varint(7),   // account_number = 7
        (4 << 3), ...varint(0),   // sequence = 0
    ];
    const any = [
        ...lenDelim(1, utf8('/cosmos.auth.v1beta1.BaseAccount')),
        ...lenDelim(2, baseAccount),
    ];
    return Buffer.from(lenDelim(1, any));
}

// ---------------------------------------------------------------------------
// Fake node
// ---------------------------------------------------------------------------
const STATUS_RESULT = {
    node_info: {
        protocol_version: { p2p: '8', block: '11', app: '0' },
        id: 'ab'.repeat(20),
        listen_addr: 'tcp://0.0.0.0:26656',
        network: 'bluechip-3',
        version: '0.37.2',
        channels: '40202122233038606100',
        moniker: 'smoke-node',
        other: { tx_index: 'on', rpc_address: 'tcp://0.0.0.0:26657' },
    },
    sync_info: {
        latest_block_hash: 'AB'.repeat(32),
        latest_app_hash: 'CD'.repeat(32),
        latest_block_height: '100',
        latest_block_time: '2026-07-07T00:00:00Z',
        catching_up: false,
    },
    validator_info: {
        address: 'EF'.repeat(20),
        pub_key: { type: 'tendermint/PubKeyEd25519', value: Buffer.alloc(32, 1).toString('base64') },
        voting_power: '10',
    },
};

function abciValueFor(path, dataHex) {
    if (path === '/cosmwasm.wasm.v1.Query/SmartContractState') {
        // Both smart queries the widget makes over RPC hit this path; the
        // request embeds the JSON query, so key off its bytes.
        const reqAscii = Buffer.from(dataHex, 'hex').toString('latin1');
        if (reqAscii.includes('is_fully_commited')) {
            return smartStateResponse({ in_progress: { raised: '1000000000', target: '25000000000' } });
        }
        throw new Error(`unexpected smart query: ${reqAscii}`);
    }
    if (path === '/cosmos.auth.v1beta1.Query/Account') {
        return accountResponse(WALLET);
    }
    throw new Error(`unexpected abci path: ${path}`);
}

async function serveRpc(route) {
    const body = route.request().postDataJSON();
    const reply = (result) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }),
    });
    if (body.method === 'status') return reply(STATUS_RESULT);
    if (body.method === 'abci_query') {
        const { path, data } = body.params;
        return reply({
            response: {
                code: 0, log: '', info: '', index: '0', key: null,
                value: abciValueFor(path, data).toString('base64'),
                proofOps: null, height: '100', codespace: '',
            },
        });
    }
    throw new Error(`fake node: unhandled method ${body.method}`);
}

// ---------------------------------------------------------------------------
// Keplr stub (installed before the bundle runs)
// ---------------------------------------------------------------------------
const KEPLR_STUB = `
(() => {
    const WALLET = ${JSON.stringify(WALLET)};
    const pubkey = new Uint8Array(33); pubkey[0] = 2; pubkey[32] = 9;
    window.__signedBodies = [];
    window.keplr = {
        async experimentalSuggestChain(info) { window.__suggestedChain = info; },
        async enable(chainId) { window.__enabledChain = chainId; },
        async getKey(chainId) { return { bech32Address: WALLET }; },
        getOfflineSigner(chainId) {
            return {
                async getAccounts() {
                    return [{ address: WALLET, algo: 'secp256k1', pubkey }];
                },
                async signDirect(address, signDoc) {
                    // Capture what the widget asks us to sign, then abort:
                    // the smoke test verifies the tx body without needing
                    // a fake broadcast + confirmation pipeline.
                    window.__signedBodies.push({
                        chainId: signDoc.chainId,
                        bodyAscii: new TextDecoder('latin1').decode(signDoc.bodyBytes),
                    });
                    throw new Error('smoke-abort-after-capture');
                },
            };
        },
    };
})();
`;

// ---------------------------------------------------------------------------
async function main() {
    assert.ok(existsSync(BUNDLE), 'dist/bluechip-widget.js missing — run npm run build first');
    assert.ok(existsSync(CHROMIUM), `Chromium not found at ${CHROMIUM} (set CHROMIUM_PATH)`);

    const browser = await chromium.launch({ executablePath: CHROMIUM });
    const page = await browser.newPage();
    page.on('pageerror', (e) => { throw e; });

    await page.route(`${RPC}/**`, serveRpc);
    await page.route(`${REST}/cosmwasm/wasm/v1/contract/**`, async (route) => {
        const url = route.request().url();
        const b64 = decodeURIComponent(url.split('/smart/')[1]);
        const query = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
        assert.deepEqual(query, { committing_info: { wallet: WALLET } });
        await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
                data: {
                    committer: WALLET,
                    total_paid_usd: '7500000',
                    total_paid_bluechip: '60000000',
                    last_committed: '1700000000000000000',
                    last_payment_usd: '5000000',
                    last_payment_bluechip: '40000000',
                },
            }),
        });
    });

    await page.setContent(`
        <div data-bluechip-subscribe data-pool="${POOL}" data-amount="25"></div>
        <div id="secret" data-bluechip-gate data-pool="${POOL}" data-min-usd="5">MEMBERS ONLY</div>
    `);
    // setContent rewrites the existing document without a navigation, so
    // addInitScript never fires — install the Keplr stub directly before
    // loading the bundle (it is only dereferenced at click time anyway).
    await page.evaluate(KEPLR_STUB);
    await page.addScriptTag({ path: BUNDLE });

    // Bundle exposes the API and auto-mounts declarative embeds.
    assert.equal(await page.evaluate(() => typeof window.BluechipWidget), 'object');
    assert.equal(await page.evaluate(() => window.BluechipWidget.version), '0.1.0');
    await page.waitForSelector('[data-bluechip-subscribe] .bcw-btn');
    await page.waitForSelector('.bcw-btn:text("Unlock with your subscription")');

    // --- Gate flow: unlocks on a qualifying committing_info record ------
    assert.ok(await page.locator('#secret').isHidden(), 'gated content starts hidden');
    await page.click('.bcw-btn:text("Unlock with your subscription")');
    await page.waitForSelector('#secret:visible');
    assert.equal(await page.locator('#secret').innerText(), 'MEMBERS ONLY');

    // --- Subscribe flow: the signed tx body carries the exact commit msg -
    await page.click('[data-bluechip-subscribe] .bcw-btn');
    await page.waitForSelector('[data-bluechip-subscribe] .bcw-status.bcw-err');
    const errText = await page.locator('[data-bluechip-subscribe] .bcw-status').innerText();
    assert.match(errText, /smoke-abort-after-capture/, 'signer stub abort surfaces in the UI');

    const signed = await page.evaluate(() => window.__signedBodies);
    assert.equal(signed.length, 1);
    assert.equal(signed[0].chainId, 'bluechip-3');
    const body = signed[0].bodyAscii;
    // The execute msg JSON is embedded verbatim in the tx body. The fake
    // node reported the pool in_progress, so max_spread must be null.
    const expectedMsg = /"commit":\{"asset":\{"info":\{"bluechip":\{"denom":"ubluechip"\}\},"amount":"25000000"\},"transaction_deadline":"\d+","belief_price":null,"max_spread":null\}/;
    assert.match(body, expectedMsg, 'tx body carries the exact commit execute msg');
    assert.ok(body.includes(POOL), 'tx body targets the pool contract');
    assert.ok(body.includes('ubluechip'), 'funds denom present');

    // Keplr got the right chain registration.
    const suggested = await page.evaluate(() => window.__suggestedChain);
    assert.equal(suggested.chainId, 'bluechip-3');
    assert.equal(suggested.currencies[0].coinMinimalDenom, 'ubluechip');

    await browser.close();
    console.log('smoke: all assertions passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
