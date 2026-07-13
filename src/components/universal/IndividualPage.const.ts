import { CHAIN_CONFIG, NATIVE_DENOM, NETWORK } from '../../defi/types';

// Osmosis RPC/LCD endpoints. Defaults follow the selected network
// (REACT_APP_NETWORK, testnet unless set to 'mainnet'); each value can be
// overridden individually for private nodes or load-balanced endpoints.
export const rpcEndpoint = process.env.REACT_APP_RPC_ENDPOINT || CHAIN_CONFIG.rpc;
export const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || CHAIN_CONFIG.rest;
export const denom = NATIVE_DENOM;

// Deployed contract addresses (bluechip-osmosis-contract, osmo_testnet_v2
// deployment). Mainnet has no deployed factory yet — REACT_APP_FACTORY_ADDRESS
// / REACT_APP_ROUTER_ADDRESS must be provided when REACT_APP_NETWORK=mainnet.
const TESTNET_FACTORY = 'osmo1p93hcfzjnjfv0vtfxmunpqc25tq3p2vzh76hq3wxfz2zyayw4hzq4ac3vt';
const TESTNET_ROUTER = 'osmo1wwx4sw56hc7srmcv2cu2un58kg2k34t9zlmrqj2244glj26fsj6q2z8jy2';

export const factoryAddress =
    process.env.REACT_APP_FACTORY_ADDRESS || (NETWORK === 'testnet' ? TESTNET_FACTORY : '');
export const routerAddress =
    process.env.REACT_APP_ROUTER_ADDRESS || (NETWORK === 'testnet' ? TESTNET_ROUTER : '');

// Base URL of the creator-profiles service (names + link pages). Empty
// string disables profile features gracefully (pages fall back to
// pool-address-only lookups).
export const profilesApiUrl = process.env.REACT_APP_PROFILES_URL || 'http://localhost:4317';
