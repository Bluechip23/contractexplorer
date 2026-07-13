import React from 'react';
import PageShell from '../components/universal/PageShell';
import {
    Box,
    Card,
    CardContent,
    Grid,
    Stack,
    Typography,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Alert,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CodeBlock from '../components/universal/CodeBlock';
import SectionCard from '../components/universal/DocSectionCard';

// ---------------------------------------------------------------------------
// Deployment facts (osmo_testnet_v2 deployment on Osmosis testnet).
// Keep these in sync with src/components/universal/IndividualPage.const.ts.
// ---------------------------------------------------------------------------
const TESTNET_FACTORY = 'osmo1p93hcfzjnjfv0vtfxmunpqc25tq3p2vzh76hq3wxfz2zyayw4hzq4ac3vt';
const TESTNET_ROUTER = 'osmo1wwx4sw56hc7srmcv2cu2un58kg2k34t9zlmrqj2244glj26fsj6q2z8jy2';

const widgetQuickStartCode = `<!-- 1. Load the BlueChip widget (self-contained, no other scripts needed) -->
<script src="https://cdn.jsdelivr.net/gh/Bluechip23/bluechipblockexplorer@main/widget/dist/bluechip-widget.min.js"><\/script>

<!-- 2. Subscribe button — the ONLY thing you edit is your pool address -->
<div data-bluechip-subscribe data-pool="osmo1YOUR_POOL_ADDRESS" data-amount="10"></div>

<!-- 3. Optional: gate content behind a subscription -->
<div data-bluechip-gate data-pool="osmo1YOUR_POOL_ADDRESS" data-min-usd="5">
    Subscriber-only content.
</div>`;

// Set a site-wide default pool (and optionally override endpoints) once,
// so individual buttons don't need data-pool repeated on each one.
const widgetInitCode = `<script src="https://cdn.jsdelivr.net/gh/Bluechip23/bluechipblockexplorer@main/widget/dist/bluechip-widget.min.js"><\/script>
<script>
  BluechipWidget.init({
    pool: "osmo1YOUR_POOL_ADDRESS",   // default pool for every widget on the page
    // rpc / rest / chainId default to Osmosis testnet (osmo-test-5) —
    // override only if you self-host a node or target mainnet later
  });
<\/script>

<!-- Now buttons can omit data-pool entirely -->
<div data-bluechip-subscribe data-amount="10"></div>`;

// Build your own UI with the same primitives the buttons use.
const widgetJsApiCode = `<script>
  // Connect Keplr (suggests the osmo-test-5 chain automatically)
  const { address } = await BluechipWidget.connect();

  // Subscribe: commit OSMO to a pool. Returns the tx hash.
  const { txHash } = await BluechipWidget.subscribe({
    pool: "osmo1YOUR_POOL_ADDRESS",
    amount: 10,                    // whole OSMO; converted to uosmo micro-units for you
  });

  // Check a wallet's subscription (read-only — no signing needed).
  const gate = await BluechipWidget.checkSubscription({
    pool: "osmo1YOUR_POOL_ADDRESS",
    address,                       // omit to use the connected wallet
    minUsd: 5,                     // threshold in lifetime USD committed
  });
  if (gate.subscribed) {
    console.log("Subscriber — $" + gate.totalUsd + " committed");
  }
<\/script>`;

// CosmJS ships no browser bundle (unpkg .../build/bundle.js 404s), so the
// manual path loads it as an ES module and exposes the global the
// snippets below expect.
const scriptTagsCode = `<!-- CosmJS — required for the hand-rolled snippets below.
     Bundler users: npm install @cosmjs/cosmwasm-stargate@0.32.4 instead. -->
<script type="module">
    import * as cosmwasm from "https://esm.sh/@cosmjs/cosmwasm-stargate@0.32.4";
    window.CosmWasmClient = cosmwasm;   // snippets use CosmWasmClient.SigningCosmWasmClient
    window.dispatchEvent(new Event("cosmjs-ready"));
<\/script>`;

const configCode = `<script>
// ============================================================
//  BLUECHIP CONFIGURATION — Osmosis testnet (osmo-test-5)
//  The only value you must edit is poolAddress.
// ============================================================
const BLUECHIP_CONFIG = {
    // Chain settings — Osmosis testnet
    chainId:        "osmo-test-5",
    chainName:      "Osmosis Testnet",
    rpc:            "https://rpc.osmotest5.osmosis.zone",
    rest:           "https://lcd.osmotest5.osmosis.zone",
    nativeDenom:    "uosmo",              // 1 OSMO = 1,000,000 uosmo
    coinDecimals:   6,
    gasPrice:       0.025,                // uosmo per gas unit

    // BlueChip contracts on osmo-test-5 (mainnet addresses TBD —
    // these WILL change at the osmosis-1 launch)
    factoryAddress: "${TESTNET_FACTORY}",
    routerAddress:  "${TESTNET_ROUTER}",

    // Your creator pool — REPLACE THIS
    poolAddress:    "osmo1YOUR_POOL_ADDRESS",

    // Keplr / Leap chain registration (standard Osmosis parameters)
    bip44:          { coinType: 118 },
    bech32Config: {
        bech32PrefixAccAddr:  "osmo",
        bech32PrefixAccPub:   "osmopub",
        bech32PrefixValAddr:  "osmovaloper",
        bech32PrefixValPub:   "osmovaloperpub",
        bech32PrefixConsAddr: "osmovalcons",
        bech32PrefixConsPub:  "osmovalconspub",
    },
    currencies: [{
        coinDenom:        "OSMO",
        coinMinimalDenom: "uosmo",
        coinDecimals:     6,
        coinGeckoId:      "osmosis",
    }],
    feeCurrencies: [{
        coinDenom:        "OSMO",
        coinMinimalDenom: "uosmo",
        coinDecimals:     6,
        coinGeckoId:      "osmosis",
        gasPriceStep:     { low: 0.0025, average: 0.025, high: 0.04 },
    }],
    stakeCurrency: {
        coinDenom:        "OSMO",
        coinMinimalDenom: "uosmo",
        coinDecimals:     6,
        coinGeckoId:      "osmosis",
    },
};

// Fee helper used by every snippet below. Osmosis nodes reject
// zero-fee transactions, so always pay gas in uosmo.
function stdFee(gasLimit) {
    var feeAmount = Math.ceil(gasLimit * BLUECHIP_CONFIG.gasPrice).toString();
    return {
        amount: [{ denom: BLUECHIP_CONFIG.nativeDenom, amount: feeAmount }],
        gas: gasLimit.toString()
    };
}
</script>`;

const walletConnectionCode = `<script>
// ============================================================
//  WALLET CONNECTION (Keplr or Leap)
//  Stores: window.bluechipClient, window.bluechipAddress
// ============================================================

// Global wallet state
window.bluechipClient  = null;
window.bluechipAddress = "";

async function connectWallet() {
    // ---- Detect an injected wallet (Keplr preferred, Leap works too) ----
    var wallet = window.keplr || window.leap;
    if (!wallet) {
        var msg = document.getElementById("bluechip-wallet-status");
        if (msg) {
            msg.innerHTML =
                '<div style="padding:12px;background:#fff3cd;border:1px solid #ffc107;border-radius:6px;">' +
                '<strong>Keplr or Leap Wallet Required</strong><br>' +
                'Please install the Keplr (or Leap) browser extension to continue.<br><br>' +
                '<a href="https://www.keplr.app/get" target="_blank" ' +
                'style="color:#0d6efd;font-weight:bold;">Click here to install Keplr &rarr;</a>' +
                '</div>';
        }
        alert("No Cosmos wallet detected!\\n\\nInstall Keplr from: https://www.keplr.app/get");
        return false;
    }

    try {
        // Register osmo-test-5 with the wallet. Keplr usually already
        // knows the Osmosis testnet; suggestChain is a harmless no-op
        // in that case and a proper registration otherwise.
        await wallet.experimentalSuggestChain({
            chainId:        BLUECHIP_CONFIG.chainId,
            chainName:      BLUECHIP_CONFIG.chainName,
            rpc:            BLUECHIP_CONFIG.rpc,
            rest:           BLUECHIP_CONFIG.rest,
            bip44:          BLUECHIP_CONFIG.bip44,
            bech32Config:   BLUECHIP_CONFIG.bech32Config,
            currencies:     BLUECHIP_CONFIG.currencies,
            feeCurrencies:  BLUECHIP_CONFIG.feeCurrencies,
            stakeCurrency:  BLUECHIP_CONFIG.stakeCurrency,
        });

        // Enable the chain
        await wallet.enable(BLUECHIP_CONFIG.chainId);

        // Get signer and address
        var offlineSigner = wallet.getOfflineSigner
            ? wallet.getOfflineSigner(BLUECHIP_CONFIG.chainId)
            : window.getOfflineSigner(BLUECHIP_CONFIG.chainId);
        var accounts = await offlineSigner.getAccounts();
        var address  = accounts[0].address;      // osmo1...

        // Connect the signing client to the Osmosis testnet RPC
        var client = await CosmWasmClient.SigningCosmWasmClient.connectWithSigner(
            BLUECHIP_CONFIG.rpc,
            offlineSigner
        );

        // Store globally
        window.bluechipClient  = client;
        window.bluechipAddress = address;

        // Update UI
        var statusEl = document.getElementById("bluechip-wallet-status");
        if (statusEl) {
            statusEl.innerHTML =
                '<div style="padding:8px 12px;background:#d4edda;border:1px solid #28a745;' +
                'border-radius:6px;font-family:monospace;word-break:break-all;">' +
                'Connected: ' + address + '</div>';
        }

        // Fetch OSMO balance
        var balance = await client.getBalance(address, BLUECHIP_CONFIG.nativeDenom);
        var balanceEl = document.getElementById("bluechip-balance");
        if (balanceEl) {
            var human = (parseInt(balance.amount) / Math.pow(10, BLUECHIP_CONFIG.coinDecimals)).toFixed(6);
            balanceEl.textContent = human + " OSMO";
        }

        return true;
    } catch (err) {
        console.error("Wallet connection failed:", err);
        var statusEl = document.getElementById("bluechip-wallet-status");
        if (statusEl) {
            statusEl.innerHTML =
                '<div style="padding:8px 12px;background:#f8d7da;border:1px solid #dc3545;' +
                'border-radius:6px;">Connection failed: ' + err.message + '</div>';
        }
        return false;
    }
}
</script>`;

const connectButtonCode = `<!-- CONNECT WALLET BUTTON — Copy this wherever you want it -->
<div style="margin:16px 0;">
    <button onclick="connectWallet()"
            style="padding:12px 24px;font-size:16px;font-weight:bold;
                   background:#4CAF50;color:white;border:none;border-radius:8px;
                   cursor:pointer;">
        Connect Wallet
    </button>
    <div id="bluechip-wallet-status" style="margin-top:8px;"></div>
    <div id="bluechip-balance" style="margin-top:4px;font-weight:bold;"></div>
</div>`;

const subscribeCode = `<script>
async function handleSubscribe() {
    var statusEl = document.getElementById("subscribe-status");
    var txEl     = document.getElementById("subscribe-tx");
    statusEl.textContent = "";
    txEl.innerHTML       = "";

    // Ensure wallet is connected
    if (!window.bluechipClient || !window.bluechipAddress) {
        var connected = await connectWallet();
        if (!connected) return;
    }

    var amount = parseFloat(document.getElementById("subscribe-amount").value);
    if (isNaN(amount) || amount <= 0) {
        statusEl.innerHTML = '<div style="color:red;">Please enter a valid amount.</div>';
        return;
    }

    var spreadInput = document.getElementById("subscribe-spread").value;
    statusEl.innerHTML = '<div style="color:#1565c0;">Subscribing...</div>';

    try {
        // Convert to micro-units (1 OSMO = 1,000,000 uosmo)
        var microAmount = Math.floor(amount * 1000000).toString();

        // Check pool threshold status — pre-threshold commits go to the
        // ledger; post-threshold commits are swapped through the AMM,
        // where max_spread applies.
        var thresholdStatus = await window.bluechipClient.queryContractSmart(
            BLUECHIP_CONFIG.poolAddress,
            { is_fully_commited: {} }
        );
        var isThresholdCrossed = (thresholdStatus === "fully_committed");

        // Deadline: 20 minutes from now, in nanoseconds
        var deadlineNs = ((Date.now() + 20 * 60 * 1000) * 1000000).toString();

        // Build the commit message. NOTE: the native side is wire-encoded
        // as { bluechip: { denom: "uosmo" } } — legacy key, Osmosis denom.
        var msg = {
            commit: {
                asset: {
                    info:   { bluechip: { denom: BLUECHIP_CONFIG.nativeDenom } },
                    amount: microAmount
                },
                transaction_deadline: deadlineNs,
                belief_price:         null,
                max_spread:           (isThresholdCrossed && spreadInput) ? spreadInput : null
            }
        };

        // Attach the SAME amount of uosmo as funds — and ONLY uosmo.
        // Any extra denom in the funds array makes the commit error out.
        var funds = [{ denom: BLUECHIP_CONFIG.nativeDenom, amount: microAmount }];

        var result = await window.bluechipClient.execute(
            window.bluechipAddress,
            BLUECHIP_CONFIG.poolAddress,
            msg,
            stdFee(600000),
            "Commit",
            funds
        );

        statusEl.innerHTML = '<div style="color:#2e7d32;font-weight:bold;">Success!</div>';
        txEl.innerHTML =
            '<div style="padding:10px;background:#e8f5e9;border:1px solid #4CAF50;' +
            'border-radius:6px;font-family:monospace;word-break:break-all;">' +
            '<strong>Tx Hash:</strong><br>' + result.transactionHash + '</div>';

    } catch (err) {
        console.error("Subscribe error:", err);
        statusEl.innerHTML = '<div style="color:red;">Error: ' + err.message + '</div>';
    }
}
</script>`;

const buyCode = `<script>
async function handleBuy() {
    var statusEl = document.getElementById("buy-status");
    var txEl     = document.getElementById("buy-tx");
    statusEl.textContent = "";
    txEl.innerHTML       = "";

    if (!window.bluechipClient || !window.bluechipAddress) {
        var connected = await connectWallet();
        if (!connected) return;
    }

    var amount = parseFloat(document.getElementById("buy-amount").value);
    if (isNaN(amount) || amount <= 0) {
        statusEl.innerHTML = '<div style="color:red;">Please enter a valid amount.</div>';
        return;
    }

    var spreadInput = document.getElementById("buy-spread").value;
    statusEl.innerHTML = '<div style="color:#1565c0;">Processing swap...</div>';

    try {
        var microAmount = Math.floor(amount * 1000000).toString();
        var deadlineNs  = ((Date.now() + 20 * 60 * 1000) * 1000000).toString();

        // SimpleSwap: offer native OSMO, receive CW20 creator tokens
        var msg = {
            simple_swap: {
                offer_asset: {
                    info:   { bluechip: { denom: BLUECHIP_CONFIG.nativeDenom } },
                    amount: microAmount
                },
                belief_price:          null,
                max_spread:            spreadInput || null,
                // Set to true to bypass the pool's spread safety cap. Leave
                // null in the standard buy flow; only flip on if the user
                // has explicitly opted into a higher max_spread than the cap.
                allow_high_max_spread: null,
                to:                    null,
                transaction_deadline:  deadlineNs
            }
        };

        var funds = [{ denom: BLUECHIP_CONFIG.nativeDenom, amount: microAmount }];

        var result = await window.bluechipClient.execute(
            window.bluechipAddress,
            BLUECHIP_CONFIG.poolAddress,
            msg,
            stdFee(500000),
            "Buy Token",
            funds
        );

        statusEl.innerHTML = '<div style="color:#2e7d32;font-weight:bold;">Success! Tokens purchased.</div>';
        txEl.innerHTML =
            '<div style="padding:10px;background:#e3f2fd;border:1px solid #1976d2;' +
            'border-radius:6px;font-family:monospace;word-break:break-all;">' +
            '<strong>Tx Hash:</strong><br>' + result.transactionHash + '</div>';

    } catch (err) {
        console.error("Buy error:", err);
        statusEl.innerHTML = '<div style="color:red;">Error: ' + err.message + '</div>';
    }
}
</script>`;

const sellCode = `<script>
async function handleSell() {
    var statusEl = document.getElementById("sell-status");
    var txEl     = document.getElementById("sell-tx");
    statusEl.textContent = "";
    txEl.innerHTML       = "";

    if (!window.bluechipClient || !window.bluechipAddress) {
        var connected = await connectWallet();
        if (!connected) return;
    }

    var tokenAddress = document.getElementById("sell-token-address").value.trim();
    var amount       = parseFloat(document.getElementById("sell-amount").value);
    var spreadInput  = document.getElementById("sell-spread").value;

    if (!tokenAddress) {
        statusEl.innerHTML = '<div style="color:red;">Please enter the creator token address.</div>';
        return;
    }
    if (isNaN(amount) || amount <= 0) {
        statusEl.innerHTML = '<div style="color:red;">Please enter a valid amount.</div>';
        return;
    }

    statusEl.innerHTML = '<div style="color:#1565c0;">Processing swap...</div>';

    try {
        var microAmount = Math.floor(amount * 1000000).toString();
        var deadlineNs  = ((Date.now() + 20 * 60 * 1000) * 1000000).toString();

        // Build the inner swap hook message
        var hookMsg = {
            swap: {
                belief_price:          null,
                max_spread:            spreadInput || null,
                // Same semantics as simple_swap.allow_high_max_spread; leave
                // null unless you've surfaced an explicit override to the user.
                allow_high_max_spread: null,
                to:                    null,
                transaction_deadline:  deadlineNs
            }
        };

        // Base64-encode the hook message
        var encodedMsg = btoa(JSON.stringify(hookMsg));

        // CW20 Send: send creator tokens to the pool with the swap instruction
        var msg = {
            send: {
                contract: BLUECHIP_CONFIG.poolAddress,   // Pool receives the tokens
                amount:   microAmount,
                msg:      encodedMsg                     // Embedded swap instruction
            }
        };

        // Execute on the CW20 token contract (NOT the pool contract)
        var result = await window.bluechipClient.execute(
            window.bluechipAddress,
            tokenAddress,           // The creator token contract address
            msg,
            stdFee(500000),
            "Sell Token",
            []                      // No native funds sent
        );

        statusEl.innerHTML = '<div style="color:#2e7d32;font-weight:bold;">Success! Tokens sold.</div>';
        txEl.innerHTML =
            '<div style="padding:10px;background:#ffebee;border:1px solid #d32f2f;' +
            'border-radius:6px;font-family:monospace;word-break:break-all;">' +
            '<strong>Tx Hash:</strong><br>' + result.transactionHash + '</div>';

    } catch (err) {
        console.error("Sell error:", err);
        statusEl.innerHTML = '<div style="color:red;">Error: ' + err.message + '</div>';
    }
}
</script>`;

const crossTokenSwapCode = `<script>
// ============================================================
//  CROSS-TOKEN SWAP via the router contract.
//  Creator tokens never share a pool with each other — every
//  cross-token pair routes through OSMO. The router runs the
//  whole route atomically (max 3 hops) and enforces slippage on
//  the FINAL amount received via minimum_receive. It takes no
//  per-hop spread parameters; size minimum_receive from the
//  simulation below. Every hop's pool is validated against the
//  factory registry on-chain.
// ============================================================

async function crossTokenSwap(fromToken, fromPool, toToken, toPool, amountMicro, slippagePct) {
    // 1. Build the route: TOKEN_A -> OSMO -> TOKEN_B.
    //    (For OSMO -> TOKEN_B, keep only the second hop;
    //     for TOKEN_A -> OSMO, keep only the first.)
    var route = [
        {
            pool_addr:        fromPool,
            offer_asset_info: { creator_token: { contract_addr: fromToken } },
            ask_asset_info:   { bluechip: { denom: BLUECHIP_CONFIG.nativeDenom } }
        },
        {
            pool_addr:        toPool,
            offer_asset_info: { bluechip: { denom: BLUECHIP_CONFIG.nativeDenom } },
            ask_asset_info:   { creator_token: { contract_addr: toToken } }
        }
    ];

    // 2. Simulate to learn the expected output and size minimum_receive.
    var sim = await window.bluechipClient.queryContractSmart(
        BLUECHIP_CONFIG.routerAddress,
        { simulate_multi_hop: { operations: route, offer_amount: amountMicro } }
    );
    console.log("Expected out:", sim.final_amount,
                "per-hop:", sim.intermediate_amounts,
                "impact:", sim.price_impact);

    var slipBps     = Math.round(slippagePct * 100);
    var minReceive  = (BigInt(sim.final_amount) * BigInt(10000 - slipBps) / BigInt(10000)).toString();
    var deadlineNs  = ((Date.now() + 20 * 60 * 1000) * 1000000).toString();

    var hopArgs = {
        operations:      route,
        minimum_receive: minReceive,
        deadline:        deadlineNs,
        recipient:       null
    };

    // 3a. First hop offers a CW20: send the tokens to the router with
    //     the hook embedded (the router takes custody per hop).
    var result = await window.bluechipClient.execute(
        window.bluechipAddress,
        fromToken,                              // execute on the CW20
        {
            send: {
                contract: BLUECHIP_CONFIG.routerAddress,
                amount:   amountMicro,
                msg:      btoa(JSON.stringify({ execute_multi_hop: hopArgs }))
            }
        },
        stdFee(900000),
        "Cross-Token Swap",
        []
    );

    // 3b. If the first hop offers native OSMO instead, call the
    //     router directly and attach the funds:
    //
    //   await window.bluechipClient.execute(
    //       window.bluechipAddress,
    //       BLUECHIP_CONFIG.routerAddress,
    //       { execute_multi_hop: hopArgs },
    //       stdFee(900000),
    //       "Cross-Token Swap",
    //       [{ denom: BLUECHIP_CONFIG.nativeDenom, amount: amountMicro }]
    //   );

    return result.transactionHash;
}
</script>`;

const addLiquidityCode = `<script>
async function handleAddLiquidity() {
    var statusEl = document.getElementById("liq-add-status");
    var txEl     = document.getElementById("liq-add-tx");
    statusEl.textContent = "";
    txEl.innerHTML       = "";

    if (!window.bluechipClient || !window.bluechipAddress) {
        var connected = await connectWallet();
        if (!connected) return;
    }

    var amount0 = parseFloat(document.getElementById("liq-amount0").value);   // OSMO
    var amount1 = parseFloat(document.getElementById("liq-amount1").value);   // creator tokens
    var slip    = parseFloat(document.getElementById("liq-slippage").value) || 1;

    if (isNaN(amount0) || amount0 <= 0 || isNaN(amount1) || amount1 <= 0) {
        statusEl.innerHTML = '<div style="color:red;">Please enter valid amounts for both tokens.</div>';
        return;
    }

    statusEl.innerHTML = '<div style="color:#1565c0;">Step 1: Fetching pool info...</div>';

    try {
        var amount0Micro = Math.ceil(amount0 * 1000000).toString();
        var amount1Micro = Math.ceil(amount1 * 1000000).toString();

        // Step 1: Get the creator token address from the pool
        var pairInfo = await window.bluechipClient.queryContractSmart(
            BLUECHIP_CONFIG.poolAddress, { pair: {} }
        );

        var tokenAddress = null;
        var nativeDenom  = BLUECHIP_CONFIG.nativeDenom;
        // The pair query returns PoolDetails — its asset list field is
        // "asset_infos". ("pool_token_info" is the *input* field on the
        // factory's create message, not this response; it is read second
        // purely as a defensive fallback.)
        var assets = pairInfo.asset_infos || pairInfo.pool_token_info || [];
        for (var i = 0; i < assets.length; i++) {
            if (assets[i].creator_token) {
                tokenAddress = assets[i].creator_token.contract_addr;
            }
            if (assets[i].bluechip) {
                nativeDenom = assets[i].bluechip.denom;   // "uosmo"
            }
        }

        if (!tokenAddress) {
            statusEl.innerHTML = '<div style="color:red;">Error: Could not find creator token.</div>';
            return;
        }

        // Step 2: Check & set CW20 allowance
        statusEl.innerHTML = '<div style="color:#1565c0;">Step 2: Checking token allowance...</div>';

        var allowanceInfo = await window.bluechipClient.queryContractSmart(tokenAddress, {
            allowance: { owner: window.bluechipAddress, spender: BLUECHIP_CONFIG.poolAddress }
        });

        if (parseInt(allowanceInfo.allowance) < parseInt(amount1Micro)) {
            statusEl.innerHTML = '<div style="color:#1565c0;">Step 2: Approving tokens...</div>';
            await window.bluechipClient.execute(
                window.bluechipAddress,
                tokenAddress,
                { increase_allowance: { spender: BLUECHIP_CONFIG.poolAddress, amount: amount1Micro } },
                stdFee(200000),
                "Approve Pool",
                []
            );
        }

        // Step 3: Deposit liquidity
        statusEl.innerHTML = '<div style="color:#1565c0;">Step 3: Depositing liquidity...</div>';

        var slipFactor = 1 - (slip / 100);
        var minAmount0 = Math.floor(parseFloat(amount0Micro) * slipFactor).toString();
        var minAmount1 = Math.floor(parseFloat(amount1Micro) * slipFactor).toString();
        var deadlineNs = ((Date.now() + 20 * 60 * 1000) * 1000000).toString();

        var msg = {
            deposit_liquidity: {
                amount0:              amount0Micro,
                amount1:              amount1Micro,
                min_amount0:          minAmount0,
                min_amount1:          minAmount1,
                transaction_deadline: deadlineNs
            }
        };

        var result = await window.bluechipClient.execute(
            window.bluechipAddress,
            BLUECHIP_CONFIG.poolAddress,
            msg,
            stdFee(500000),
            "Deposit Liquidity",
            [{ denom: nativeDenom, amount: amount0Micro }]   // OSMO leg travels as funds
        );

        statusEl.innerHTML = '<div style="color:#2e7d32;font-weight:bold;">Liquidity added! You received an NFT position.</div>';
        txEl.innerHTML =
            '<div style="padding:10px;background:#f3e5f5;border:1px solid #7b1fa2;' +
            'border-radius:6px;font-family:monospace;word-break:break-all;">' +
            '<strong>Tx Hash:</strong><br>' + result.transactionHash + '</div>';

    } catch (err) {
        console.error("Add liquidity error:", err);
        statusEl.innerHTML = '<div style="color:red;">Error: ' + err.message + '</div>';
    }
}
</script>`;

const addToPositionCode = `<script>
// Already have a position NFT? Grow it in place with add_to_position
// instead of minting a second NFT. Same allowance + funds mechanics
// as deposit_liquidity, plus your existing position_id.
async function addToPosition(positionId, amount0Micro, amount1Micro, slippagePct) {
    var slipFactor = 1 - (slippagePct / 100);
    var deadlineNs = ((Date.now() + 20 * 60 * 1000) * 1000000).toString();

    var msg = {
        add_to_position: {
            position_id:          positionId,
            amount0:              amount0Micro,
            amount1:              amount1Micro,
            min_amount0:          Math.floor(parseFloat(amount0Micro) * slipFactor).toString(),
            min_amount1:          Math.floor(parseFloat(amount1Micro) * slipFactor).toString(),
            transaction_deadline: deadlineNs
        }
    };

    return window.bluechipClient.execute(
        window.bluechipAddress,
        BLUECHIP_CONFIG.poolAddress,
        msg,
        stdFee(500000),
        "Add To Position",
        [{ denom: BLUECHIP_CONFIG.nativeDenom, amount: amount0Micro }]
    );
}
</script>`;

const removeLiquidityCode = `<script>
var currentRemoveMode = "amount";

function setRemoveMode(mode) {
    currentRemoveMode = mode;
    document.getElementById("remove-amount-section").style.display  = (mode === "amount")  ? "block" : "none";
    document.getElementById("remove-percent-section").style.display = (mode === "percent") ? "block" : "none";
}

async function handleRemoveLiquidity() {
    var statusEl = document.getElementById("remove-status");
    var txEl     = document.getElementById("remove-tx");
    statusEl.textContent = "";
    txEl.innerHTML       = "";

    if (!window.bluechipClient || !window.bluechipAddress) {
        var connected = await connectWallet();
        if (!connected) return;
    }

    var positionId = document.getElementById("remove-position-id").value.trim();
    if (!positionId) {
        statusEl.innerHTML = '<div style="color:red;">Please enter your position ID.</div>';
        return;
    }

    try {
        // Verify ownership
        var positionInfo = await window.bluechipClient.queryContractSmart(
            BLUECHIP_CONFIG.poolAddress,
            { position: { position_id: positionId } }
        );
        if (positionInfo.owner !== window.bluechipAddress) {
            statusEl.innerHTML = '<div style="color:red;">You do not own this position.</div>';
            return;
        }

        var deviation = parseFloat(document.getElementById("remove-deviation").value) || 1;
        var deviationBps = Math.floor(deviation * 100);
        var deadlineNs   = ((Date.now() + 20 * 60 * 1000) * 1000000).toString();

        var msg;
        if (currentRemoveMode === "all") {
            msg = { remove_all_liquidity: {
                position_id: positionId, min_amount0: null, min_amount1: null,
                max_ratio_deviation_bps: deviationBps, transaction_deadline: deadlineNs
            }};
        } else if (currentRemoveMode === "percent") {
            var pct = parseInt(document.getElementById("remove-percent").value);
            msg = { remove_partial_liquidity_by_percent: {
                position_id: positionId, percentage: pct, min_amount0: null, min_amount1: null,
                max_ratio_deviation_bps: deviationBps, transaction_deadline: deadlineNs
            }};
        } else {
            var removeAmt = parseFloat(document.getElementById("remove-amount").value);
            msg = { remove_partial_liquidity: {
                position_id: positionId, liquidity_to_remove: Math.floor(removeAmt).toString(),
                min_amount0: null, min_amount1: null,
                max_ratio_deviation_bps: deviationBps, transaction_deadline: deadlineNs
            }};
        }

        var result = await window.bluechipClient.execute(
            window.bluechipAddress, BLUECHIP_CONFIG.poolAddress, msg,
            stdFee(500000), "Remove Liquidity"
        );

        statusEl.innerHTML = '<div style="color:#2e7d32;font-weight:bold;">Liquidity removed!</div>';
        txEl.innerHTML =
            '<div style="padding:10px;background:#fff3e0;border:1px solid #e65100;' +
            'border-radius:6px;font-family:monospace;word-break:break-all;">' +
            '<strong>Tx Hash:</strong><br>' + result.transactionHash + '</div>';

    } catch (err) {
        console.error("Remove liquidity error:", err);
        statusEl.innerHTML = '<div style="color:red;">Error: ' + err.message + '</div>';
    }
}
</script>`;

const collectFeesCode = `<script>
async function handleCollectFees() {
    var statusEl = document.getElementById("fees-status");
    var txEl     = document.getElementById("fees-tx");
    statusEl.textContent = "";
    txEl.innerHTML       = "";

    if (!window.bluechipClient || !window.bluechipAddress) {
        var connected = await connectWallet();
        if (!connected) return;
    }

    var positionId = document.getElementById("fees-position-id").value.trim();
    if (!positionId) {
        statusEl.innerHTML = '<div style="color:red;">Please enter your position ID.</div>';
        return;
    }

    try {
        var positionInfo = await window.bluechipClient.queryContractSmart(
            BLUECHIP_CONFIG.poolAddress,
            { position: { position_id: positionId } }
        );
        if (positionInfo.owner !== window.bluechipAddress) {
            statusEl.innerHTML = '<div style="color:red;">You do not own this position.</div>';
            return;
        }

        var unclaimed0 = (parseInt(positionInfo.unclaimed_fees_0) / 1000000).toFixed(6);
        var unclaimed1 = (parseInt(positionInfo.unclaimed_fees_1) / 1000000).toFixed(6);
        statusEl.innerHTML =
            '<div style="color:#1565c0;">Collecting fees...<br>' +
            'Unclaimed: ' + unclaimed0 + ' OSMO + ' + unclaimed1 + ' Creator Tokens</div>';

        var msg = { collect_fees: { position_id: positionId } };

        var result = await window.bluechipClient.execute(
            window.bluechipAddress, BLUECHIP_CONFIG.poolAddress, msg,
            stdFee(400000), "Collect Fees"
        );

        statusEl.innerHTML = '<div style="color:#2e7d32;font-weight:bold;">Fees collected!</div>';
        txEl.innerHTML =
            '<div style="padding:10px;background:#e0f2f1;border:1px solid #00897b;' +
            'border-radius:6px;font-family:monospace;word-break:break-all;">' +
            '<strong>Tx Hash:</strong><br>' + result.transactionHash + '</div>';

    } catch (err) {
        console.error("Collect fees error:", err);
        statusEl.innerHTML = '<div style="color:red;">Error: ' + err.message + '</div>';
    }
}
</script>`;

const creatorClaimsCode = `<script>
// ============================================================
//  CREATOR-ONLY CLAIMS — these must be sent from the creator
//  wallet (the wallet that created the pool). Anyone else gets
//  "Unauthorized".
// ============================================================

// One read for the whole earnings panel: the claimable fee pot,
// any locked excess-liquidity claim (with a claimable_now flag),
// and threshold-crossing context.
async function getCreatorEarnings() {
    var client = await CosmWasmClient.CosmWasmClient.connect(BLUECHIP_CONFIG.rpc);
    return client.queryContractSmart(BLUECHIP_CONFIG.poolAddress, { creator_earnings: {} });
}

// Empty the creator fee pot (the LP-fee slice clipped off small
// positions accrues here) into the creator wallet.
async function claimCreatorFees() {
    var deadlineNs = ((Date.now() + 20 * 60 * 1000) * 1000000).toString();
    return window.bluechipClient.execute(
        window.bluechipAddress,
        BLUECHIP_CONFIG.poolAddress,
        { claim_creator_fees: { transaction_deadline: deadlineNs } },
        stdFee(400000),
        "Claim Creator Fees"
    );
}

// Claim the excess liquidity locked at threshold crossing (exists only
// when the seeded OSMO exceeded the per-pool lock cap). Rejects with
// PositionLocked until the configured lock period has elapsed — check
// creator_earnings.excess.claimable_now first.
async function claimCreatorExcessLiquidity() {
    var deadlineNs = ((Date.now() + 20 * 60 * 1000) * 1000000).toString();
    return window.bluechipClient.execute(
        window.bluechipAddress,
        BLUECHIP_CONFIG.poolAddress,
        { claim_creator_excess_liquidity: { transaction_deadline: deadlineNs } },
        stdFee(400000),
        "Claim Creator Excess Liquidity"
    );
}
</script>`;

const createPoolCode = `<script>
// =====================================================================
// Create a creator (commit) pool via the factory. This is the ONLY
// pool type — there are no standard/xyk pools in this deployment.
//
// The factory mints a fresh CW20 creator token; the pool starts in a
// funding (commit) phase and flips to active AMM trading once the USD
// threshold is crossed ($20 on testnet, $25,000 on mainnet). The
// factory's own stored config is the source of truth for the commit
// threshold, fee splits, threshold-payout amounts, and lock caps —
// pool_msg only carries the token pair.
//
// Creation charges a FLAT fee in uosmo (pool_creation_fee in the
// factory config — 1 OSMO on testnet). Read it from the factory at
// call time and attach exactly that; surplus is refunded on-chain but
// any non-uosmo denom in the funds array errors the tx.
// =====================================================================

async function handleCreatePool() {
    var statusEl = document.getElementById("create-pool-status");
    var txEl     = document.getElementById("create-pool-tx");
    statusEl.textContent = "";
    txEl.innerHTML       = "";

    if (!window.bluechipClient || !window.bluechipAddress) {
        var connected = await connectWallet();
        if (!connected) return;
    }

    statusEl.innerHTML = '<div style="color:#1565c0;">Creating your pool...</div>';

    try {
        var tokenName   = document.getElementById("pool-token-name").value.trim();
        var tokenSymbol = document.getElementById("pool-token-symbol").value.trim().toUpperCase();
        if (!tokenName || !tokenSymbol) {
            statusEl.innerHTML = '<div style="color:red;">Enter token name and symbol.</div>';
            return;
        }
        // Mirror the factory's validate_creator_token_info bounds.
        if (tokenName.length < 3 || tokenName.length > 50) {
            statusEl.innerHTML = '<div style="color:red;">Token name must be 3-50 printable ASCII characters.</div>';
            return;
        }
        if (!/^[A-Z0-9]{3,12}$/.test(tokenSymbol) || !/[A-Z]/.test(tokenSymbol)) {
            statusEl.innerHTML = '<div style="color:red;">Token symbol must be 3-12 chars (A-Z, 0-9) with at least one letter.</div>';
            return;
        }

        // Read the flat creation fee from the factory config so the
        // attached funds always match the live value (1 OSMO = "1000000"
        // on testnet today; admin-tunable via a 48h timelock).
        var factoryCfg = await window.bluechipClient.queryContractSmart(
            BLUECHIP_CONFIG.factoryAddress, { factory: {} }
        );
        var creationFee = factoryCfg.factory.pool_creation_fee;   // uosmo, as a string
        var funds = (creationFee && creationFee !== "0")
            ? [{ denom: BLUECHIP_CONFIG.nativeDenom, amount: creationFee }]
            : [];   // fee disabled -> attach nothing (attaching funds then errors)

        var msg = {
            create: {
                pool_msg: {
                    // pool_token_info is the only field the factory
                    // consumes here — the native OSMO leg at index 0
                    // (wire key "bluechip", see the note at the top of
                    // this guide), the creator-token sentinel at index 1.
                    // Order matters.
                    pool_token_info: [
                        { bluechip: { denom: BLUECHIP_CONFIG.nativeDenom } },
                        { creator_token: { contract_addr: "WILL_BE_CREATED_BY_FACTORY" } }
                    ]
                },
                token_info: {
                    name:    tokenName,
                    symbol:  tokenSymbol,
                    // Decimals are pinned to 6 by validate_creator_token_info;
                    // threshold-payout amounts and the mint cap are
                    // calibrated for this exact value.
                    decimal: 6
                }
            }
        };

        var result = await window.bluechipClient.execute(
            window.bluechipAddress,
            BLUECHIP_CONFIG.factoryAddress,
            msg,
            stdFee(2000000),
            "Create Commit Pool",
            funds
        );

        statusEl.innerHTML =
            '<div style="color:#2e7d32;font-weight:bold;">Pool created! ' +
            'Share the pool address so people can interact with it.</div>';
        txEl.innerHTML =
            '<div style="padding:10px;background:#fff3e0;border:1px solid #ff6f00;' +
            'border-radius:6px;font-family:monospace;word-break:break-all;">' +
            '<strong>Tx Hash:</strong><br>' + result.transactionHash + '</div>';

    } catch (err) {
        console.error("Create pool error:", err);
        statusEl.innerHTML = '<div style="color:red;">Error: ' + err.message + '</div>';
    }
}
</script>`;

const queryPoolStatusCode = `async function checkPoolStatus(poolAddress) {
    // Read-only client — no wallet needed for queries
    var client = await CosmWasmClient.CosmWasmClient.connect(BLUECHIP_CONFIG.rpc);

    var status = await client.queryContractSmart(poolAddress, {
        is_fully_commited: {}
    });

    // status is either "fully_committed" or
    // { in_progress: { raised: "...", target: "..." } } (micro-USD)
    if (status === "fully_committed") {
        console.log("Pool is active! Trading is enabled.");
        return true;
    } else {
        var raised = parseInt(status.in_progress.raised) / 1000000;
        var target = parseInt(status.in_progress.target) / 1000000;   // $20 on testnet
        console.log("Pool funding: $" + raised.toFixed(2) + " / $" + target.toFixed(2));
        return false;
    }
}`;

const queryFactoryPoolsCode = `async function listAllPools() {
    var client = await CosmWasmClient.CosmWasmClient.connect(BLUECHIP_CONFIG.rpc);

    // Paginated registry enumeration, ordered by pool_id ascending.
    // Default page 30, max 100; a short page signals end-of-data.
    var all = [];
    var startAfter = null;
    for (;;) {
        var page = await client.queryContractSmart(BLUECHIP_CONFIG.factoryAddress, {
            pools: { start_after: startAfter, limit: 100 }
        });
        all = all.concat(page.pools);
        if (page.pools.length < 100) break;
        startAfter = page.pools[page.pools.length - 1].pool_id;
    }

    // Each entry: { pool_id, pool_addr, pool_token_info: [
    //   { bluechip: { denom: "uosmo" } },
    //   { creator_token: { contract_addr: "osmo1..." } } ] }
    return all;
}`;

const queryAnalyticsCode = `async function getPoolAnalytics(poolAddress) {
    var client = await CosmWasmClient.CosmWasmClient.connect(BLUECHIP_CONFIG.rpc);

    var res = await client.queryContractSmart(poolAddress, { analytics: {} });

    console.log("Price (OSMO -> token):",  res.current_price_0_to_1);
    console.log("Price (token -> OSMO):",  res.current_price_1_to_0);
    console.log("TVL OSMO:",   parseInt(res.total_value_locked_0) / 1000000);
    console.log("TVL token:",  parseInt(res.total_value_locked_1) / 1000000);
    console.log("USD raised:", parseInt(res.total_usd_raised) / 1000000);
    console.log("Positions:",  res.total_positions);
    console.log("Threshold:",  res.threshold_status);   // same shape as is_fully_commited

    // Basic reserves/liquidity are also available separately:
    //   { pool_state: {} } -> { reserve0, reserve1, total_liquidity, ... }
    return res;
}`;

const querySimulationCode = `async function quoteSwap(poolAddress, creatorTokenAddress) {
    var client = await CosmWasmClient.CosmWasmClient.connect(BLUECHIP_CONFIG.rpc);

    // "If I offer 1 OSMO, how many creator tokens come back?"
    var sim = await client.queryContractSmart(poolAddress, {
        simulation: {
            offer_asset: {
                info:   { bluechip: { denom: BLUECHIP_CONFIG.nativeDenom } },
                amount: "1000000"   // 1 OSMO
            }
        }
    });
    // -> { return_amount, spread_amount, commission_amount }
    console.log("1 OSMO buys:", parseInt(sim.return_amount) / 1000000, "tokens");

    // "How much OSMO must I offer to receive exactly 1 creator token?"
    var rev = await client.queryContractSmart(poolAddress, {
        reverse_simulation: {
            ask_asset: {
                info:   { creator_token: { contract_addr: creatorTokenAddress } },
                amount: "1000000"   // 1 creator token
            }
        }
    });
    // -> { offer_amount, spread_amount, commission_amount }
    console.log("1 token costs:", parseInt(rev.offer_amount) / 1000000, "OSMO");
}`;

const queryUsdPriceCode = `async function osmoToUsd(microOsmo) {
    var client = await CosmWasmClient.CosmWasmClient.connect(BLUECHIP_CONFIG.rpc);

    // The factory values OSMO in USD via Osmosis x/twap (the on-chain
    // time-weighted price of its configured OSMO/USDC pricing pool) —
    // there is no external oracle. This is the same conversion every
    // commit uses to check thresholds and minimums.
    var res = await client.queryContractSmart(BLUECHIP_CONFIG.factoryAddress, {
        pool_factory_query: {
            convert_native_to_usd: { amount: microOsmo }   // e.g. "1000000"
        }
    });

    // -> { amount: micro-USD, rate_used: micro-USD per OSMO, timestamp }
    console.log("USD value: $" + (parseInt(res.amount) / 1000000).toFixed(4));
    return res;
}`;

const querySubscriptionCode = `async function getSubscriptionInfo(poolAddress, walletAddress) {
    var client = await CosmWasmClient.CosmWasmClient.connect(BLUECHIP_CONFIG.rpc);

    // NOTE: the query key is committing_info (double "t", double "m") —
    // it mirrors the contract's CommittingInfo variant exactly.
    var info = await client.queryContractSmart(poolAddress, {
        committing_info: { wallet: walletAddress }
    });

    // Returns null if the wallet never committed, otherwise the wallet's
    // cumulative commit record for this pool.
    if (info) {
        console.log("Total paid (USD):",  parseInt(info.total_paid_usd) / 1000000);
        console.log("Total paid (OSMO):", parseInt(info.total_paid_bluechip) / 1000000);
    } else {
        console.log("User has not subscribed yet.");
    }

    return info;
}`;

const queryPositionsCode = `async function getMyPositions(poolAddress, walletAddress) {
    var client = await CosmWasmClient.CosmWasmClient.connect(BLUECHIP_CONFIG.rpc);

    var result = await client.queryContractSmart(poolAddress, {
        positions_by_owner: { owner: walletAddress }
    });

    result.positions.forEach(function(pos) {
        console.log("Position ID:", pos.position_id);
        console.log("  Liquidity:", parseInt(pos.liquidity) / 1000000);
        console.log("  Unclaimed Fees 0 (OSMO):",  parseInt(pos.unclaimed_fees_0) / 1000000);
        console.log("  Unclaimed Fees 1 (token):", parseInt(pos.unclaimed_fees_1) / 1000000);
    });

    return result.positions;
}`;

const queryTokenAddressCode = `async function getCreatorTokenAddress(poolAddress) {
    var client = await CosmWasmClient.CosmWasmClient.connect(BLUECHIP_CONFIG.rpc);

    var pairInfo = await client.queryContractSmart(poolAddress, { pair: {} });

    // "asset_infos" is the field on the PoolDetails response;
    // "pool_token_info" (the factory-side input field) is read second
    // purely as a defensive fallback.
    var assets = pairInfo.asset_infos || pairInfo.pool_token_info || [];
    for (var i = 0; i < assets.length; i++) {
        if (assets[i].creator_token) {
            return assets[i].creator_token.contract_addr;
        }
    }
    return null;
}`;

const privClientGateCode = `<script>
// ============================================================
//  CLIENT-SIDE GATING (UX layer only — see the warning above)
//  Reads the wallet's on-chain commit record and unlocks parts
//  of the page based on how much they have committed.
// ============================================================

// Tier thresholds in micro-USD (6 decimals). These are YOUR site's
// policy, not the chain's — pick numbers that fit your community.
// ($50 / $10 shown; testnet pools only need $20 total to activate.)
var TIER_GOLD_MICRO_USD   = 50000000;   // $50 lifetime
var TIER_SILVER_MICRO_USD = 10000000;   // $10 lifetime

// How recent the last commit must be to count as an "active"
// subscriber. The chain never expires commit records — recency
// is purely your site's policy.
var ACTIVE_WINDOW_DAYS = 30;

async function getSupporterStatus(walletAddress) {
    var client = await CosmWasmClient.CosmWasmClient.connect(BLUECHIP_CONFIG.rpc);

    // committing_info returns null if this wallet has never committed,
    // otherwise the wallet's cumulative commit record for this pool.
    var info = await client.queryContractSmart(BLUECHIP_CONFIG.poolAddress, {
        committing_info: { wallet: walletAddress }
    });

    if (!info) {
        return { isSupporter: false, tier: "none", isActive: false };
    }

    // total_paid_usd is micro-USD (1000000 = $1.00), as a string.
    var totalUsd = parseInt(info.total_paid_usd);
    var tier = "bronze";
    if (totalUsd >= TIER_GOLD_MICRO_USD)        tier = "gold";
    else if (totalUsd >= TIER_SILVER_MICRO_USD) tier = "silver";

    // last_committed is a timestamp in NANOSECONDS (as a string).
    var lastCommitMs = parseInt(info.last_committed) / 1000000;
    var ageDays      = (Date.now() - lastCommitMs) / 86400000;
    var isActive     = ageDays <= ACTIVE_WINDOW_DAYS;

    return {
        isSupporter: true,
        tier: tier,
        isActive: isActive,
        totalPaidUsd: totalUsd / 1000000,
        lastCommitted: new Date(lastCommitMs)
    };
}

// Example: unlock page sections after the wallet connects.
async function unlockSupporterContent() {
    if (!window.bluechipAddress) {
        var ok = await connectWallet();
        if (!ok) return;
    }

    var status = await getSupporterStatus(window.bluechipAddress);

    // Reveal/hide blocks by tier. Give gated blocks these IDs in
    // your HTML: supporter-content, gold-content, etc.
    var supporterEl = document.getElementById("supporter-content");
    if (supporterEl) {
        supporterEl.style.display =
            (status.isSupporter && status.isActive) ? "block" : "none";
    }
    var goldEl = document.getElementById("gold-content");
    if (goldEl) {
        goldEl.style.display = (status.tier === "gold") ? "block" : "none";
    }

    var label = document.getElementById("supporter-status");
    if (label) {
        label.textContent = status.isSupporter
            ? ("Supporter tier: " + status.tier +
               (status.isActive ? " (active)" : " (lapsed)"))
            : "Not a supporter yet — hit Subscribe above!";
    }
}
</script>

<!-- Example gated markup -->
<div id="supporter-status"></div>
<div id="supporter-content" style="display:none;">
    Subscriber-only content here (early videos, downloads, chat invite...)
</div>
<div id="gold-content" style="display:none;">
    Gold-tier extras here.
</div>`;

const privServerVerifyCode = `// ============================================================
//  STEP 1 (browser): prove wallet ownership with an ADR-36
//  signature. Anyone can READ the commit ledger, so for real
//  privileges (downloads, Discord roles, accounts) your server
//  must check the user actually controls the wallet.
// ============================================================
async function loginWithWallet() {
    await window.keplr.enable(BLUECHIP_CONFIG.chainId);   // "osmo-test-5"

    // 1. Ask your server for a one-time nonce (prevents replay).
    var nonceRes = await fetch("/api/auth/nonce", { method: "POST" });
    var nonce    = (await nonceRes.json()).nonce;

    var signer   = window.getOfflineSigner(BLUECHIP_CONFIG.chainId);
    var accounts = await signer.getAccounts();
    var address  = accounts[0].address;

    // 2. Sign the nonce. signArbitrary = ADR-36: costs no gas and
    //    cannot be replayed as a real transaction.
    var message   = "bluechip-login:" + nonce;
    var signature = await window.keplr.signArbitrary(
        BLUECHIP_CONFIG.chainId, address, message
    );

    // 3. Send to your server for verification.
    var verifyRes = await fetch("/api/auth/verify", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address, message: message, signature: signature })
    });
    var session = await verifyRes.json();
    console.log("Privileges granted:", session);
}

// ============================================================
//  STEP 2 (your server — Node.js example, adapt to your stack):
//  verify the signature, then read the commit ledger over the
//  Osmosis testnet REST (LCD) endpoint and grant privileges.
//
//  npm install @keplr-wallet/cosmos
// ============================================================
const { verifyADR36Amino } = require("@keplr-wallet/cosmos");

const REST_ENDPOINT = "https://lcd.osmotest5.osmosis.zone";
const POOL_ADDRESS  = "osmo1YOUR_POOL_ADDRESS";
const BECH32_PREFIX = "osmo";

// Smart-query a contract over REST: the query JSON is base64-encoded
// into the URL. Works from any backend language — only the base64
// and HTTP parts are Node-specific here.
async function queryCommitRecord(walletAddress) {
    const query   = { committing_info: { wallet: walletAddress } };
    const encoded = Buffer.from(JSON.stringify(query)).toString("base64");
    const url     = REST_ENDPOINT +
        "/cosmwasm/wasm/v1/contract/" + POOL_ADDRESS + "/smart/" + encodeURIComponent(encoded);
    const res     = await fetch(url);
    if (!res.ok) throw new Error("LCD query failed: " + res.status);
    return (await res.json()).data;   // null if the wallet never committed
}

// POST /api/auth/verify
async function handleVerify(req, res) {
    const { address, message, signature } = req.body;

    // 1. Check the nonce inside message is one you issued and unused,
    //    then mark it spent (not shown — use your session/DB layer).

    // 2. Verify the ADR-36 signature actually binds this address.
    const pubKeyBytes = Buffer.from(signature.pub_key.value, "base64");
    const sigBytes    = Buffer.from(signature.signature, "base64");
    const ok = verifyADR36Amino(
        BECH32_PREFIX, address, message, pubKeyBytes, sigBytes
    );
    if (!ok) return res.status(401).json({ error: "Bad signature" });

    // 3. Wallet ownership proven — now read the on-chain commit record.
    const record = await queryCommitRecord(address);
    if (!record) return res.json({ role: "visitor" });

    // 4. Map the record to YOUR privileges. total_paid_usd is micro-USD.
    const totalUsd = Number(record.total_paid_usd) / 1e6;
    const role = totalUsd >= 50 ? "gold"
               : totalUsd >= 10 ? "silver"
               : "bronze";

    // 5. Issue your normal session (cookie / JWT / Discord role grant...).
    res.json({ role: role, totalUsd: totalUsd, lastCommitted: record.last_committed });
}`;

const privEventWatchCode = `// ============================================================
//  REAL-TIME: react the moment a commit lands on-chain.
//  Every commit emits a wasm event with these attributes:
//    action:    "commit"
//    phase:     "funding" (pre-threshold) | "active" (post-threshold) |
//               "threshold_crossing" | "threshold_hit_exact"
//    committer: wallet address that committed
//    commit_amount_bluechip / commit_amount_usd (micro-units)
//    total_commit_count, pool_contract, block_height, block_time
//  Subscribe over the Osmosis RPC websocket and grant perks
//  instantly (unlock a chat, ping Discord, thank the supporter).
// ============================================================
var RPC_WS = BLUECHIP_CONFIG.rpc.replace(/^http/, "ws") + "/websocket";

function watchCommits(onCommit) {
    var ws = new WebSocket(RPC_WS);

    ws.onopen = function () {
        ws.send(JSON.stringify({
            jsonrpc: "2.0",
            method:  "subscribe",
            id:      1,
            params:  {
                query: "tm.event='Tx' AND wasm.action='commit'" +
                       " AND wasm._contract_address='" + BLUECHIP_CONFIG.poolAddress + "'"
            }
        }));
    };

    ws.onmessage = function (msgEvent) {
        var msg = JSON.parse(msgEvent.data);
        // Tendermint flattens attributes into result.events:
        // { "wasm.committer": ["osmo1..."], "wasm.commit_amount_usd": ["1000000"], ... }
        var events = msg.result && msg.result.events;
        if (!events || !events["wasm.committer"]) return;

        onCommit({
            committer: events["wasm.committer"][0],
            phase:     (events["wasm.phase"] || [])[0],
            amountUsd: parseInt((events["wasm.commit_amount_usd"] || ["0"])[0]) / 1000000,
            txHash:    (events["tx.hash"] || [])[0]
        });
    };

    // Reconnect on drop — public RPC nodes recycle websocket connections.
    ws.onclose = function () { setTimeout(function () { watchCommits(onCommit); }, 5000); };
    return ws;
}

// Example: grant a perk the moment someone commits.
watchCommits(function (commit) {
    console.log(commit.committer + " committed $" + commit.amountUsd + " (" + commit.phase + ")");
    // -> POST to your backend, flip a UI flag, fire a Discord webhook, etc.
});

// No websocket? Poll the LCD for recent commit txs instead:
//   GET https://lcd.osmotest5.osmosis.zone/cosmos/tx/v1beta1/txs
//       ?query=wasm.action='commit' AND wasm._contract_address='<POOL>'
//       &order_by=ORDER_BY_DESC&limit=20`;

const fullExampleCode = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Creator Page — BlueChip on Osmosis</title>
    <!-- CosmJS has no prebuilt browser bundle; load it as an ES module
         and expose the global the handlers below use. -->
    <script type="module">
        import * as cosmwasm from "https://esm.sh/@cosmjs/cosmwasm-stargate@0.32.4";
        window.CosmWasmClient = cosmwasm;
        window.dispatchEvent(new Event("cosmjs-ready"));
    <\/script>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
               max-width: 520px; margin: 0 auto; padding: 20px; background: #fafafa; }
        .card { background: white; border-radius: 12px; padding: 20px;
                margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        input { width: 100%; padding: 10px; margin-bottom: 10px; font-size: 14px;
                border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; }
        .btn { width: 100%; padding: 12px; border: none; border-radius: 8px;
               font-size: 16px; font-weight: bold; color: white;
               background: #4CAF50; cursor: pointer; }
        #gated { display: none; padding: 12px; background: #e8f5e9;
                 border: 1px solid #4CAF50; border-radius: 8px; }
    </style>
</head>
<body>
    <h1>My Creator Page</h1>

    <div class="card">
        <h3>Wallet</h3>
        <button class="btn" onclick="connectWallet()">Connect Wallet</button>
        <div id="bluechip-wallet-status" style="margin-top:8px;"></div>
        <div id="bluechip-balance" style="margin-top:4px;font-weight:bold;"></div>
    </div>

    <div class="card">
        <h3>Subscribe</h3>
        <p style="color:#666;font-size:13px;">
            Commit OSMO to support this creator. 6% fee: 1% protocol + 5% creator.
            Minimum $5 pre-threshold ($1 after).
        </p>
        <input id="subscribe-amount" type="number" placeholder="Amount (OSMO), e.g. 10" />
        <input id="subscribe-spread" type="text" value="0.005" placeholder="Max spread" />
        <button class="btn" onclick="handleSubscribe()">Subscribe</button>
        <div id="subscribe-status"></div>
        <div id="subscribe-tx"></div>
    </div>

    <div class="card">
        <h3>Subscribers only</h3>
        <button class="btn" onclick="checkAccess()">Unlock with my wallet</button>
        <div id="gate-status" style="margin-top:8px;"></div>
        <div id="gated">
            Welcome back, subscriber! Secret download link, early video, chat invite...
        </div>
    </div>

    <script>
    // ------------------------------------------------------------
    // Config — the ONLY value you must edit is poolAddress.
    // ------------------------------------------------------------
    const BLUECHIP_CONFIG = {
        chainId:     "osmo-test-5",
        chainName:   "Osmosis Testnet",
        rpc:         "https://rpc.osmotest5.osmosis.zone",
        rest:        "https://lcd.osmotest5.osmosis.zone",
        nativeDenom: "uosmo",
        coinDecimals: 6,
        gasPrice:     0.025,
        poolAddress:  "osmo1YOUR_POOL_ADDRESS",
        bip44:        { coinType: 118 },
        bech32Config: {
            bech32PrefixAccAddr: "osmo",            bech32PrefixAccPub: "osmopub",
            bech32PrefixValAddr: "osmovaloper",     bech32PrefixValPub: "osmovaloperpub",
            bech32PrefixConsAddr: "osmovalcons",    bech32PrefixConsPub: "osmovalconspub",
        },
        currencies: [{ coinDenom: "OSMO", coinMinimalDenom: "uosmo",
                       coinDecimals: 6, coinGeckoId: "osmosis" }],
        feeCurrencies: [{ coinDenom: "OSMO", coinMinimalDenom: "uosmo",
                          coinDecimals: 6, coinGeckoId: "osmosis",
                          gasPriceStep: { low: 0.0025, average: 0.025, high: 0.04 } }],
        stakeCurrency: { coinDenom: "OSMO", coinMinimalDenom: "uosmo",
                         coinDecimals: 6, coinGeckoId: "osmosis" },
    };

    function stdFee(gasLimit) {
        var feeAmount = Math.ceil(gasLimit * BLUECHIP_CONFIG.gasPrice).toString();
        return { amount: [{ denom: BLUECHIP_CONFIG.nativeDenom, amount: feeAmount }],
                 gas: gasLimit.toString() };
    }

    // ------------------------------------------------------------
    // Wallet connection (Keplr or Leap)
    // ------------------------------------------------------------
    window.bluechipClient  = null;
    window.bluechipAddress = "";

    async function connectWallet() {
        var wallet = window.keplr || window.leap;
        var statusEl = document.getElementById("bluechip-wallet-status");
        if (!wallet) {
            statusEl.innerHTML = 'Install <a href="https://www.keplr.app/get" ' +
                'target="_blank">Keplr</a> to continue.';
            return false;
        }
        try {
            await wallet.experimentalSuggestChain(BLUECHIP_CONFIG);
            await wallet.enable(BLUECHIP_CONFIG.chainId);
            var signer = wallet.getOfflineSigner
                ? wallet.getOfflineSigner(BLUECHIP_CONFIG.chainId)
                : window.getOfflineSigner(BLUECHIP_CONFIG.chainId);
            var accounts = await signer.getAccounts();
            var client = await CosmWasmClient.SigningCosmWasmClient.connectWithSigner(
                BLUECHIP_CONFIG.rpc, signer);
            window.bluechipClient  = client;
            window.bluechipAddress = accounts[0].address;
            statusEl.textContent = "Connected: " + window.bluechipAddress;
            var bal = await client.getBalance(window.bluechipAddress, BLUECHIP_CONFIG.nativeDenom);
            document.getElementById("bluechip-balance").textContent =
                (parseInt(bal.amount) / 1000000).toFixed(6) + " OSMO";
            return true;
        } catch (err) {
            statusEl.textContent = "Connection failed: " + err.message;
            return false;
        }
    }

    // ------------------------------------------------------------
    // Subscribe (commit uosmo to the pool)
    // ------------------------------------------------------------
    async function handleSubscribe() {
        var statusEl = document.getElementById("subscribe-status");
        var txEl     = document.getElementById("subscribe-tx");
        statusEl.textContent = ""; txEl.textContent = "";

        if (!window.bluechipClient && !(await connectWallet())) return;

        var amount = parseFloat(document.getElementById("subscribe-amount").value);
        if (isNaN(amount) || amount <= 0) {
            statusEl.textContent = "Please enter a valid amount."; return;
        }
        var spreadInput = document.getElementById("subscribe-spread").value;
        statusEl.textContent = "Subscribing...";

        try {
            var microAmount = Math.floor(amount * 1000000).toString();
            var thresholdStatus = await window.bluechipClient.queryContractSmart(
                BLUECHIP_CONFIG.poolAddress, { is_fully_commited: {} });
            var crossed = (thresholdStatus === "fully_committed");
            var deadlineNs = ((Date.now() + 20 * 60 * 1000) * 1000000).toString();

            var msg = {
                commit: {
                    asset: {
                        info:   { bluechip: { denom: BLUECHIP_CONFIG.nativeDenom } },
                        amount: microAmount
                    },
                    transaction_deadline: deadlineNs,
                    belief_price:         null,
                    max_spread:           (crossed && spreadInput) ? spreadInput : null
                }
            };
            var result = await window.bluechipClient.execute(
                window.bluechipAddress, BLUECHIP_CONFIG.poolAddress, msg,
                stdFee(600000), "Commit",
                [{ denom: BLUECHIP_CONFIG.nativeDenom, amount: microAmount }]);

            statusEl.textContent = "Success!";
            txEl.textContent = "Tx: " + result.transactionHash;
        } catch (err) {
            statusEl.textContent = "Error: " + err.message;
        }
    }

    // ------------------------------------------------------------
    // Gate: unlock the hidden block for wallets that committed >= $5
    // (client-side convenience — see the guide for server-side auth)
    // ------------------------------------------------------------
    async function checkAccess() {
        var gateStatus = document.getElementById("gate-status");
        if (!window.bluechipAddress && !(await connectWallet())) return;

        var client = await CosmWasmClient.CosmWasmClient.connect(BLUECHIP_CONFIG.rpc);
        var info = await client.queryContractSmart(BLUECHIP_CONFIG.poolAddress, {
            committing_info: { wallet: window.bluechipAddress }
        });

        // null = never committed to this pool
        var totalUsd = info ? parseInt(info.total_paid_usd) / 1000000 : 0;
        if (totalUsd >= 5) {
            document.getElementById("gated").style.display = "block";
            gateStatus.textContent = "Unlocked — $" + totalUsd.toFixed(2) + " committed. Thank you!";
        } else {
            gateStatus.textContent = info
                ? "You've committed $" + totalUsd.toFixed(2) + " — $5 unlocks this section."
                : "No subscription found for this wallet. Hit Subscribe above!";
        }
    }
    <\/script>
</body>
</html>`;


const tocItems = [
    { num: '1', title: 'Prerequisites — What You Need First', id: 'prerequisites' },
    { num: '2', title: 'Quick Start — The Embeddable Widget', id: 'quick-start' },
    { num: '3', title: 'Connecting a Wallet (Keplr / Leap on osmo-test-5)', id: 'connect-wallet' },
    { num: '4', title: 'Subscribe Button (Commit)', id: 'subscribe' },
    { num: '5', title: 'Buy Button (Swap OSMO for Creator Tokens)', id: 'buy' },
    { num: '6', title: 'Sell Button (Swap Creator Tokens for OSMO)', id: 'sell' },
    { num: '7', title: 'Cross-Token Swaps (Router)', id: 'cross-token' },
    { num: '8', title: 'Add Liquidity', id: 'add-liquidity' },
    { num: '9', title: 'Remove Liquidity', id: 'remove-liquidity' },
    { num: '10', title: 'Collect Fees', id: 'collect-fees' },
    { num: '11', title: 'Create a Creator Pool', id: 'create-pool' },
    { num: '12', title: 'Querying Pool Info (Read-Only)', id: 'query-pool' },
    { num: '13', title: 'Gating Content for Subscribers', id: 'gating' },
    { num: '', title: 'Creator Links Pages', id: 'creator-links' },
    { num: '14', title: 'Full Working Example Page', id: 'full-example' },
    { num: '15', title: 'Troubleshooting', id: 'troubleshooting' },
    { num: '16', title: 'Contract Address Reference', id: 'contract-reference' },
];

const IntegrationGuidePage: React.FC = () => {
    return (
        <PageShell>
                <Grid item xs={12} md={10} lg={8}>
                    <Stack spacing={2}>
                        {/* Header */}
                        <Card>
                            <CardContent>
                                <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
                                    BlueChip Frontend Integration Guide
                                </Typography>
                                <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                                    This guide is for website owners, content creators, and community builders
                                    who want to add BlueChip buttons and features to their own website.
                                    You do <strong>not</strong> need to be a programmer — just copy and paste
                                    the code blocks below.
                                </Typography>
                                <Typography variant="body1" color="text.secondary">
                                    The BlueChip creator-pool contracts run on <strong>Osmosis</strong>. Every
                                    snippet in this guide targets the current deployment on the Osmosis
                                    testnet (<code>osmo-test-5</code>), where the native token is{' '}
                                    <strong>OSMO</strong> (<code>uosmo</code>, 6 decimals). A mainnet
                                    (<code>osmosis-1</code>) factory is not deployed yet — contract addresses
                                    will change at mainnet launch (see Section 16).
                                </Typography>
                            </CardContent>
                        </Card>

                        {/* Table of Contents */}
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                                    Table of Contents
                                </Typography>
                                <Box component="ul" sx={{ pl: 3, listStyle: 'none' }}>
                                    {tocItems.map((item) => (
                                        <li key={item.id}>
                                            <Typography
                                                component="a"
                                                href={`#${item.id}`}
                                                sx={{
                                                    color: 'primary.main',
                                                    textDecoration: 'none',
                                                    '&:hover': { textDecoration: 'underline' },
                                                }}
                                            >
                                                {item.num ? `${item.num}. ${item.title}` : item.title}
                                            </Typography>
                                        </li>
                                    ))}
                                </Box>
                            </CardContent>
                        </Card>

                        {/* Wire-format quirk — the one thing that trips up every integrator */}
                        <Alert severity="warning">
                            <strong>Read this once, it will save you an hour:</strong> the contracts predate
                            the Osmosis deployment, so the <em>native</em> side of every pair is wire-encoded
                            as <code>{'{ bluechip: { denom: "uosmo" } }'}</code>. The JSON key{' '}
                            <code>bluechip</code> is a legacy serde rename — <strong>the denom inside is what
                            matters</strong>, and on Osmosis it is always <code>uosmo</code>. Creator tokens
                            are encoded as <code>{'{ creator_token: { contract_addr: "osmo1..." } }'}</code>.
                            Every commit, swap, route hop, and pool-creation message in this guide uses this
                            shape.
                        </Alert>

                        {/* Section 1: Prerequisites */}
                        <SectionCard id="prerequisites" number="1" title="Prerequisites — What You Need First">
                            <Typography variant="h6" gutterBottom>
                                For Your Visitors (People Using Your Website)
                            </Typography>
                            <Typography paragraph>
                                Your visitors need a Cosmos wallet extension — <strong>Keplr</strong> or{' '}
                                <strong>Leap</strong> — connected to the Osmosis testnet
                                (<code>osmo-test-5</code>). Both wallets expose the same API, and the snippets
                                in this guide work with either.
                            </Typography>
                            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
                                Install a wallet:
                            </Typography>
                            <Box component="ul" sx={{ mb: 2 }}>
                                <li><Typography><strong>Keplr:</strong> keplr.app/get (Chrome / Brave / Edge / Firefox / mobile)</Typography></li>
                                <li><Typography><strong>Leap:</strong> leapwallet.io (same platforms)</Typography></li>
                            </Box>
                            <Alert severity="info" sx={{ mb: 2 }}>
                                If a visitor has no wallet installed, the code below shows them a friendly
                                message with an install link. Keplr already ships with Osmosis support, so
                                registering <code>osmo-test-5</code> via <code>suggestChain</code> is usually
                                a one-click approval.
                            </Alert>

                            <Typography variant="h6" gutterBottom>
                                Testnet OSMO (gas + commits)
                            </Typography>
                            <Typography paragraph>
                                Everything on <code>osmo-test-5</code> is paid in <strong>testnet OSMO</strong>,
                                which is free: grab some from the Osmosis testnet faucet at{' '}
                                <code>faucet.testnet.osmosis.zone</code> (paste your <code>osmo1...</code>{' '}
                                address). You need it for gas on every transaction, for commits (valued in USD
                                via the on-chain TWAP price), and for the flat pool-creation fee (1 OSMO).
                            </Typography>

                            <Typography variant="h6" gutterBottom>
                                For You (The Website Owner)
                            </Typography>
                            <Box component="ol">
                                <li><Typography>A website where you can add HTML and JavaScript (WordPress, Squarespace with code injection, a custom site, etc.)</Typography></li>
                                <li><Typography>Your <strong>Pool Contract Address</strong> — the address of your creator pool on Osmosis (looks like <code>osmo1abc...xyz</code>)</Typography></li>
                                <li><Typography>For the hand-written snippets (Sections 3–13): <strong>CosmJS</strong> — <code>npm install @cosmjs/cosmwasm-stargate@0.32.4</code> with a bundler, or the ES-module loader shown in Section 2. The factory and router addresses are already baked into the config block.</Typography></li>
                            </Box>
                        </SectionCard>

                        {/* Section 2: Quick Start */}
                        <SectionCard id="quick-start" number="2" title="Quick Start — The Embeddable Widget">
                            <Alert severity="success" sx={{ mb: 2 }}>
                                <strong>This is the recommended path for most creators.</strong> If all you want is a
                                Subscribe button and/or subscriber-gated content, you do not need any of the hand-written
                                code in the rest of this guide — drop in the widget below and you are done.
                            </Alert>
                            <Typography paragraph>
                                The widget is a single self-contained script (the wallet library is compiled in — nothing
                                else to load). It lives in this repository under <code>widget/</code> and is being
                                retargeted to Osmosis in this same release: it connects Keplr on{' '}
                                <code>osmo-test-5</code>, commits <strong>uosmo</strong> to your pool, and reads the
                                same on-chain commit ledger the rest of this guide uses. Paste the script tag once,
                                then drop a tagged <code>&lt;div&gt;</code> wherever you want a button. The{' '}
                                <strong>only value you must supply is your pool address</strong>; chain ID, endpoints,
                                denom, and gas settings default to the Osmosis testnet deployment.
                            </Typography>
                            <CodeBlock code={widgetQuickStartCode} language="HTML" />

                            <Alert severity="info" sx={{ my: 2 }}>
                                <strong>Fully portable.</strong> The same two lines work on any website that lets you add
                                HTML — a custom site, WordPress, Webflow, a static page on Netlify or GitHub Pages. Nothing
                                is tied to a domain or an API key, so you can move the button between pages, run it on
                                several sites at once, or hand it to someone else to embed. Prefer not to depend on the CDN?
                                Download <code>widget/dist/bluechip-widget.min.js</code> and host it next to your own site.
                            </Alert>

                            <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>Configuration attributes</Typography>
                            <Typography paragraph>
                                Configure each widget right on the element with <code>data-</code> attributes — no
                                JavaScript required:
                            </Typography>
                            <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell><strong>Attribute</strong></TableCell>
                                            <TableCell><strong>Applies to</strong></TableCell>
                                            <TableCell><strong>What it does</strong></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        <TableRow>
                                            <TableCell><code>data-bluechip-subscribe</code></TableCell>
                                            <TableCell>marker</TableCell>
                                            <TableCell>Renders a Subscribe (commit) button on this element.</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell><code>data-bluechip-gate</code></TableCell>
                                            <TableCell>marker</TableCell>
                                            <TableCell>Hides this element's content until the viewer's wallet qualifies.</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell><code>data-pool</code></TableCell>
                                            <TableCell>both</TableCell>
                                            <TableCell>Creator pool address (<code>osmo1...</code>). Falls back to the pool set in <code>init()</code>.</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell><code>data-amount</code></TableCell>
                                            <TableCell>subscribe</TableCell>
                                            <TableCell>Pre-filled amount, in whole OSMO.</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell><code>data-fixed-amount</code></TableCell>
                                            <TableCell>subscribe</TableCell>
                                            <TableCell>Hide the amount input and always commit <code>data-amount</code>.</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell><code>data-min-usd</code></TableCell>
                                            <TableCell>gate</TableCell>
                                            <TableCell>Minimum lifetime USD committed required to unlock.</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell><code>data-label</code></TableCell>
                                            <TableCell>both</TableCell>
                                            <TableCell>Custom button text.</TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell><code>data-denied-text</code></TableCell>
                                            <TableCell>gate</TableCell>
                                            <TableCell>Message shown when the viewer doesn't qualify.</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </TableContainer>
                            <Typography paragraph>
                                The widget injects its own scoped styles (every class is prefixed <code>bcw-</code>, so
                                nothing leaks into or out of your page) and you can restyle it freely with your own CSS.
                            </Typography>

                            <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>Set a default pool once</Typography>
                            <Typography paragraph>
                                If every button on a page points at the same pool, set it once with <code>init()</code> and
                                omit <code>data-pool</code> from the individual elements:
                            </Typography>
                            <CodeBlock code={widgetInitCode} language="HTML" />

                            <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>JavaScript API (for custom UIs)</Typography>
                            <Typography paragraph>
                                The same primitives the buttons use are exposed on <code>window.BluechipWidget</code>, so
                                you can wire your own elements instead of the built-in buttons:
                            </Typography>
                            <CodeBlock code={widgetJsApiCode} language="JavaScript" />

                            <Alert severity="warning" sx={{ mt: 2 }}>
                                The <code>data-bluechip-gate</code> / <code>checkSubscription</code> gate is a
                                <strong> client-side convenience</strong> — it hides DOM until the check passes, which is
                                perfect for perks and soft-gating, but anyone can bypass it with browser dev tools. To
                                protect content that truly matters, verify wallet ownership server-side (Section 13) and run
                                the subscription lookup from your backend.
                            </Alert>

                            <Accordion sx={{ mt: 3 }}>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Typography variant="subtitle1" fontWeight="bold">
                                        Advanced: load CosmJS yourself (only for the hand-written buttons below)
                                    </Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <Typography paragraph>
                                        Sections 4–13 show fully hand-written buttons that talk to Osmosis directly through
                                        CosmJS, for developers who want complete control. Those snippets need CosmJS loaded
                                        and a config block — the widget above needs neither.
                                    </Typography>
                                    <Alert severity="warning" sx={{ mb: 2 }}>
                                        CosmJS publishes no ready-made browser bundle — a plain{' '}
                                        <code>&lt;script src=&quot;unpkg.com/.../build/bundle.js&quot;&gt;</code> tag 404s. Sites
                                        with a bundler should <code>npm install @cosmjs/cosmwasm-stargate</code>; plain HTML
                                        sites can load it as an ES module from a CJS-to-ESM CDN:
                                    </Alert>
                                    <CodeBlock code={scriptTagsCode} language="HTML" />
                                    <Typography paragraph sx={{ mt: 2 }}>
                                        Then add this configuration block. The factory and router addresses below are the
                                        live <code>osmo-test-5</code> deployment — the only value you must edit is{' '}
                                        <code>poolAddress</code>:
                                    </Typography>
                                    <CodeBlock code={configCode} language="HTML" />
                                </AccordionDetails>
                            </Accordion>
                        </SectionCard>

                        {/* Section 3: Connecting a wallet */}
                        <SectionCard id="connect-wallet" number="3" title="Connecting a Wallet (Keplr / Leap on osmo-test-5)">
                            <Typography paragraph>
                                Every BlueChip interaction starts by connecting the user's wallet. The script
                                below detects Keplr (or Leap), registers <code>osmo-test-5</code> via{' '}
                                <code>experimentalSuggestChain</code>, and opens a{' '}
                                <code>SigningCosmWasmClient</code> against the Osmosis testnet RPC. Add it{' '}
                                <strong>once</strong> on any page where you have BlueChip buttons:
                            </Typography>
                            <CodeBlock code={walletConnectionCode} language="JavaScript" />

                            <Typography paragraph sx={{ mt: 2 }}>
                                Add a Connect Wallet button to your page:
                            </Typography>
                            <CodeBlock code={connectButtonCode} language="HTML" />
                        </SectionCard>

                        {/* Section 4: Subscribe */}
                        <SectionCard id="subscribe" number="4" title="Subscribe Button (Commit)">
                            <Typography paragraph>
                                The <strong>Subscribe</strong> button lets your fans commit OSMO to your creator pool.
                                This is how people support you. The pool values every commit in USD using the Osmosis
                                on-chain TWAP price (via the factory — no external oracle), and its behavior depends
                                on the pool's funding phase:
                            </Typography>
                            <Box component="ul" sx={{ mb: 2 }}>
                                <li>
                                    <Typography>
                                        <strong>Pre-threshold (funding phase):</strong> commits are recorded in a public
                                        ledger. When cumulative commits reach the threshold — <strong>$20 on testnet,
                                        $25,000 on mainnet</strong> — the pool mints its creator-token supply, rewards
                                        early subscribers proportionally, seeds the AMM, and opens for trading.
                                    </Typography>
                                </li>
                                <li>
                                    <Typography>
                                        <strong>Post-threshold (active phase):</strong> commits are swapped through the
                                        AMM and the supporter receives creator tokens immediately —{' '}
                                        <code>max_spread</code> applies here, exactly like a buy.
                                    </Typography>
                                </li>
                            </Box>
                            <Alert severity="info" sx={{ mb: 2 }}>
                                A 6% fee is deducted from every commit: 1% to the BlueChip protocol, 5% to you the
                                creator. Minimum commit size is <strong>$5 pre-threshold</strong> and{' '}
                                <strong>$1 post-threshold</strong> (USD value at the TWAP price when the commit lands).
                            </Alert>
                            <CodeBlock code={subscribeCode} language="JavaScript" />
                        </SectionCard>

                        {/* Section 5: Buy */}
                        <SectionCard id="buy" number="5" title="Buy Button (Swap OSMO for Creator Tokens)">
                            <Typography paragraph>
                                The <strong>Buy</strong> button lets people swap OSMO for your creator tokens with{' '}
                                <code>simple_swap</code>. This only works <strong>after</strong> the pool has crossed
                                its commit threshold and has active liquidity — before that, swaps reject with{' '}
                                <em>"You can not swap until the threshold is crossed"</em> (use Subscribe instead).
                            </Typography>
                            <CodeBlock code={buyCode} language="JavaScript" />
                        </SectionCard>

                        {/* Section 6: Sell */}
                        <SectionCard id="sell" number="6" title="Sell Button (Swap Creator Tokens for OSMO)">
                            <Typography paragraph>
                                The <strong>Sell</strong> button lets people swap their creator tokens back into
                                OSMO. This uses the CW20 <code>send</code> mechanism — the tokens are
                                sent to the pool contract with an embedded <code>{'{ swap: {...} }'}</code> instruction.
                            </Typography>
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                Selling creator tokens requires the CW20 token contract address, which is different
                                from the pool address. You can find it by querying the pool's <code>pair</code> endpoint
                                (see Section 12).
                            </Alert>
                            <CodeBlock code={sellCode} language="JavaScript" />
                        </SectionCard>

                        {/* Section 7: Cross-Token Swaps */}
                        <SectionCard id="cross-token" number="7" title="Cross-Token Swaps (Router)">
                            <Typography paragraph>
                                Creator tokens never share a pool with each other — every pair trades
                                through OSMO. To let a fan swap <em>another creator's token</em>{' '}
                                directly into yours, use the <strong>router contract</strong>: it executes
                                the whole route (up to 3 hops) in a single atomic transaction and validates
                                every hop's pool against the factory registry before moving funds. The
                                testnet router address is already in the config block.
                            </Typography>
                            <Alert severity="info" sx={{ mb: 2 }}>
                                The router has <strong>no per-hop slippage parameters</strong>. Protection
                                comes from <code>minimum_receive</code> on the final token: simulate first
                                with <code>simulate_multi_hop</code>, then set{' '}
                                <code>minimum_receive</code> a tolerance below the simulated output. If any
                                hop moves the price so the final amount lands short, the entire route
                                reverts — partial swaps cannot strand funds mid-route.
                            </Alert>
                            <CodeBlock code={crossTokenSwapCode} language="JavaScript" />
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                Both pools in the route must be past their threshold (active AMMs). Pool
                                addresses for route hops should come from the factory's <code>pools</code>{' '}
                                query (Section 12) — unregistered addresses are rejected on-chain.
                            </Typography>
                        </SectionCard>

                        {/* Section 8: Add Liquidity */}
                        <SectionCard id="add-liquidity" number="8" title="Add Liquidity">
                            <Typography paragraph>
                                Liquidity providers earn trading fees. When you add liquidity, you receive an NFT that
                                represents your position. You must provide <strong>both</strong> OSMO and
                                creator tokens in the correct ratio.
                            </Typography>
                            <Alert severity="info" sx={{ mb: 2 }}>
                                Adding liquidity only works <strong>after</strong> the pool threshold has been
                                crossed. There are two steps: approve the pool to spend
                                your creator tokens (CW20 allowance), then deposit both tokens into the pool —
                                the OSMO leg travels as native <code>funds</code>, the token leg via allowance.
                            </Alert>
                            <CodeBlock code={addLiquidityCode} language="JavaScript" />
                            <Typography paragraph sx={{ mt: 2 }}>
                                To grow an <strong>existing</strong> position instead of minting a new NFT each
                                time, use <code>add_to_position</code> with your position ID:
                            </Typography>
                            <CodeBlock code={addToPositionCode} language="JavaScript" />
                        </SectionCard>

                        {/* Section 9: Remove Liquidity */}
                        <SectionCard id="remove-liquidity" number="9" title="Remove Liquidity">
                            <Typography paragraph>
                                You can remove liquidity three ways:
                            </Typography>
                            <Box component="ul" sx={{ mb: 2 }}>
                                <li><Typography><strong>By Amount</strong> (<code>remove_partial_liquidity</code>) — remove a specific amount of liquidity units</Typography></li>
                                <li><Typography><strong>By Percentage</strong> (<code>remove_partial_liquidity_by_percent</code>) — remove a percentage (1–99) of your position</Typography></li>
                                <li><Typography><strong>Remove All</strong> (<code>remove_all_liquidity</code>) — withdraw everything</Typography></li>
                            </Box>
                            <Typography paragraph>
                                You will need your <strong>Position ID</strong> (the NFT token ID you received when
                                adding liquidity — query <code>positions_by_owner</code> if you lost track of it).
                            </Typography>
                            <CodeBlock code={removeLiquidityCode} language="JavaScript" />
                        </SectionCard>

                        {/* Section 10: Collect Fees */}
                        <SectionCard id="collect-fees" number="10" title="Collect Fees">
                            <Typography paragraph>
                                If you have a liquidity position (NFT), you can collect your accumulated trading
                                fees <strong>without</strong> removing your liquidity. Fees are paid out in both
                                OSMO and creator tokens.
                            </Typography>
                            <CodeBlock code={collectFeesCode} language="JavaScript" />
                            <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
                                Creator-only claims
                            </Typography>
                            <Typography paragraph>
                                Two more claim paths exist for the <strong>creator wallet</strong> (the wallet that
                                created the pool): <code>claim_creator_fees</code> empties the creator fee pot (the
                                LP-fee slice clipped off small positions), and{' '}
                                <code>claim_creator_excess_liquidity</code> releases the excess OSMO/token amounts
                                locked at threshold crossing once their lock period elapses. The{' '}
                                <code>creator_earnings</code> query renders a whole earnings panel in one call.
                            </Typography>
                            <CodeBlock code={creatorClaimsCode} language="JavaScript" />
                        </SectionCard>

                        {/* Section 11: Create a Creator Pool */}
                        <SectionCard id="create-pool" number="11" title="Create a Creator Pool">
                            <Typography paragraph>
                                Anyone can create a creator (commit) pool through the factory — it is the only
                                pool type in this deployment (there are no standard/xyk pools). The factory mints
                                a fresh CW20 creator token and the pool starts in a funding (commit) phase. Once
                                the USD threshold is crossed ($20 on testnet, $25,000 on mainnet), 1,200,000
                                creator tokens are minted and distributed: 500k to early subscribers
                                (proportional to their commits), 325k to you the creator, 25k to the BlueChip
                                protocol, and 350k seeded into the pool as initial liquidity.
                            </Typography>
                            <Alert severity="info" sx={{ mb: 2 }}>
                                Pool creation charges a <strong>flat fee in OSMO</strong> — currently{' '}
                                <strong>1 OSMO on testnet</strong> — read live from the factory config field{' '}
                                <code>pool_creation_fee</code> and attached as <code>funds</code>. The factory
                                verifies the amount, forwards the fee to the protocol wallet, and refunds any
                                surplus in the same tx. The funds array must contain <strong>only uosmo</strong>:
                                any other denom errors the call. The <code>pool_msg</code> body carries only{' '}
                                <code>pool_token_info</code> — the commit threshold, fee splits, payout amounts,
                                and lock caps all come from the factory's stored config.
                            </Alert>
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                The wallet that creates the pool becomes the creator wallet.
                                <strong> Do not lose your seed phrase</strong> — BlueChip cannot recover it.
                                Token name must be 3-50 printable ASCII characters; symbol must be 3-12 chars
                                (A-Z, 0-9) with at least one letter; decimals are pinned to 6.
                            </Alert>
                            <CodeBlock code={createPoolCode} language="JavaScript" />
                        </SectionCard>

                        {/* Section 12: Querying Pool Info */}
                        <SectionCard id="query-pool" number="12" title="Querying Pool Info (Read-Only)">
                            <Typography paragraph>
                                These queries don't require a wallet connection — they're read-only.
                                You can use them to show pool status on your site.
                            </Typography>

                            <Accordion>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Typography sx={{ fontWeight: 'bold' }}>Check if Pool Threshold is Reached</Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <CodeBlock code={queryPoolStatusCode} language="JavaScript" />
                                </AccordionDetails>
                            </Accordion>

                            <Accordion>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Typography sx={{ fontWeight: 'bold' }}>List Every Pool (Factory Registry, Paginated)</Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <CodeBlock code={queryFactoryPoolsCode} language="JavaScript" />
                                </AccordionDetails>
                            </Accordion>

                            <Accordion>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Typography sx={{ fontWeight: 'bold' }}>Pool Analytics (Prices, TVL, Raise Progress)</Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <CodeBlock code={queryAnalyticsCode} language="JavaScript" />
                                </AccordionDetails>
                            </Accordion>

                            <Accordion>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Typography sx={{ fontWeight: 'bold' }}>Quote a Swap (Simulation / Reverse Simulation)</Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <CodeBlock code={querySimulationCode} language="JavaScript" />
                                </AccordionDetails>
                            </Accordion>

                            <Accordion>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Typography sx={{ fontWeight: 'bold' }}>OSMO → USD at the Protocol's Own TWAP Rate</Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <CodeBlock code={queryUsdPriceCode} language="JavaScript" />
                                </AccordionDetails>
                            </Accordion>

                            <Accordion>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Typography sx={{ fontWeight: 'bold' }}>Get User's Subscription Info</Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <CodeBlock code={querySubscriptionCode} language="JavaScript" />
                                </AccordionDetails>
                            </Accordion>

                            <Accordion>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Typography sx={{ fontWeight: 'bold' }}>Get User's Liquidity Positions</Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <CodeBlock code={queryPositionsCode} language="JavaScript" />
                                </AccordionDetails>
                            </Accordion>

                            <Accordion>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Typography sx={{ fontWeight: 'bold' }}>Get Creator Token Address from Pool</Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <CodeBlock code={queryTokenAddressCode} language="JavaScript" />
                                </AccordionDetails>
                            </Accordion>
                        </SectionCard>

                        {/* Section 13: Gating */}
                        <SectionCard id="gating" number="13" title="Gating Content for Subscribers">
                            <Typography paragraph>
                                Every commit writes a permanent, public record to your pool's ledger:
                                who committed, how much (in USD and OSMO), and when. Your website
                                can read this record to give supporters <strong>special privileges</strong> —
                                subscriber-only pages, download links, badges, Discord roles, early access,
                                anything you can gate. The key query is{' '}
                                <code>{'committing_info { wallet }'}</code>: it returns <code>null</code> if
                                the wallet has <em>never</em> committed to your pool, otherwise the wallet's
                                cumulative record with <code>total_paid_usd</code> (micro-USD, for tiers) and{' '}
                                <code>last_committed</code> (nanoseconds, for recency).
                            </Typography>
                            <Typography paragraph>
                                Because every stack is different (static site, WordPress, Node, Discord
                                bot...), this section shows three building blocks, from simplest to most
                                robust. They are plain JavaScript and standard HTTP/WebSocket calls, so
                                they port to any environment.
                            </Typography>

                            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                                Pattern A — Client-Side Gating (good for cosmetic perks)
                            </Typography>
                            <Typography paragraph>
                                Read the connected wallet's commit record with the <code>committing_info</code> query
                                and show/hide page sections by tier. No server needed — this runs entirely
                                in the visitor's browser.
                            </Typography>
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                Client-side checks can be bypassed by anyone comfortable with browser dev
                                tools — and they prove only that a wallet is <em>connected</em>, not owned.
                                Use Pattern A for cosmetic perks (badges, styling, shout-outs). For anything
                                valuable (downloads, accounts, paid content), use Pattern B.
                            </Alert>
                            <CodeBlock code={privClientGateCode} language="HTML + JavaScript" />

                            <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
                                Pattern B — Server-Verified Privileges (secure)
                            </Typography>
                            <Typography paragraph>
                                The commit ledger is public, so the question your server must answer is
                                not "has this wallet committed?" but "does this visitor <em>own</em> that
                                wallet?". The standard solution is an <strong>ADR-36 signature</strong>:
                                Keplr's <code>signArbitrary</code> signs a one-time nonce at zero gas cost,
                                your server verifies the signature, then queries the pool over the Osmosis
                                testnet REST endpoint and grants a role based on the on-chain record.
                            </Typography>
                            <CodeBlock code={privServerVerifyCode} language="JavaScript / Node.js" />

                            <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
                                Pattern C — React to Commits in Real Time
                            </Typography>
                            <Typography paragraph>
                                Commits emit on-chain events the moment they land. Subscribe to them over
                                the RPC WebSocket to trigger perks instantly — flip on a chat invite, fire
                                a Discord webhook, or thank the supporter by name.
                            </Typography>
                            <CodeBlock code={privEventWatchCode} language="JavaScript" />

                            <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
                                <strong>Design notes:</strong> amounts are micro-units
                                (<code>total_paid_usd</code> of 50000000 = $50);&nbsp;
                                <code>last_committed</code> is in nanoseconds; commit records never expire
                                on-chain, so "active subscriber" windows (e.g. committed within 30 days) are
                                your site's policy, enforced from <code>last_committed</code>. For
                                token-balance-based perks instead, query the creator token's CW20&nbsp;
                                <code>balance</code> endpoint the same way.
                            </Alert>
                        </SectionCard>

                        {/* Creator Links pages (unnumbered companion to Section 13) */}
                        <Card id="creator-links">
                            <CardContent>
                                <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold' }}>
                                    Creator Links Pages
                                </Typography>
                                <Typography paragraph>
                                    Don't want to run your own website at all? Creators can publish a
                                    link-in-bio page right on this site at <code>/creator/:name</code> — a
                                    shareable profile with your pool's subscribe button and a list of links,
                                    any of which can be <strong>subscription-gated</strong>. Gated links unlock
                                    for visitors whose connected wallet has a qualifying commit record on your
                                    pool — the exact same <code>committing_info</code> mechanism as the widget
                                    gate in Section 2 and the patterns in Section 13, so a subscription made
                                    anywhere (your site, the widget, this explorer) unlocks everywhere.
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Set up your page from your creator pool's page on this site, then share{' '}
                                    <code>/creator/&lt;your-name&gt;</code> as your link-in-bio.
                                </Typography>
                            </CardContent>
                        </Card>

                        {/* Section 14: Full Working Example */}
                        <SectionCard id="full-example" number="14" title="Full Working Example Page">
                            <Typography paragraph>
                                Here's a complete, self-contained HTML page you can save and use as-is — just
                                replace <code>osmo1YOUR_POOL_ADDRESS</code>. It includes wallet connection, a
                                Subscribe (commit) button, and a subscriber-gated section that unlocks at $5
                                lifetime committed.
                            </Typography>
                            <CodeBlock code={fullExampleCode} language="HTML" />
                        </SectionCard>

                        {/* Section 15: Troubleshooting */}
                        <SectionCard id="troubleshooting" number="15" title="Troubleshooting">
                            <TableContainer component={Paper} variant="outlined">
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 'bold' }}>Problem</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold' }}>Solution</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {[
                                            ['No wallet detected', 'Install Keplr (keplr.app/get) or Leap (leapwallet.io) and refresh the page'],
                                            ['"Failed to connect"', 'Approve the osmo-test-5 chain suggestion in the wallet popup, then try again'],
                                            ['"insufficient funds"', 'You need testnet OSMO for gas and commits — get it free from faucet.testnet.osmosis.zone'],
                                            ['"out of gas"', 'Increase the gas limit passed to stdFee() (e.g., stdFee(500000) to stdFee(800000))'],
                                            ['"Commit too small: $X USD (minimum $Y USD ...)"', 'Commits must be worth at least $5 pre-threshold / $1 post-threshold at the current TWAP price of OSMO. Increase the amount'],
                                            ['"Transaction deadline has passed"', 'The transaction_deadline (nanoseconds) expired before the tx landed — often a slow mempool or a skewed device clock. Rebuild the message with a fresh deadline and re-sign'],
                                            ['"Invalid commit funds: ... exactly the bluechip denom"', 'The funds array must contain a single uosmo entry matching the commit amount. Remove any IBC / tokenfactory / stray denoms'],
                                            ['"x/twap query failed" / "Oracle price is invalid"', 'The factory could not read a valid OSMO/USD TWAP from its pricing pool, so the commit fails CLOSED (no commit is recorded, funds are returned). This is a chain-side condition — wait and retry'],
                                            ['"Post-threshold cooldown active: trades resume at block N"', 'Right after a pool crosses its threshold, swaps pause for a short block cooldown. Wait for the stated block and retry'],
                                            ['"Swap exceeds the post-threshold cap"', 'After the cooldown, per-swap size ramps up over the first blocks of trading to blunt sniping. Split the swap into smaller pieces or wait for the ramp to finish'],
                                            ['"You can not swap until the threshold is crossed"', 'Buy/Sell only work after the pool crosses its commit threshold ($20 testnet / $25,000 mainnet). Use Subscribe instead'],
                                            ['"You are trying to commit too frequently"', 'Commits have a short per-wallet cooldown. Wait a few seconds and try again'],
                                            ['"Insufficient creation fee" (create pool)', 'The attached uosmo is below the factory\'s flat pool_creation_fee (1 OSMO on testnet). Re-query { factory: {} } and attach the live value'],
                                            ['"creation fee is disabled; do not attach any funds"', 'The factory currently has pool_creation_fee = 0. Pass an empty funds array on the create call'],
                                            ['"Route exceeds the maximum of 3 hops"', 'The router caps routes at 3 hops. Any creator-token pair needs at most 2 (token → OSMO → token)'],
                                            ['"not registered with the factory" (router)', "A hop's pool address is not in the factory registry. Use pool addresses from the factory's pools query or this explorer"],
                                            ['Router swap reverts with a minimum_receive error', 'Price moved past your tolerance between simulation and execution. Re-quote and retry, or widen slippage slightly'],
                                            ['"You do not own this position"', 'Double-check your Position ID. Query positions_by_owner to find your positions'],
                                            ['Transaction stuck / pending', 'The transaction may still be processing. Check the tx hash on this explorer or an Osmosis testnet explorer'],
                                            ['Wallet not detecting on mobile', "Use the Keplr or Leap mobile app's built-in browser to visit your site"],
                                        ].map(([problem, solution], idx) => (
                                            <TableRow key={idx}>
                                                <TableCell><code>{problem}</code></TableCell>
                                                <TableCell>{solution}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </SectionCard>

                        {/* Section 16: Contract Address Reference */}
                        <SectionCard id="contract-reference" number="16" title="Contract Address Reference">
                            <Typography variant="h6" gutterBottom>
                                Osmosis testnet (osmo-test-5) — current deployment
                            </Typography>
                            <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 'bold' }}>What</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold' }}>Value</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {[
                                            ['Chain ID', 'osmo-test-5'],
                                            ['RPC', 'https://rpc.osmotest5.osmosis.zone'],
                                            ['REST (LCD)', 'https://lcd.osmotest5.osmosis.zone'],
                                            ['Native denom', 'uosmo (OSMO, 6 decimals)'],
                                            ['Factory', TESTNET_FACTORY],
                                            ['Router', TESTNET_ROUTER],
                                            ['Commit threshold', '$20 USD (20000000 micro-USD)'],
                                            ['Commit minimums', '$5 pre-threshold / $1 post-threshold'],
                                            ['Commit fees', '1% protocol + 5% creator'],
                                            ['Pool creation fee', '1 OSMO flat (read live from factory config pool_creation_fee)'],
                                        ].map(([what, value], idx) => (
                                            <TableRow key={idx}>
                                                <TableCell><strong>{what}</strong></TableCell>
                                                <TableCell sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{value}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            <Alert severity="warning" sx={{ mb: 2 }}>
                                <strong>Mainnet (osmosis-1): TBD.</strong> The mainnet factory is not deployed
                                yet — all addresses above WILL change at mainnet launch, where the commit
                                threshold is $25,000. This explorer reads its deployment from environment
                                variables, so the switch is config-only:{' '}
                                <code>REACT_APP_NETWORK=mainnet</code> plus{' '}
                                <code>REACT_APP_FACTORY_ADDRESS</code> and{' '}
                                <code>REACT_APP_ROUTER_ADDRESS</code> override the built-in testnet defaults.
                            </Alert>

                            <Typography variant="h6" gutterBottom>
                                Per-pool addresses
                            </Typography>
                            <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 'bold' }}>Address</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold' }}>What It Is</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold' }}>Where to Find</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {[
                                            ['Pool Address', 'Your specific creator pool', "Returned when the pool is created; also in the factory's pools query and on this explorer"],
                                            ['Creator Token Address', 'The CW20 token for your pool', "Query the pool's pair endpoint (Section 12)"],
                                            ['Position NFT Address', 'NFT contract for LP positions', 'Part of the pool creation events'],
                                        ].map(([addr, desc, where], idx) => (
                                            <TableRow key={idx}>
                                                <TableCell><strong>{addr}</strong></TableCell>
                                                <TableCell>{desc}</TableCell>
                                                <TableCell>{where}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            <Typography variant="h6" gutterBottom>
                                How to Find Your Creator Token Address
                            </Typography>
                            <Typography paragraph>
                                After your pool is created, you can find the creator token address by querying:
                            </Typography>
                            <CodeBlock
                                code={`var pairInfo = await client.queryContractSmart("osmo1YOUR_POOL_ADDRESS", { pair: {} });
// Look for the creator_token entry in pairInfo.asset_infos
// (pool_token_info is the factory-side input field, not this response)`}
                                language="JavaScript"
                            />
                            <Typography variant="body2" color="text.secondary">
                                Or check the pool creation transaction on this explorer — the token contract
                                address appears in the instantiation events.
                            </Typography>
                        </SectionCard>
                    </Stack>
                </Grid>
        </PageShell>
    );
};

export default IntegrationGuidePage;
