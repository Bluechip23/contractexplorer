import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTxEvents, TxContext } from '../parsers';
import { decodeEventAttrs, RawEvent } from '../rpc';

const CTX: TxContext = {
    txhash: 'ABC123',
    height: 100,
    ts: 1_700_000_000,
    nativeDenom: 'ubluechip',
    factoryAddress: 'bluechip1factory',
};

const POOL = 'bluechip1pool';

function wasm(attrs: Record<string, string>): RawEvent {
    return { type: 'wasm', attributes: Object.entries(attrs).map(([key, value]) => ({ key, value })) };
}

test('swap event with native offer parses as buy with bluechip-per-token price', () => {
    const out = parseTxEvents(CTX, [wasm({
        _contract_address: POOL,
        action: 'swap',
        sender: 'bluechip1trader',
        receiver: 'bluechip1trader',
        offer_asset: 'ubluechip',
        ask_asset: 'bluechip1token',
        offer_amount: '1000000',     // 1 bluechip
        return_amount: '2000000',    // 2 tokens
        spread_amount: '100',
        commission_amount: '3000',
        reserve0_after: '5',
        reserve1_after: '6',
        pool_contract: POOL,
    })]);
    assert.equal(out.trades.length, 1);
    const t = out.trades[0];
    assert.equal(t.side, 'buy');
    assert.equal(t.source, 'swap');
    assert.equal(t.trader, 'bluechip1trader');
    assert.equal(t.offer_amount, '1000000');
    assert.equal(t.return_amount, '2000000');
    assert.ok(Math.abs((t.price ?? 0) - 0.5) < 1e-9);   // 1 bluechip / 2 tokens
});

test('swap event with cw20 offer parses as sell', () => {
    const out = parseTxEvents(CTX, [wasm({
        _contract_address: POOL,
        action: 'swap',
        sender: 'bluechip1seller',
        offer_asset: 'bluechip1token',
        ask_asset: 'ubluechip',
        offer_amount: '4000000',     // 4 tokens
        return_amount: '1000000',    // 1 bluechip
        pool_contract: POOL,
    })]);
    assert.equal(out.trades[0].side, 'sell');
    assert.ok(Math.abs((out.trades[0].price ?? 0) - 0.25) < 1e-9);   // 1 bluechip / 4 tokens
});

test('funding-phase commit parses amounts and raises no trade', () => {
    const out = parseTxEvents(CTX, [wasm({
        _contract_address: POOL,
        action: 'commit',
        phase: 'funding',
        committer: 'bluechip1fan',
        commit_amount_bluechip: '8000000',
        commit_amount_usd: '1000000',
        total_usd_raised_after: '5000000',
        total_bluechip_raised_after: '40000000',
        pool_contract: POOL,
    })]);
    assert.equal(out.commits.length, 1);
    assert.equal(out.trades.length, 0);
    const c = out.commits[0];
    assert.equal(c.phase, 'funding');
    assert.equal(c.amount_usd, '1000000');
    assert.equal(c.usd_raised_after, '5000000');
});

test('post-threshold ("active") commit produces a commit row AND a buy trade', () => {
    const out = parseTxEvents(CTX, [wasm({
        _contract_address: POOL,
        action: 'commit',
        phase: 'active',
        committer: 'bluechip1fan',
        commit_amount_bluechip: '1000000',
        commit_amount_usd: '125000',
        swap_amount_bluechip: '940000',     // net of fees
        tokens_received: '1880000',
        commission_amount: '2820',
        spread_amount: '12',
        reserve0_after: '7',
        reserve1_after: '8',
        pool_contract: POOL,
    })]);
    assert.equal(out.commits.length, 1);
    assert.equal(out.commits[0].tokens_received, '1880000');
    assert.equal(out.trades.length, 1);
    const t = out.trades[0];
    assert.equal(t.source, 'commit');
    assert.equal(t.side, 'buy');
    assert.equal(t.offer_amount, '940000');
    assert.ok(Math.abs((t.price ?? 0) - 0.5) < 1e-9);
});

test('threshold-crossing commit normalizes total/threshold/swap amounts and marks the crossing', () => {
    const out = parseTxEvents(CTX, [wasm({
        _contract_address: POOL,
        action: 'commit',
        phase: 'threshold_crossing',
        committer: 'bluechip1whale',
        total_amount_bluechip: '99000000',
        threshold_amount_usd: '11000000',
        swap_amount_usd: '1000000',
        pool_contract: POOL,
    })]);
    assert.equal(out.commits[0].amount_bluechip, '99000000');
    assert.equal(out.commits[0].amount_usd, '12000000');   // threshold + swap USD
    assert.deepEqual(out.thresholdCrossings, [{ pool: POOL, ts: CTX.ts }]);
});

