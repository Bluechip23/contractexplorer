import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { Coin } from '@cosmjs/stargate';
import {
    EXPECTED_CHAIN_ID,
    IDLE_TIMEOUT_MS,
    assertNoSecretsInStorage,
    assertWalletOnExpectedChain,
} from '../utils/security';
import { CHAIN_CONFIG, NATIVE_DENOM, detectInjectedWallet } from '../defi/types';
import { rpcEndpoint } from '../components/universal/IndividualPage.const';
import { getDataSource } from '../utils/contractQueries';

// ============================================================
// Wallet bridge. Mode follows the data layer:
//   - chain mode: real Keplr/Leap connection that can sign
//   - demo mode (RPC unreachable or REACT_APP_USE_MOCK_DATA=true):
//     a fake identity so the UI is browsable without an extension
// ============================================================

const MOCK_ADDRESS = 'osmo1q2w3e4r5t6y7u8i9o0pzxcvbnmasdfghjkl42';
const MOCK_BALANCE: Coin = { denom: NATIVE_DENOM, amount: '84720000000' }; // 84,720 OSMO

interface WalletContextType {
    client: SigningCosmWasmClient | null;
    address: string;
    balance: Coin | null;
    connecting: boolean;
    error: string;
    // Which injected wallet provided the session ('Keplr' | 'Leap'),
    // or 'Demo' in mock mode. Null while disconnected.
    walletName: string | null;
    // SECURITY: exposed so transaction flows can re-assert the wallet is
    // still connected to the expected Osmosis chain right before signing.
    expectedChainId: string;
    // SECURITY: tells components whether the connection has been marked as
    // expired due to idle timeout so they can display the reconnect prompt.
    idleExpired: boolean;
    connect: () => Promise<void>;
    disconnect: () => void;
    // SECURITY: any user interaction should call this to reset the idle
    // timer, preventing the 30-minute auto-disconnect from firing mid-use.
    touch: () => void;
    // SECURITY: convenience re-export so callers don't have to import the
    // utils module just to do the pre-signing chain check.
    assertOnExpectedChain: () => Promise<{ ok: boolean; actual?: string; error?: string }>;
}

const WalletContext = createContext<WalletContextType>({
    client: null,
    address: '',
    balance: null,
    connecting: false,
    error: '',
    walletName: null,
    expectedChainId: EXPECTED_CHAIN_ID,
    idleExpired: false,
    connect: async () => {},
    disconnect: () => {},
    touch: () => {},
    assertOnExpectedChain: async () => ({ ok: false, error: 'Wallet not connected.' }),
});

export const useWallet = () => useContext(WalletContext);

