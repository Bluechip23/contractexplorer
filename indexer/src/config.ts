function envInt(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) throw new Error(`${name} must be an integer, got "${raw}"`);
    return n;
}

export interface Config {
    rpcUrl: string;
    apiPort: number;
    dbPath: string;
    startHeight: number;
    nativeDenom: string;
    pollIntervalMs: number;
    batchSize: number;
    // When set, only wasm events from this factory register new pools.
    // Pool-level events are always accepted for pools already discovered
    // (or for any contract when no factory filter is configured).
    factoryAddress: string | null;
}

// Deployed BlueChip factory on Osmosis testnet (osmo-test-5). Used as the
// default pool-discovery authority so the indexer only registers pools the
// real factory created. Override FACTORY_ADDRESS for mainnet (osmosis-1),
// which is not deployed yet.
const DEFAULT_TESTNET_FACTORY =
    'osmo1p93hcfzjnjfv0vtfxmunpqc25tq3p2vzh76hq3wxfz2zyayw4hzq4ac3vt';

export function loadConfig(): Config {
    return {
        // A pruning-free (archive) node is required: the indexer reads
        // /block_results, which most public RPCs prune. Default points at a
        // local node; set RPC_URL to your own Osmosis archive endpoint.
        rpcUrl: (process.env.RPC_URL || 'http://localhost:26657').replace(/\/+$/, ''),
        apiPort: envInt('API_PORT', 4316),
        dbPath: process.env.DB_PATH || './bluechip-indexer.db',
        startHeight: envInt('START_HEIGHT', 1),
        // Osmosis native denom. Classifies swap direction (uosmo offered =
        // buy of the creator token). Override for a different chain/denom.
        nativeDenom: process.env.NATIVE_DENOM || 'uosmo',
        pollIntervalMs: envInt('POLL_INTERVAL_MS', 1500),
        batchSize: envInt('BATCH_SIZE', 20),
        factoryAddress: process.env.FACTORY_ADDRESS || DEFAULT_TESTNET_FACTORY,
    };
}
