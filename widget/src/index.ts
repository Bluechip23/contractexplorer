// Public entry point. Bundled as an IIFE exposing window.BluechipWidget
// (see build.mjs), so a site embeds it with a single script tag:
//
//   <script src="https://cdn.jsdelivr.net/gh/Bluechip23/bluechipblockexplorer@main/widget/dist/bluechip-widget.min.js"></script>
//   <div data-bluechip-subscribe data-pool="bluechip1yourpool"></div>

import { init, getConfig } from './config.ts';
import { connect, disconnect, getAddress, subscribe, checkSubscription } from './chain.ts';
import { mountSubscribe, mountGate, scan } from './ui.ts';
import { toMicro, fromMicro } from './messages.ts';

declare const __WIDGET_VERSION__: string;

const api = {
    version: __WIDGET_VERSION__,
    init,
    getConfig,
    connect,
    disconnect,
    getAddress,
    subscribe,
    checkSubscription,
    mountSubscribe,
    mountGate,
    scan,
    // conversion helpers, handy for custom UIs
    toMicro,
    fromMicro,
};

export default api;

// The IIFE bundle attaches the API to the page's global scope directly
// (cleaner than esbuild's global-name wrapper, which nests everything
// under `.default`).
(globalThis as Record<string, unknown>).BluechipWidget = api;

// Auto-mount declarative embeds once the DOM is ready.
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => scan());
    } else {
        scan();
    }
}
