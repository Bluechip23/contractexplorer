// Network selection for the Osmosis deployment of the BlueChip creator-pool
// contracts. The factory/router are deployed on osmo-test-5 today, so the
// app defaults to testnet; set REACT_APP_NETWORK=mainnet once the mainnet
// factory address is live. Individual endpoints/addresses can still be
// overridden one-by-one via REACT_APP_* vars (see IndividualPage.const.ts).
export type NetworkName = 'testnet' | 'mainnet';

export const NETWORK: NetworkName =
    process.env.REACT_APP_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

// The chain's native asset. Commits, swaps and liquidity all pair the
// creator token against this denom. NOTE: the contract wire format still
// tags the native side of a pair as `{ bluechip: { denom: "uosmo" } }` —
// the JSON key is a legacy serde rename, the denom is what matters.
export const NATIVE_DENOM = 'uosmo';
export const NATIVE_SYMBOL = 'OSMO';
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

const OSMO_CURRENCY: CurrencyConfig = {
    coinDenom: NATIVE_SYMBOL,
    coinMinimalDenom: NATIVE_DENOM,
    coinDecimals: COIN_DECIMALS,
    coinGeckoId: 'osmosis',
};

const OSMO_FEE_CURRENCY: FeeCurrencyConfig = {
    ...OSMO_CURRENCY,
    gasPriceStep: { low: 0.0025, average: 0.025, high: 0.04 },
};

const OSMOSIS_BECH32 = {
    bech32PrefixAccAddr: 'osmo',
    bech32PrefixAccPub: 'osmopub',
    bech32PrefixValAddr: 'osmovaloper',
    bech32PrefixValPub: 'osmovaloperpub',
    bech32PrefixConsAddr: 'osmovalcons',
    bech32PrefixConsPub: 'osmovalconspub',
};

export const OSMOSIS_TESTNET_CONFIG: ChainConfig = {
    chainId: 'osmo-test-5',
    chainName: 'Osmosis Testnet',
    rpc: 'https://rpc.osmotest5.osmosis.zone',
    rest: 'https://lcd.osmotest5.osmosis.zone',
    bip44: { coinType: 118 },
    bech32Config: OSMOSIS_BECH32,
    currencies: [OSMO_CURRENCY],
    feeCurrencies: [OSMO_FEE_CURRENCY],
    stakeCurrency: OSMO_CURRENCY,
};

export const OSMOSIS_MAINNET_CONFIG: ChainConfig = {
    chainId: 'osmosis-1',
    chainName: 'Osmosis',
    rpc: 'https://rpc.osmosis.zone',
    rest: 'https://lcd.osmosis.zone',
    bip44: { coinType: 118 },
    bech32Config: OSMOSIS_BECH32,
    currencies: [OSMO_CURRENCY],
    feeCurrencies: [OSMO_FEE_CURRENCY],
    stakeCurrency: OSMO_CURRENCY,
};

export const CHAIN_CONFIG: ChainConfig =
    NETWORK === 'mainnet' ? OSMOSIS_MAINNET_CONFIG : OSMOSIS_TESTNET_CONFIG;

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
