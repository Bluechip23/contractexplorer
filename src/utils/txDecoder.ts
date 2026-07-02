import { formatMicroAmount } from './bigintMath';

const MESSAGE_TYPE_MAP: Record<string, string> = {
    '/cosmos.bank.v1beta1.MsgSend': 'Send',
    '/cosmos.staking.v1beta1.MsgDelegate': 'Delegate',
    '/cosmos.staking.v1beta1.MsgUndelegate': 'Undelegate',
    '/cosmos.staking.v1beta1.MsgBeginRedelegate': 'Redelegate',
    '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward': 'Claim Rewards',
    '/cosmos.gov.v1beta1.MsgVote': 'Vote',
    '/cosmos.gov.v1beta1.MsgSubmitProposal': 'Submit Proposal',
    '/cosmos.gov.v1beta1.MsgDeposit': 'Deposit',
    '/ibc.core.client.v1.MsgUpdateClient': 'IBC Update Client',
    '/ibc.core.channel.v1.MsgRecvPacket': 'IBC Receive',
    '/ibc.core.channel.v1.MsgAcknowledgement': 'IBC Acknowledge',
    '/ibc.core.channel.v1.MsgTimeout': 'IBC Timeout',
    '/ibc.applications.transfer.v1.MsgTransfer': 'IBC Transfer',
    '/cosmwasm.wasm.v1.MsgExecuteContract': 'Execute Contract',
    '/cosmwasm.wasm.v1.MsgInstantiateContract': 'Instantiate Contract',
    '/cosmwasm.wasm.v1.MsgStoreCode': 'Store Code',
    '/cosmwasm.wasm.v1.MsgMigrateContract': 'Migrate Contract',
};

export function decodeMessageType(typeUrl: string): string {
    if (!typeUrl) return 'Unknown';
    return MESSAGE_TYPE_MAP[typeUrl] || typeUrl.split('.').pop()?.replace('Msg', '') || typeUrl;
}

export function formatDenom(denom: string): string {
    if (!denom) return '';
    if (denom.startsWith('u')) {
        return denom.slice(1).toUpperCase();
    }
    if (denom.startsWith('ibc/')) {
        return `IBC/${denom.slice(4, 10)}...`;
    }
    return denom.toUpperCase();
}

export function formatAmount(amount: string | number, denom?: string): string {
    // u-prefixed denoms (e.g. ubluechip, uatom) are micro-units with 6 decimals.
    if (denom?.startsWith('u')) {
        return formatMicroAmount(amount, 6, 6);
    }
    const num = typeof amount === 'string' ? Number(amount) : amount;
    if (!Number.isFinite(num)) return '0';
    return num.toLocaleString();
}

// ---------------------------------------------------------------------------
// Wasm execute humanization.
//
// MsgExecuteContract renders as a generic "Execute Contract" from the
// type URL alone; the actual action lives in the execute msg JSON
// (base64 in LCD responses). Map the BlueChip contract entry points to
// labels a human can read on the transaction page.
// ---------------------------------------------------------------------------

export interface WasmActionInfo {
    label: string;       // short chip text, e.g. "Commit"
    detail?: string;     // one-line description with amounts
}

