function envInt(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) throw new Error(`${name} must be an integer, got "${raw}"`);
    return n;
}

export interface Config {
    port: number;
    dbPath: string;
    // RPC endpoint used for the committing_info (subscription) checks.
    rpcUrl: string;
    rateLimitPerMin: number;
}

export function loadConfig(): Config {
    return {
        port: envInt('PROFILES_PORT', 4317),
        dbPath: process.env.PROFILES_DB || './profiles.db',
        rpcUrl: (process.env.PROFILES_RPC || 'https://rpc.osmotest5.osmosis.zone').replace(/\/+$/, ''),
        rateLimitPerMin: envInt('RATE_LIMIT_PER_MIN', 300),
    };
}
