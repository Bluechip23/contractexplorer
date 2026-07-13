import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    buildCommitMsg,
    commitFunds,
    committingInfoQuery,
    deadlineNs,
    evaluateGate,
    fromMicro,
    smartQueryUrl,
    toMicro,
    type CommitRecord,
} from '../src/messages.ts';

test('toMicro converts whole and fractional amounts with string math', () => {
    assert.equal(toMicro('25'), '25000000');
    assert.equal(toMicro('0.000001'), '1');
    assert.equal(toMicro('1.5'), '1500000');
    assert.equal(toMicro(100), '100000000');
    // no float drift on awkward decimals
    assert.equal(toMicro('0.29'), '290000');
});

test('toMicro rejects malformed and non-positive input', () => {
    for (const bad of ['', '-1', '1.2.3', 'abc', '1e6', '0', '0.0000001']) {
        assert.throws(() => toMicro(bad), Error, `expected throw for "${bad}"`);
    }
});

test('fromMicro renders micro strings and tolerates nulls', () => {
    assert.equal(fromMicro('25000000'), 25);
    assert.equal(fromMicro('1'), 0.000001);
    assert.equal(fromMicro(null), 0);
    assert.equal(fromMicro('not-a-number'), 0);
});

test('deadlineNs is nanoseconds 20 minutes out', () => {
    const nowMs = 1_700_000_000_000;
    assert.equal(deadlineNs(20, nowMs), ((nowMs + 20 * 60_000) * 1_000_000).toString());
});

test('pre-threshold commit msg has null max_spread and the exact contract shape', () => {
    const nowMs = 1_700_000_000_000;
    const msg = buildCommitMsg({ denom: 'uosmo', amountMicro: '25000000', thresholdHit: false, nowMs });
    assert.deepEqual(msg, {
        commit: {
            // Native side is wire-tagged "bluechip" (legacy serde rename)
            // even though the denom is uosmo on Osmosis.
            asset: { info: { bluechip: { denom: 'uosmo' } }, amount: '25000000' },
            transaction_deadline: deadlineNs(20, nowMs),
            belief_price: null,
            max_spread: null,
        },
    });
});

test('post-threshold commit msg carries a spread guard', () => {
    const msg = buildCommitMsg({ denom: 'uosmo', amountMicro: '1000000', thresholdHit: true });
    assert.equal(msg.commit.max_spread, '0.05');
});

test('commit funds are exactly one coin of the native denom', () => {
    assert.deepEqual(commitFunds('uosmo', '5000000'), [{ denom: 'uosmo', amount: '5000000' }]);
});

test('smartQueryUrl base64-encodes the query into the LCD path', () => {
    const url = smartQueryUrl('https://rest.example/', 'osmo1pool', committingInfoQuery('osmo1fan'));
    const expected = Buffer.from(JSON.stringify({ committing_info: { wallet: 'osmo1fan' } })).toString('base64');
    assert.equal(url, `https://rest.example/cosmwasm/wasm/v1/contract/osmo1pool/smart/${encodeURIComponent(expected)}`);
});

const RECORD: CommitRecord = {
    committer: 'osmo1fan',
    total_paid_usd: '7500000',       // $7.50
    total_paid_bluechip: '60000000', // legacy field name; uosmo micro-units
    last_committed: '1700000000000000000',
    last_payment_usd: '5000000',
    last_payment_bluechip: '40000000',
};

test('evaluateGate grants and denies on the USD floor', () => {
    assert.deepEqual(evaluateGate(RECORD, 5), { subscribed: true, totalUsd: 7.5, record: RECORD });
    assert.equal(evaluateGate(RECORD, 10).subscribed, false);
    assert.deepEqual(evaluateGate(null, 0), { subscribed: false, totalUsd: 0, record: null });
});