test('exact threshold hit marks the crossing and keeps commit_amount_usd', () => {
    const out = parseTxEvents(CTX, [wasm({
        _contract_address: POOL,
        action: 'commit',
        phase: 'threshold_hit_exact',
        committer: 'bluechip1whale',
        commit_amount_bluechip: '99000000',
        commit_amount_usd: '12000000',
        total_usd_raised_after: '25000000000',
        pool_contract: POOL,
    })]);
    assert.equal(out.commits[0].amount_usd, '12000000');
    assert.equal(out.trades.length, 0);
    assert.deepEqual(out.thresholdCrossings, [{ pool: POOL, ts: CTX.ts }]);
});

test('factory pool + token creation events register a pool with its token', () => {
    const out = parseTxEvents(CTX, [
        wasm({
            _contract_address: 'bluechip1factory',
            action: 'token_created_successfully',
            token_address: 'bluechip1token',
            pool_id: '7',
        }),
        wasm({
            _contract_address: 'bluechip1factory',
            action: 'pool_created_successfully',
            pool_address: POOL,
            pool_id: '7',
        }),
    ]);
    assert.deepEqual(out.poolTokens, [{ pool_id: 7, token_address: 'bluechip1token' }]);
    assert.equal(out.pools.length, 1);
    assert.equal(out.pools[0].kind, 'commit');
    assert.equal(out.pools[0].address, POOL);
});

test('pool-discovery events from a non-factory contract are ignored when a factory filter is set', () => {
    const out = parseTxEvents(CTX, [wasm({
        _contract_address: 'bluechip1impostor',
        action: 'pool_created_successfully',
        pool_address: 'bluechip1fakepool',
        pool_id: '666',
    })]);
    assert.equal(out.pools.length, 0);
});

test('creator claim events map both amount layouts onto amount_0/amount_1', () => {
    const out = parseTxEvents(CTX, [
        wasm({
            _contract_address: POOL,
            action: 'claim_creator_fees',
            creator: 'bluechip1creator',
            amount_0: '850000000',
            amount_1: '1200000000',
            pool_contract: POOL,
        }),
        wasm({
            _contract_address: POOL,
            action: 'claim_creator_excess',
            creator: 'bluechip1creator',
            bluechip_amount: '15000000000',
            token_amount: '30000000000',
            pool_contract: POOL,
        }),
    ]);
    assert.equal(out.claims.length, 2);
    assert.equal(out.claims[0].amount_0, '850000000');
    assert.equal(out.claims[1].amount_0, '15000000000');
    assert.equal(out.claims[1].amount_1, '30000000000');
});

test('liquidity events normalize actor/amounts and keep the full attribute map', () => {
    const out = parseTxEvents(CTX, [wasm({
        _contract_address: POOL,
        action: 'deposit_liquidity',
        position_id: '3',
        depositor: 'bluechip1lp',
        liquidity: '123456',
        actual_amount0: '1000000',
        actual_amount1: '2000000',
        pool_contract: POOL,
    })]);
    assert.equal(out.liquidity.length, 1);
    const l = out.liquidity[0];
    assert.equal(l.actor, 'bluechip1lp');
    assert.equal(l.amount_0, '1000000');
    assert.equal(JSON.parse(l.attrs_json).position_id, '3');
});

test('base64-encoded attributes (pre-0.37 Tendermint) are auto-decoded', () => {
    const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
    const ev: RawEvent = {
        type: 'wasm',
        attributes: [
            { key: b64('_contract_address'), value: b64(POOL) },
            { key: b64('action'), value: b64('swap') },
            { key: b64('offer_asset'), value: b64('ubluechip') },
            { key: b64('offer_amount'), value: b64('1000000') },
            { key: b64('return_amount'), value: b64('2000000') },
            { key: b64('pool_contract'), value: b64(POOL) },
        ],
    };
    const decoded = decodeEventAttrs(ev);
    assert.equal(decoded['action'], 'swap');
    const out = parseTxEvents(CTX, [ev]);
    assert.equal(out.trades.length, 1);
    assert.equal(out.trades[0].side, 'buy');
});

test('plain attributes are passed through untouched', () => {
    const attrs = decodeEventAttrs(wasm({ _contract_address: POOL, action: 'swap', offer_amount: '5' }));
    assert.equal(attrs['offer_amount'], '5');
});
