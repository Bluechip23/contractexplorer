// Chain + endpoint configuration. The defaults below target the Osmosis
// testnet (osmo-test-5) deployment of the BlueChip creator-pool
// contracts; sites can override any of them via BluechipWidget.init({...})
// before mounting (and MUST override `pool` per creator, either in init
// or per-mount). When the contracts ship on osmosis-1 mainnet, point the
// widget at it with init({ chainId: 'osmosis-1', chainName: 'Osmosis',
// rpc: ..., rest: ... }) — denom (uosmo) and prefix (osmo) are the same.

export interface WidgetConfig {
    chainId: string;
    chainName: string;
    rpc: string;
    rest: string;
    nativeDenom: string;
    coinDenom: string;
    coinDecimals: number;
    bech32Prefix: string;
    gasPrice: { low: number; average: number; high: number };
    /** Default pool for mounts that don't pass their own. */
    pool: string | null;
}

export const DEFAULT_CONFIG: WidgetConfig = {
    chainId: 'osmo-test-5',
    chainName: 'Osmosis Testnet',
    rpc: 'https://rpc.osmotest5.osmosis.zone',
    rest: 'https://lcd.osmotest5.osmosis.zone',
    nativeDenom: 'uosmo',
    coinDenom: 'OSMO',
    coinDecimals: 6,
    bech32Prefix: 'osmo',
    gasPrice: { low: 0.0025, average: 0.025, high: 0.04 },
    pool: null,
};

let active: WidgetConfig = { ...DEFAULT_CONFIG };

export function init(overrides: Partial<WidgetConfig> = {}): WidgetConfig {
    active = { ...active, ...overrides };
    return active;
}

export function getConfig(): WidgetConfig {
    return active;
}

/** Keplr experimentalSuggestChain payload derived from the config. */
export function keplrChainInfo(cfg: WidgetConfig) {
    const currency = {
        coinDenom: cfg.coinDenom,
        coinMinimalDenom: cfg.nativeDenom,
        coinDecimals: cfg.coinDecimals,
    };
    return {
        chainId: cfg.chainId,
        chainName: cfg.chainName,
        rpc: cfg.rpc,
        rest: cfg.rest,
        bip44: { coinType: 118 },
        bech32Config: {
            bech32PrefixAccAddr: cfg.bech32Prefix,
            bech32PrefixAccPub: `${cfg.bech32Prefix}pub`,
            bech32PrefixValAddr: `${cfg.bech32Prefix}valoper`,
            bech32PrefixValPub: `${cfg.bech32Prefix}valoperpub`,
            bech32PrefixConsAddr: `${cfg.bech32Prefix}valcons`,
            bech32PrefixConsPub: `${cfg.bech32Prefix}valconspub`,
        },
        currencies: [currency],
        feeCurrencies: [{ ...currency, gasPriceStep: cfg.gasPrice }],
        stakeCurrency: currency,
    };
}