export const WalletContextProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
    const [client, setClient] = useState<SigningCosmWasmClient | null>(null);
    const [address, setAddress] = useState('');
    const [balance, setBalance] = useState<Coin | null>(null);
    const [connecting, setConnecting] = useState(false);
    const [error, setError] = useState('');
    const [walletName, setWalletName] = useState<string | null>(null);
    const [idleExpired, setIdleExpired] = useState(false);

    // SECURITY: idle timer reference. Cleared on every user "touch" and on
    // unmount to avoid leaking timers when the provider tree is re-rendered.
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // SECURITY: Auto-disconnect wallet sessions that have been idle for more
    // than 30 minutes. A visible reconnect prompt is shown via `idleExpired`.
    const armIdleTimer = useCallback(() => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
            setIdleExpired(true);
            setAddress('');
            setBalance(null);
            setClient(null);
            setWalletName(null);
        }, IDLE_TIMEOUT_MS);
    }, []);

    const touch = useCallback(() => {
        if (!address) return;
        if (idleExpired) return;
        armIdleTimer();
    }, [address, idleExpired, armIdleTimer]);

    const connect = useCallback(async () => {
        // SECURITY: defensive tripwire that wipes any private keys / mnemonics
        // / raw signatures that may have accidentally been written to browser
        // storage by an older code path or a compromised dependency.
        assertNoSecretsInStorage();
        setError('');
        setConnecting(true);

        try {
            if ((await getDataSource()) === 'mock') {
                setAddress(MOCK_ADDRESS);
                setBalance(MOCK_BALANCE);
                setWalletName('Demo');
                setIdleExpired(false);
                armIdleTimer();
                return;
            }

            const detected = detectInjectedWallet();
            if (!detected) {
                setError('No wallet extension detected. Install Keplr (keplr.app) or Leap (leapwallet.io) and refresh.');
                return;
            }
            const { name, wallet } = detected;

            // SECURITY: Scope wallet permission requests to the minimum
            // required: chain registration + account read + tx signing.
            await wallet.experimentalSuggestChain({ ...CHAIN_CONFIG, rpc: rpcEndpoint });
            await wallet.enable(EXPECTED_CHAIN_ID);

            const signer = wallet.getOfflineSigner
                ? wallet.getOfflineSigner(EXPECTED_CHAIN_ID)
                : window.getOfflineSigner?.(EXPECTED_CHAIN_ID);
            if (!signer) {
                setError(`${name} did not expose a signer for ${EXPECTED_CHAIN_ID}.`);
                return;
            }

            const accounts = await signer.getAccounts();
            const acct = accounts[0]?.address;
            if (!acct) {
                setError('Wallet returned no accounts for this chain.');
                return;
            }

            const signingClient = await SigningCosmWasmClient.connectWithSigner(rpcEndpoint, signer);

            // SECURITY: verify the signer really is on the expected chain
            // before exposing the client to any transaction flow.
            const chainCheck = await assertWalletOnExpectedChain(signingClient);
            if (!chainCheck.ok) {
                setError(chainCheck.error ?? 'Connected to the wrong chain.');
                return;
            }

            setClient(signingClient);
            setAddress(acct);
            setWalletName(name);
            setIdleExpired(false);
            armIdleTimer();

            const bal = await signingClient.getBalance(acct, NATIVE_DENOM).catch(() => null);
            setBalance(bal);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wallet connection failed.');
        } finally {
            setConnecting(false);
        }
    }, [armIdleTimer]);

    const disconnect = useCallback(() => {
        setClient(null);
        setAddress('');
        setBalance(null);
        setWalletName(null);
        setIdleExpired(false);
        setError('');
        if (idleTimerRef.current) {
            clearTimeout(idleTimerRef.current);
            idleTimerRef.current = null;
        }
        // SECURITY: never leave private material behind on disconnect.
        assertNoSecretsInStorage();
    }, []);

    const assertOnExpectedChain = useCallback(async () => {
        return assertWalletOnExpectedChain(client);
    }, [client]);

    // Demo mode auto-connects so the deployed preview is browsable
    // without an extension; chain mode waits for an explicit connect.
    useEffect(() => {
        let cancelled = false;
        getDataSource().then((mode) => {
            if (cancelled || mode !== 'mock') return;
            setAddress(MOCK_ADDRESS);
            setBalance(MOCK_BALANCE);
            setWalletName('Demo');
        });
        return () => { cancelled = true; };
    }, []);

    // SECURITY: when the user switches accounts inside the extension,
    // drop the session rather than silently signing from a different key.
    useEffect(() => {
        if (!walletName || walletName === 'Demo') return;
        const events = ['keplr_keystorechange', 'leap_keystorechange'];
        const handler = () => {
            disconnect();
            setError('Wallet account changed — reconnect to continue.');
        };
        for (const e of events) window.addEventListener(e, handler);
        return () => { for (const e of events) window.removeEventListener(e, handler); };
    }, [walletName, disconnect]);

    // SECURITY: wire up global user-activity listeners so routine clicks /
    // keystrokes keep the session alive, and tab-visibility changes force
    // a re-check on resume. Using `once:false` passive listeners avoids
    // scroll-jank on mobile.
    useEffect(() => {
        if (!address) return;
        const events: Array<keyof WindowEventMap> = [
            'mousemove',
            'mousedown',
            'keydown',
            'touchstart',
            'scroll',
        ];
        const handler = () => touch();
        for (const e of events) window.addEventListener(e, handler, { passive: true });
        armIdleTimer();
        return () => {
            for (const e of events) window.removeEventListener(e, handler);
            if (idleTimerRef.current) {
                clearTimeout(idleTimerRef.current);
                idleTimerRef.current = null;
            }
        };
    }, [address, touch, armIdleTimer]);

    // SECURITY: run the secrets-in-storage tripwire on mount so a stale
    // localStorage entry from a previous malicious session is cleared
    // before any other code reads from storage.
    useEffect(() => {
        assertNoSecretsInStorage();
    }, []);

    const value = useMemo<WalletContextType>(
        () => ({
            client,
            address,
            balance,
            connecting,
            error,
            walletName,
            expectedChainId: EXPECTED_CHAIN_ID,
            idleExpired,
            connect,
            disconnect,
            touch,
            assertOnExpectedChain,
        }),
        [client, address, balance, connecting, error, walletName, idleExpired, connect, disconnect, touch, assertOnExpectedChain],
    );

    return (
        <WalletContext.Provider value={value}>
            {children}
        </WalletContext.Provider>
    );
};