function titleCase(snake: string): string {
    return snake.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function decodeExecuteMsg(raw: unknown): Record<string, any> | null {
    if (raw && typeof raw === 'object') return raw as Record<string, any>;
    if (typeof raw !== 'string') return null;
    try {
        return JSON.parse(atob(raw));
    } catch {
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }
}

const WASM_ACTION_LABELS: Record<string, string> = {
    commit: 'Commit',
    simple_swap: 'Swap',
    deposit_liquidity: 'Provide Liquidity',
    add_to_position: 'Add To LP Position',
    remove_all_liquidity: 'Remove Liquidity',
    remove_partial_liquidity: 'Remove Liquidity',
    remove_partial_liquidity_by_percent: 'Remove Liquidity',
    collect_fees: 'Collect LP Fees',
    claim_creator_fees: 'Claim Creator Fees',
    claim_creator_excess_liquidity: 'Claim Excess Liquidity',
    continue_distribution: 'Distribute Payouts',
    create: 'Create Commit Pool',
    create_standard_pool: 'Create Standard Pool',
    execute_multi_hop: 'Multi-Hop Swap',
    increase_allowance: 'Approve Token Spend',
    decrease_allowance: 'Revoke Token Allowance',
    transfer: 'Transfer Tokens',
    update_marketing: 'Update Token Branding',
    upload_logo: 'Upload Token Logo',
    retry_factory_notify: 'Retry Factory Notify',
    update_oracle_price: 'Update Oracle Price',
};

// `msg` is the MsgExecuteContract msg field: either base64 (LCD JSON)
// or an already-decoded object. Returns null when the payload can't be
// read; callers fall back to the generic type-URL label.
export function describeWasmExecute(msg: unknown): WasmActionInfo | null {
    const decoded = decodeExecuteMsg(msg);
    if (!decoded) return null;
    const action = Object.keys(decoded)[0];
    if (!action) return null;
    const body = decoded[action] ?? {};

    switch (action) {
        case 'commit': {
            const amt = body?.asset?.amount;
            return {
                label: 'Commit',
                detail: amt ? `Committed ${formatMicroAmount(amt)} bluechip` : undefined,
            };
        }
        case 'simple_swap': {
            const amt = body?.offer_asset?.amount;
            const isNative = !!body?.offer_asset?.info?.bluechip;
            return {
                label: 'Swap',
                detail: amt
                    ? `Swapped ${formatMicroAmount(amt)} ${isNative ? 'bluechip for creator tokens' : 'creator tokens for bluechip'}`
                    : undefined,
            };
        }
        case 'send': {
            // CW20 send with an embedded hook — for BlueChip pools this is
            // the sell path (Cw20HookMsg::Swap).
            const hook = decodeExecuteMsg(body?.msg);
            const hookAction = hook ? Object.keys(hook)[0] : null;
            if (hookAction === 'swap') {
                return {
                    label: 'Swap',
                    detail: body?.amount
                        ? `Sold ${formatMicroAmount(body.amount)} creator tokens for bluechip`
                        : undefined,
                };
            }
            return {
                label: 'Send Tokens',
                detail: body?.amount ? `Sent ${formatMicroAmount(body.amount)} tokens` : undefined,
            };
        }
        case 'deposit_liquidity':
        case 'add_to_position': {
            const a0 = body?.amount0;
            const a1 = body?.amount1;
            return {
                label: WASM_ACTION_LABELS[action],
                detail: a0 && a1
                    ? `${formatMicroAmount(a0)} bluechip + ${formatMicroAmount(a1)} creator tokens`
                    : undefined,
            };
        }
        case 'remove_partial_liquidity_by_percent':
            return {
                label: 'Remove Liquidity',
                detail: body?.percentage !== undefined
                    ? `Removed ${body.percentage}% of position ${body?.position_id ?? ''}`.trim()
                    : undefined,
            };
        case 'remove_all_liquidity':
        case 'remove_partial_liquidity':
        case 'collect_fees':
            return {
                label: WASM_ACTION_LABELS[action],
                detail: body?.position_id ? `Position ${body.position_id}` : undefined,
            };
        case 'create':
            return {
                label: 'Create Commit Pool',
                detail: body?.token_info?.symbol
                    ? `Launched ${body.token_info.symbol} (${body?.token_info?.name ?? ''})`.trim()
                    : undefined,
            };
        case 'transfer':
            return {
                label: 'Transfer Tokens',
                detail: body?.amount && body?.recipient
                    ? `${formatMicroAmount(body.amount)} tokens to ${String(body.recipient).slice(0, 14)}...`
                    : undefined,
            };
        default:
            return { label: WASM_ACTION_LABELS[action] ?? titleCase(action) };
    }
}
