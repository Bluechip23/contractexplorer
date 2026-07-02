export const NATIVE_DENOM = 'ubluechip';
export const COIN_DECIMALS = 6;

export interface ChainConfig {
    chainId: string;
    chainName: string;
    rpc: string;
    rest: string;
    bip44: { coinType: number };
    bech32Config: {
        bech32PrefixAccAddr: string;
        bech32PrefixAccPub: string;
        bech32PrefixValAddr: string;
        bech32PrefixValPub: string;
        bech32PrefixConsAddr: string;
        bech32PrefixConsPub: string;
    };
    currencies: CurrencyConfig[];
    feeCurrencies: FeeCurrencyConfig[];
    stakeCurrency: CurrencyConfig;
}

export interface CurrencyConfig {
    coinDenom: string;
    coinMinimalDenom: string;
    coinDecimals: number;
    coinGeckoId: string;
}

export interface FeeCurrencyConfig extends CurrencyConfig {
    gasPriceStep: {
        low: number;
        average: number;
        high: number;
    };
}

export const MAINNET_CONFIG: ChainConfig = {
    chainId: 'bluechip-3',
    chainName: 'Bluechip Mainnet',
    rpc: 'https://bluechip.rpc.bluechip.link',
    rest: 'https://bluechip.api.bluechip.link',
    bip44: { coinType: 118 },
    bech32Config: {
        bech32PrefixAccAddr: 'bluechip',
        bech32PrefixAccPub: 'bluechippub',
        bech32PrefixValAddr: 'bluechipvaloper',
        bech32PrefixValPub: 'bluechipvaloperpub',
        bech32PrefixConsAddr: 'bluechipvalcons',
        bech32PrefixConsPub: 'bluechipvalconspub',
    },
    currencies: [{
        coinDenom: 'bluechip',
        coinMinimalDenom: 'ubluechip',
        coinDecimals: 6,
        coinGeckoId: 'bluechip',
    }],
    feeCurrencies: [{
        coinDenom: 'bluechip',
        coinMinimalDenom: 'ubluechip',
        coinDecimals: 6,
        coinGeckoId: 'bluechip',
        gasPriceStep: { low: 0.01, average: 0.025, high: 0.04 },
    }],
    stakeCurrency: {
        coinDenom: 'bluechip',
        coinMinimalDenom: 'ubluechip',
        coinDecimals: 6,
        coinGeckoId: 'bluechip',
    },
};

// Keplr-compatible injected wallet API. Leap implements the same
// surface (suggest chain, enable, per-provider getOfflineSigner), so a
// single interface covers both extensions.
export interface InjectedWallet {
    experimentalSuggestChain: (config: ChainConfig) => Promise<void>;
    enable: (chainId: string) => Promise<void>;
    getOfflineSigner?: (chainId: string) => import('@cosmjs/proto-signing').OfflineSigner;
}

declare global {
    interface Window {
        keplr?: InjectedWallet;
        leap?: InjectedWallet;
        getOfflineSigner?: (chainId: string) => import('@cosmjs/proto-signing').OfflineSigner;
    }
}

// Prefer Keplr when both extensions are installed (it registers the
// window-level getOfflineSigner fallback older code relies on).
export function detectInjectedWallet(): { name: 'Keplr' | 'Leap'; wallet: InjectedWallet } | null {
    if (window.keplr) return { name: 'Keplr', wallet: window.keplr };
    if (window.leap) return { name: 'Leap', wallet: window.leap };
    return null;
}
