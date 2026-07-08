// Chain + endpoint configuration. The defaults below are the values
// published for BlueChip mainnet; sites can override any of them via
// BluechipWidget.init({...}) before mounting (and MUST override `pool`
// per creator, either in init or per-mount).

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
    chainId: 'bluechip-3',
    chainName: 'Bluechip Mainnet',
    rpc: 'https://bluechip.rpc.bluechip.link',
    rest: 'https://bluechip.api.bluechip.link',
    nativeDenom: 'ubluechip',
    coinDenom: 'BLUECHIP',
    coinDecimals: 6,
    bech32Prefix: 'bluechip',
    gasPrice: { low: 0.01, average: 0.025, high: 0.04 },
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
