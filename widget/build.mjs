// Bundles the widget to a single self-contained IIFE (CosmJS included,
// no runtime CDN dependencies). Outputs both a readable and a minified
// build; dist/ is committed so sites can hotlink the file via jsDelivr
// without any npm/registry step.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// @cosmjs/crypto probes for Node's crypto module at runtime and falls
// back to pure-JS (@noble) implementations when it's missing — stub the
// import with an empty module so the browser bundle takes the fallback.
// libsodium backs only the Ed25519/Argon2/xchacha paths in
// @cosmjs/crypto (mnemonic wallets, encrypted key serialization). The
// widget never touches those — Keplr holds the keys and signs — so the
// ~1.1 MB wasm blob is dead weight. The stub keeps the module's lazy
// `await sodium.ready` init happy; any accidental use of a stubbed
// function fails loudly at call time.
const nodeShims = {
    name: 'node-shims',
    setup(b) {
        b.onResolve({ filter: /^crypto$/ }, () => ({ path: 'crypto', namespace: 'empty-shim' }));
        b.onLoad({ filter: /.*/, namespace: 'empty-shim' }, () => ({ contents: 'module.exports = {};' }));
        b.onResolve({ filter: /^libsodium-wrappers-sumo$/ }, () => ({ path: 'sodium', namespace: 'sodium-shim' }));
        b.onLoad({ filter: /.*/, namespace: 'sodium-shim' }, () => ({
            contents: 'module.exports = { default: { ready: Promise.resolve() } };',
        }));
    },
};

const common = {
    plugins: [nodeShims],
    entryPoints: ['src/index.ts'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    define: {
        __WIDGET_VERSION__: JSON.stringify(pkg.version),
        'process.env.NODE_ENV': '"production"',
        global: 'globalThis',
    },
    logLevel: 'info',
};

await build({ ...common, outfile: 'dist/bluechip-widget.js' });
await build({ ...common, minify: true, sourcemap: true, outfile: 'dist/bluechip-widget.min.js' });
