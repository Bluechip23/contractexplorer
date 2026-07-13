import { describeWasmExecute } from './txDecoder';

const b64 = (obj: unknown) => btoa(JSON.stringify(obj));

describe('describeWasmExecute', () => {
    it('labels a commit with its OSMO amount', () => {
        const info = describeWasmExecute(b64({
            commit: {
                asset: { info: { bluechip: { denom: 'uosmo' } }, amount: '25000000' },
                transaction_deadline: null,
            },
        }));
        expect(info?.label).toBe('Commit');
        expect(info?.detail).toContain('25');
        expect(info?.detail).toContain('OSMO');
    });

    it('labels a native simple_swap as a buy of creator tokens', () => {
        const info = describeWasmExecute({
            simple_swap: {
                offer_asset: { info: { bluechip: { denom: 'uosmo' } }, amount: '1000000' },
            },
        });
        expect(info?.label).toBe('Swap');
        expect(info?.detail).toContain('OSMO for creator tokens');
    });

    it('recognizes the CW20 send + swap hook as a sell', () => {
        const info = describeWasmExecute(b64({
            send: {
                contract: 'osmo1pool',
                amount: '4000000',
                msg: b64({ swap: { max_spread: '0.005' } }),
            },
        }));
        expect(info?.label).toBe('Swap');
        expect(info?.detail).toContain('Sold');
    });

    it('labels liquidity and claim actions', () => {
        expect(describeWasmExecute({ deposit_liquidity: { amount0: '1000000', amount1: '2000000' } })?.label)
            .toBe('Provide Liquidity');
        expect(describeWasmExecute({ remove_partial_liquidity_by_percent: { position_id: '3', percentage: 50 } })?.detail)
            .toContain('50%');
        expect(describeWasmExecute({ claim_creator_fees: {} })?.label).toBe('Claim Creator Fees');
    });

    it('labels pool creation with the token symbol', () => {
        const info = describeWasmExecute({
            create: {
                pool_msg: { pool_token_info: [] },
                token_info: { name: 'Brand Token', symbol: 'BRAND', decimal: 6 },
            },
        });
        expect(info?.label).toBe('Create Creator Pool');
        expect(info?.detail).toContain('BRAND');
    });

    it('title-cases unknown actions instead of failing', () => {
        expect(describeWasmExecute({ some_future_action: {} })?.label).toBe('Some Future Action');
    });

    it('returns null for undecodable payloads', () => {
        expect(describeWasmExecute('not-base64-json')).toBeNull();
        expect(describeWasmExecute(undefined)).toBeNull();
    });
});
