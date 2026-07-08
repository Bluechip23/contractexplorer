// DOM widgets. Deliberately dependency-free and style-light: a scoped
// stylesheet is injected once, and every class is prefixed `bcw-` so it
// can't collide with the host page.

import { getConfig } from './config.ts';
import { checkSubscription, subscribe } from './chain.ts';
import type { GateResult } from './messages.ts';

const STYLE_ID = 'bluechip-widget-style';

const CSS = `
.bcw-box{font-family:system-ui,-apple-system,sans-serif;display:inline-flex;flex-direction:column;gap:8px;max-width:320px}
.bcw-row{display:flex;gap:8px}
.bcw-input{flex:1;min-width:0;padding:10px 12px;border:1px solid #c8cdd4;border-radius:8px;font-size:15px}
.bcw-btn{padding:10px 18px;border:none;border-radius:8px;background:#1d4ed8;color:#fff;font-size:15px;font-weight:600;cursor:pointer;white-space:nowrap}
.bcw-btn:hover{background:#1e40af}
.bcw-btn[disabled]{opacity:.6;cursor:default}
.bcw-status{font-size:13px;min-height:1em}
.bcw-status.bcw-ok{color:#15803d}
.bcw-status.bcw-err{color:#b91c1c}
.bcw-hash{font-family:ui-monospace,monospace;font-size:12px;word-break:break-all;color:#374151}
`;

function ensureStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}

function resolveEl(target: Element | string): Element {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) throw new Error(`BluechipWidget: no element matches "${target}"`);
    return el;
}

export interface SubscribeMountOptions {
    pool?: string;
    /** Pre-filled amount in whole bluechip. */
    defaultAmount?: string;
    /** Hide the amount input and always use defaultAmount. */
    fixedAmount?: boolean;
    label?: string;
    onSubscribed?: (r: { txHash: string; address: string }) => void;
    onError?: (err: Error) => void;
}

export function mountSubscribe(target: Element | string, opts: SubscribeMountOptions = {}): void {
    ensureStyles();
    const el = resolveEl(target);
    const cfg = getConfig();

    const box = document.createElement('div');
    box.className = 'bcw-box';

    const row = document.createElement('div');
    row.className = 'bcw-row';

    const input = document.createElement('input');
    input.className = 'bcw-input';
    input.type = 'number';
    input.min = '0';
    input.placeholder = `Amount (${cfg.coinDenom})`;
    if (opts.defaultAmount) input.value = opts.defaultAmount;
    if (!opts.fixedAmount) row.appendChild(input);

    const btn = document.createElement('button');
    btn.className = 'bcw-btn';
    btn.type = 'button';
    btn.textContent = opts.label ?? 'Subscribe';
    row.appendChild(btn);

    const status = document.createElement('div');
    status.className = 'bcw-status';

    box.append(row, status);
    el.replaceChildren(box);

    btn.addEventListener('click', () => {
        void (async () => {
            const amount = opts.fixedAmount ? (opts.defaultAmount ?? '') : input.value;
            status.className = 'bcw-status';
            status.textContent = 'Waiting for wallet…';
            btn.disabled = true;
            try {
                const result = await subscribe({ pool: opts.pool, amount });
                status.className = 'bcw-status bcw-ok';
                status.replaceChildren(
                    document.createTextNode('Subscribed! '),
                    Object.assign(document.createElement('div'), {
                        className: 'bcw-hash',
                        textContent: `tx: ${result.txHash}`,
                    }),
                );
                opts.onSubscribed?.(result);
            } catch (err) {
                status.className = 'bcw-status bcw-err';
                status.textContent = (err as Error).message;
                opts.onError?.(err as Error);
            } finally {
                btn.disabled = false;
            }
        })();
    });
}

export interface GateMountOptions {
    pool?: string;
    /** Minimum lifetime USD committed to pass the gate. */
    minUsd?: number;
    /** Text on the unlock button shown to unverified viewers. */
    label?: string;
    /** Message shown when the viewer doesn't meet the gate. */
    deniedText?: string;
    onResult?: (r: GateResult) => void;
}

/** Hides the target element until the connected wallet's on-chain commit
 * record passes the gate. Client-side only — see checkSubscription docs. */
export function mountGate(target: Element | string, opts: GateMountOptions = {}): void {
    ensureStyles();
    const el = resolveEl(target) as HTMLElement;
    el.hidden = true;

    const prompt = document.createElement('div');
    prompt.className = 'bcw-box';

    const btn = document.createElement('button');
    btn.className = 'bcw-btn';
    btn.type = 'button';
    btn.textContent = opts.label ?? 'Unlock with your subscription';

    const status = document.createElement('div');
    status.className = 'bcw-status';

    prompt.append(btn, status);
    el.before(prompt);

    btn.addEventListener('click', () => {
        void (async () => {
            status.className = 'bcw-status';
            status.textContent = 'Checking subscription…';
            btn.disabled = true;
            try {
                const result = await checkSubscription({ pool: opts.pool, minUsd: opts.minUsd });
                opts.onResult?.(result);
                if (result.subscribed) {
                    prompt.remove();
                    el.hidden = false;
                } else {
                    status.className = 'bcw-status bcw-err';
                    status.textContent = opts.deniedText
                        ?? (result.record
                            ? `Your subscription total ($${result.totalUsd.toLocaleString()}) is below the required $${(opts.minUsd ?? 0).toLocaleString()}.`
                            : 'No subscription found for this wallet.');
                }
            } catch (err) {
                status.className = 'bcw-status bcw-err';
                status.textContent = (err as Error).message;
                opts.onResult?.({ subscribed: false, totalUsd: 0, record: null });
            } finally {
                btn.disabled = false;
            }
        })();
    });
}

/** Auto-mount declarative embeds:
 *   <div data-bluechip-subscribe data-pool="bluechip1..." data-amount="25"></div>
 *   <div data-bluechip-gate data-pool="bluechip1..." data-min-usd="5">gated content</div>
 */
export function scan(root: ParentNode = document): void {
    root.querySelectorAll('[data-bluechip-subscribe]').forEach((el) => {
        if ((el as HTMLElement).dataset.bcwMounted) return;
        (el as HTMLElement).dataset.bcwMounted = '1';
        const d = (el as HTMLElement).dataset;
        mountSubscribe(el, {
            pool: d.pool,
            defaultAmount: d.amount,
            fixedAmount: d.fixedAmount !== undefined,
            label: d.label,
        });
    });
    root.querySelectorAll('[data-bluechip-gate]').forEach((el) => {
        if ((el as HTMLElement).dataset.bcwMounted) return;
        (el as HTMLElement).dataset.bcwMounted = '1';
        const d = (el as HTMLElement).dataset;
        mountGate(el, {
            pool: d.pool,
            minUsd: d.minUsd ? Number(d.minUsd) : 0,
            label: d.label,
            deniedText: d.deniedText,
        });
    });
}
