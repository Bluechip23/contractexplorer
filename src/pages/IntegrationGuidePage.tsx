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
    Chip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CodeBlock from '../components/universal/CodeBlock';
import SectionCard from '../components/universal/DocSectionCard';


const widgetQuickStartCode = `<!-- 1. Load the BlueChip widget (self-contained, no other scripts needed) -->
<script src="https://cdn.jsdelivr.net/gh/Bluechip23/bluechipblockexplorer@main/widget/dist/bluechip-widget.min.js"><\/script>

<!-- 2. Subscribe button — the ONLY thing you edit is your pool address -->
<div data-bluechip-subscribe data-pool="bluechip1YOUR_POOL_ADDRESS" data-amount="25"></div>

<!-- 3. Optional: gate content behind a subscription -->
<div data-bluechip-gate data-pool="bluechip1YOUR_POOL_ADDRESS" data-min-usd="5">
    Subscriber-only content.
</div>`;

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
//  bluechip CONFIGURATION — EDIT THESE VALUES
// ============================================================
const bluechip_CONFIG = {
    // Chain settings
    chainId:        "bluechip-3",
    chainName:      "Bluechip Mainnet",
    rpc:            "https://bluechip.rpc.bluechip.link",
    rest:           "https://bluechip.api.bluechip.link",
    nativeDenom:    "ubluechip",
    coinDecimals:   6,

    // Your contract addresses — REPLACE THESE
    factoryAddress: "bluechip1factory_address_here",
    poolAddress:    "bluechip1your_pool_address_here",

    // Keplr chain registration
    bip44:          { coinType: 118 },
    bech32Config: {
        bech32PrefixAccAddr:  "bluechip",
        bech32PrefixAccPub:   "bluechippub",
        bech32PrefixValAddr:  "bluechipvaloper",
        bech32PrefixValPub:   "bluechipvaloperpub",
        bech32PrefixConsAddr: "bluechipvalcons",
        bech32PrefixConsPub:  "bluechipvalconspub",
    },
    currencies: [{
        coinDenom:        "bluechip",
        coinMinimalDenom: "ubluechip",
        coinDecimals:     6,
        coinGeckoId:      "bluechip",
    }],
    feeCurrencies: [{
        coinDenom:        "bluechip",
        coinMinimalDenom: "ubluechip",
        coinDecimals:     6,
        coinGeckoId:      "bluechip",
        gasPriceStep:     { low: 0.01, average: 0.025, high: 0.04 },
    }],
    stakeCurrency: {
        coinDenom:        "bluechip",
        coinMinimalDenom: "ubluechip",
        coinDecimals:     6,
        coinGeckoId:      "bluechip",
    },
};
</script>`;

const walletConnectionCode = `<script>
// ============================================================
//  WALLET CONNECTION
//  Stores: window.bluechipClient, window.bluechipAddress
// ============================================================

// Global wallet state
window.bluechipClient  = null;
window.bluechipAddress = "";

async function connectKeplrWallet() {
    // ---- Check if Keplr is installed ----
    if (!window.keplr || !window.getOfflineSigner) {
        var msg = document.getElementById("bluechip-wallet-status");
        if (msg) {
            msg.innerHTML =
                '<div style="padding:12px;background:#fff3cd;border:1px solid #ffc107;border-radius:6px;">' +
                '<strong>Keplr Wallet Required</strong><br>' +
                'Please install the Keplr browser extension to continue.<br><br>' +
                '<a href="https://www.keplr.app/get" target="_blank" ' +
                'style="color:#0d6efd;font-weight:bold;">Click here to install Keplr &rarr;</a>' +
                '</div>';
        }
        alert("Keplr wallet not detected!\\n\\nInstall it from: https://www.keplr.app/get");
        return false;
    }

    try {
        // Register the BlueChip chain with Keplr
        await window.keplr.experimentalSuggestChain({
            chainId:        bluechip_CONFIG.chainId,
            chainName:      bluechip_CONFIG.chainName,
            rpc:            bluechip_CONFIG.rpc,
            rest:           bluechip_CONFIG.rest,
            bip44:          bluechip_CONFIG.bip44,
            bech32Config:   bluechip_CONFIG.bech32Config,
            currencies:     bluechip_CONFIG.currencies,
            feeCurrencies:  bluechip_CONFIG.feeCurrencies,
            stakeCurrency:  bluechip_CONFIG.stakeCurrency,
        });

        // Enable the chain
        await window.keplr.enable(bluechip_CONFIG.chainId);

        // Get signer and address
        var offlineSigner = window.getOfflineSigner(bluechip_CONFIG.chainId);
        var accounts      = await offlineSigner.getAccounts();
        var address       = accounts[0].address;

        // Connect the signing client
        var client = await CosmWasmClient.SigningCosmWasmClient.connectWithSigner(
            bluechip_CONFIG.rpc,
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

        // Fetch balance
        var balance = await client.getBalance(address, bluechip_CONFIG.nativeDenom);
        var balanceEl = document.getElementById("bluechip-balance");
        if (balanceEl) {
            var human = (parseInt(balance.amount) / Math.pow(10, bluechip_CONFIG.coinDecimals)).toFixed(6);
            balanceEl.textContent = human + " bluechip";
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
    <button onclick="connectKeplrWallet()"
            style="padding:12px 24px;font-size:16px;font-weight:bold;
                   background:#4CAF50;color:white;border:none;border-radius:8px;
                   cursor:pointer;">
        Connect Keplr Wallet
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
        var connected = await connectKeplrWallet();
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
        // Convert to micro-units (1 bluechip = 1,000,000 ubluechip)
        var microAmount = Math.floor(amount * 1000000).toString();

        // Check pool threshold status
        var thresholdStatus = await window.bluechipClient.queryContractSmart(
            bluechip_CONFIG.poolAddress,
            { is_fully_commited: {} }
        );
        var isThresholdCrossed = (thresholdStatus === "fully_committed");

        // Deadline: 20 minutes from now, in nanoseconds
        var deadlineNs = ((Date.now() + 20 * 60 * 1000) * 1000000).toString();

        // Build the commit message
        var msg = {
            commit: {
                asset: {
                    info:   { bluechip: { denom: bluechip_CONFIG.nativeDenom } },
                    amount: microAmount
                },
                transaction_deadline: deadlineNs,
                belief_price:         null,
                max_spread:           (isThresholdCrossed && spreadInput) ? spreadInput : null
            }
        };

        // Attach native tokens as funds
        var funds = [{ denom: bluechip_CONFIG.nativeDenom, amount: microAmount }];

        var result = await window.bluechipClient.execute(
            window.bluechipAddress,
            bluechip_CONFIG.poolAddress,
            msg,
            { amount: [], gas: "600000" },
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
        var connected = await connectKeplrWallet();
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

        var msg = {
            simple_swap: {
                offer_asset: {
                    info:   { bluechip: { denom: bluechip_CONFIG.nativeDenom } },
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

        var funds = [{ denom: bluechip_CONFIG.nativeDenom, amount: microAmount }];

        var result = await window.bluechipClient.execute(
            window.bluechipAddress,
            bluechip_CONFIG.poolAddress,
            msg,
            { amount: [], gas: "500000" },
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
        var connected = await connectKeplrWallet();
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
                contract: bluechip_CONFIG.poolAddress,
                amount:   microAmount,
                msg:      encodedMsg
            }
        };

        // Execute on the CW20 token contract (NOT the pool contract)
        var result = await window.bluechipClient.execute(
            window.bluechipAddress,
            tokenAddress,
            msg,
            { amount: [], gas: "500000" },
            "Sell Token",
            []
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
//  cross-token pair routes through bluechip. The router runs the
//  whole route atomically (max 3 hops) and enforces slippage on
//  the FINAL amount received via minimum_receive. It takes no
//  per-hop spread parameters; size minimum_receive from the
//  simulation below. Every hop's pool is validated against the
//  factory registry on-chain.
// ============================================================

// Add to bluechip_CONFIG:  routerAddress: "bluechip1router_address_here",

async function crossTokenSwap(fromToken, fromPool, toToken, toPool, amountMicro, slippagePct) {
    // 1. Build the route: TOKEN_A -> bluechip -> TOKEN_B.
    //    (For bluechip -> TOKEN_B, keep only the second hop;
    //     for TOKEN_A -> bluechip, keep only the first.)
    var route = [
        {
            pool_addr:        fromPool,
            offer_asset_info: { creator_token: { contract_addr: fromToken } },
            ask_asset_info:   { bluechip: { denom: bluechip_CONFIG.nativeDenom } }
        },
        {
            pool_addr:        toPool,
            offer_asset_info: { bluechip: { denom: bluechip_CONFIG.nativeDenom } },
            ask_asset_info:   { creator_token: { contract_addr: toToken } }
        }
    ];

    // 2. Simulate to learn the expected output and size minimum_receive.
    var sim = await window.bluechipClient.queryContractSmart(
        bluechip_CONFIG.routerAddress,
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
                contract: bluechip_CONFIG.routerAddress,
                amount:   amountMicro,
                msg:      btoa(JSON.stringify({ execute_multi_hop: hopArgs }))
            }
        },
        { amount: [], gas: "900000" },
        "Cross-Token Swap",
        []
    );

    // 3b. If the first hop offers native bluechip instead, call the
    //     router directly and attach the funds:
    //
    //   await window.bluechipClient.execute(
    //       window.bluechipAddress,
    //       bluechip_CONFIG.routerAddress,
    //       { execute_multi_hop: hopArgs },
    //       { amount: [], gas: "900000" },
    //       "Cross-Token Swap",
    //       [{ denom: bluechip_CONFIG.nativeDenom, amount: amountMicro }]
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
        var connected = await connectKeplrWallet();
        if (!connected) return;
    }

    var amount0 = parseFloat(document.getElementById("liq-amount0").value);
    var amount1 = parseFloat(document.getElementById("liq-amount1").value);
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
            bluechip_CONFIG.poolAddress, { pair: {} }
        );

        var tokenAddress   = null;
        var bluechipDenom  = bluechip_CONFIG.nativeDenom;
        // The pair query returns PoolDetails — its asset list field is
        // \`asset_infos\`. (\`pool_token_info\` is the *input* field on the
        // factory's create messages, not this response; it is read second
        // purely as a defensive fallback.)
        var assets = pairInfo.asset_infos || pairInfo.pool_token_info || [];
        for (var i = 0; i < assets.length; i++) {
            if (assets[i].creator_token) {
                tokenAddress = assets[i].creator_token.contract_addr;
            }
            if (assets[i].bluechip) {
                bluechipDenom = assets[i].bluechip.denom;
            }
        }

        if (!tokenAddress) {
            statusEl.innerHTML = '<div style="color:red;">Error: Could not find creator token.</div>';
            return;
        }

        // Step 2: Check & set CW20 allowance
        statusEl.innerHTML = '<div style="color:#1565c0;">Step 2: Checking token allowance...</div>';

        var allowanceInfo = await window.bluechipClient.queryContractSmart(tokenAddress, {
            allowance: { owner: window.bluechipAddress, spender: bluechip_CONFIG.poolAddress }
        });

        if (parseInt(allowanceInfo.allowance) < parseInt(amount1Micro)) {
            statusEl.innerHTML = '<div style="color:#1565c0;">Step 2: Approving tokens...</div>';
            await window.bluechipClient.execute(
                window.bluechipAddress,
                tokenAddress,
                { increase_allowance: { spender: bluechip_CONFIG.poolAddress, amount: amount1Micro } },
                { amount: [], gas: "200000" },
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
            bluechip_CONFIG.poolAddress,
            msg,
            { amount: [], gas: "500000" },
            "Deposit Liquidity",
            [{ denom: bluechipDenom, amount: amount0Micro }]
        );

        statusEl.innerHTML = '<div style="color:#2e7d32;font-weight:bold;">Liquidity added!</div>';
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
        var connected = await connectKeplrWallet();
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
            bluechip_CONFIG.poolAddress,
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
            window.bluechipAddress, bluechip_CONFIG.poolAddress, msg,
            { amount: [], gas: "500000" }, "Remove Liquidity"
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
        var connected = await connectKeplrWallet();
        if (!connected) return;
    }

    var positionId = document.getElementById("fees-position-id").value.trim();
    if (!positionId) {
        statusEl.innerHTML = '<div style="color:red;">Please enter your position ID.</div>';
        return;
    }

    try {
        var positionInfo = await window.bluechipClient.queryContractSmart(
            bluechip_CONFIG.poolAddress,
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
            'Unclaimed: ' + unclaimed0 + ' bluechip + ' + unclaimed1 + ' Creator Tokens</div>';

        var msg = { collect_fees: { position_id: positionId } };

        var result = await window.bluechipClient.execute(
            window.bluechipAddress, bluechip_CONFIG.poolAddress, msg,
            { amount: [], gas: "400000" }, "Collect Fees"
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

const createPoolCode = `<script>
// =====================================================================
// Pool creation — two distinct factory entry points.
//
// Commit (creator) pool: factory \`create\` message. Mints a new CW20
//   creator token via the factory; pool starts in funding (commit)
//   phase and flips to active trading once the USD threshold is crossed.
//   The factory's own stored config is the source of truth for the
//   commit threshold, fee splits, threshold-payout amounts, and lock
//   caps — \`pool_msg\` only carries the token pair.
//
// Standard pool: factory \`create_standard_pool\` message. Wraps two
//   pre-existing assets (one of which must be the canonical bluechip
//   denom) into a plain xyk pool. No commit phase, no distribution.
//
// Both paths charge a USD-denominated creation fee paid in the
// canonical bluechip denom; surplus is refunded to the caller in the
// same tx. Attach the funds via the 7th argument to \`execute\`.
// =====================================================================

async function handleCreatePool() {
    var statusEl = document.getElementById("create-pool-status");
    var txEl     = document.getElementById("create-pool-tx");
    statusEl.textContent = "";
    txEl.innerHTML       = "";

    if (!window.bluechipClient || !window.bluechipAddress) {
        var connected = await connectKeplrWallet();
        if (!connected) return;
    }

    var isStandard = document.getElementById("pool-standard").checked;
    // Caller-attached creation fee in ubluechip (the canonical bluechip
    // denom). The factory verifies the attached funds cover the
    // USD-denominated fee converted via the oracle and refunds any
    // surplus on-chain. Leave blank to attach nothing (only works when
    // the factory has the fee disabled).
    var creationFeeMicro =
        (document.getElementById("pool-creation-fee").value || "").trim();
    var funds = (creationFeeMicro && creationFeeMicro !== "0")
        ? [{ denom: bluechip_CONFIG.nativeDenom, amount: creationFeeMicro }]
        : [];

    statusEl.innerHTML = '<div style="color:#1565c0;">Creating your pool...</div>';

    try {
        var msg;
        var memo;

        if (!isStandard) {
            // --- Commit (creator) pool ---
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

            msg = {
                create: {
                    pool_msg: {
                        // pool_token_info is the only field the factory
                        // consumes here — bluechip at index 0, the
                        // creator-token sentinel at index 1. Order matters.
                        pool_token_info: [
                            { bluechip: { denom: bluechip_CONFIG.nativeDenom } },
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
            memo = "Create Commit Pool";
        } else {
            // --- Standard (xyk) pool ---
            var asset0 = document.getElementById("pool-asset0").value.trim();
            var asset1 = document.getElementById("pool-asset1").value.trim();
            var label  = document.getElementById("pool-label").value.trim();
            if (!asset0 || !asset1 || !label) {
                statusEl.innerHTML = '<div style="color:red;">Enter both assets and a label for the standard pool.</div>';
                return;
            }
            // Heuristic: contract addresses are bech32 (bluechip1.../cosmos1...)
            // and longer than typical native denoms. Anything else is treated
            // as a native bank denom (ubluechip, an ibc/... wrapped asset, etc.).
            function buildEntry(s) {
                var looksLikeAddress = s.length > 20 && (s.indexOf("bluechip") === 0 || s.indexOf("cosmos") === 0);
                return looksLikeAddress
                    ? { creator_token: { contract_addr: s } }
                    : { bluechip:      { denom:         s } };
            }
            var entry0 = buildEntry(asset0);
            var entry1 = buildEntry(asset1);

            // Factory enforces that one leg equal the canonical bluechip
            // denom — surface this client-side for a faster error.
            var hasCanonical =
                (entry0.bluechip && entry0.bluechip.denom === bluechip_CONFIG.nativeDenom) ||
                (entry1.bluechip && entry1.bluechip.denom === bluechip_CONFIG.nativeDenom);
            if (!hasCanonical) {
                statusEl.innerHTML =
                    '<div style="color:red;">One asset must be the canonical bluechip denom (' +
                    bluechip_CONFIG.nativeDenom + ').</div>';
                return;
            }

            msg = {
                create_standard_pool: {
                    pool_token_info: [entry0, entry1],
                    label: label
                }
            };
            memo = "Create Standard Pool";
        }

        var result = await window.bluechipClient.execute(
            window.bluechipAddress,
            bluechip_CONFIG.factoryAddress,
            msg,
            { amount: [], gas: "2000000" },
            memo,
            funds
        );

        statusEl.innerHTML =
            '<div style="color:#2e7d32;font-weight:bold;">Pool created!</div>';
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
    var client = await CosmWasmClient.CosmWasmClient.connect(bluechip_CONFIG.rpc);

    var status = await client.queryContractSmart(poolAddress, {
        is_fully_commited: {}
    });

    if (status === "fully_committed") {
        console.log("Pool is active! Trading is enabled.");
        return true;
    } else {
        var raised = parseInt(status.in_progress.raised) / 1000000;
        var target = parseInt(status.in_progress.target) / 1000000;
        console.log("Pool funding: $" + raised.toFixed(2) + " / $" + target.toFixed(2));
        return false;
    }
}`;

const queryPoolStateCode = `async function getPoolState(poolAddress) {
    var client = await CosmWasmClient.CosmWasmClient.connect(bluechip_CONFIG.rpc);

    var state = await client.queryContractSmart(poolAddress, { pool_state: {} });

    console.log("Reserve 0 (Bluechip):", parseInt(state.reserve0) / 1000000);
    console.log("Reserve 1 (Creator):",  parseInt(state.reserve1) / 1000000);
    console.log("Total Liquidity:",      parseInt(state.total_liquidity) / 1000000);

    return state;
}`;

const querySubscriptionCode = `async function getSubscriptionInfo(poolAddress, walletAddress) {
    var client = await CosmWasmClient.CosmWasmClient.connect(bluechip_CONFIG.rpc);

    // NOTE: the query key is committing_info (double "t", double "m") —
    // it mirrors the contract's CommittingInfo variant exactly.
    var info = await client.queryContractSmart(poolAddress, {
        committing_info: { wallet: walletAddress }
    });

    if (info) {
        console.log("Total paid (USD):", parseInt(info.total_paid_usd) / 1000000);
        console.log("Total paid (bluechip):", parseInt(info.total_paid_bluechip) / 1000000);
    } else {
        console.log("User has not subscribed yet.");
    }

    return info;
}`;

const queryPositionsCode = `async function getMyPositions(poolAddress, walletAddress) {
    var client = await CosmWasmClient.CosmWasmClient.connect(bluechip_CONFIG.rpc);

    var result = await client.queryContractSmart(poolAddress, {
        positions_by_owner: { owner: walletAddress }
    });

    result.positions.forEach(function(pos) {
        console.log("Position ID:", pos.position_id);
        console.log("  Liquidity:", parseInt(pos.liquidity) / 1000000);
        console.log("  Unclaimed Fees 0:", parseInt(pos.unclaimed_fees_0) / 1000000);
        console.log("  Unclaimed Fees 1:", parseInt(pos.unclaimed_fees_1) / 1000000);
    });

    return result.positions;
}`;

const queryTokenAddressCode = `async function getCreatorTokenAddress(poolAddress) {
    var client = await CosmWasmClient.CosmWasmClient.connect(bluechip_CONFIG.rpc);

    var pairInfo = await client.queryContractSmart(poolAddress, { pair: {} });

    // \`asset_infos\` is the field on the PoolDetails response;
    // \`pool_token_info\` (the factory-side input field) is read second
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

// Tier thresholds in micro-USD (6 decimals): $5,000 / $500.
var TIER_GOLD_MICRO_USD   = 5000000000;
var TIER_SILVER_MICRO_USD = 500000000;

// How recent the last commit must be to count as an "active"
// subscriber. The chain never expires commit records — recency
// is purely your site's policy.
var ACTIVE_WINDOW_DAYS = 30;

async function getSupporterStatus(walletAddress) {
    var client = await CosmWasmClient.CosmWasmClient.connect(bluechip_CONFIG.rpc);

    // committing_info returns null if this wallet has never committed,
    // otherwise the wallet's cumulative commit record for this pool.
    var info = await client.queryContractSmart(bluechip_CONFIG.poolAddress, {
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
        var ok = await connectKeplrWallet();
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
    await window.keplr.enable(bluechip_CONFIG.chainId);

    // 1. Ask your server for a one-time nonce (prevents replay).
    var nonceRes = await fetch("/api/auth/nonce", { method: "POST" });
    var nonce    = (await nonceRes.json()).nonce;

    var signer   = window.getOfflineSigner(bluechip_CONFIG.chainId);
    var accounts = await signer.getAccounts();
    var address  = accounts[0].address;

    // 2. Sign the nonce. signArbitrary = ADR-36: costs no gas and
    //    cannot be replayed as a real transaction.
    var message   = "bluechip-login:" + nonce;
    var signature = await window.keplr.signArbitrary(
        bluechip_CONFIG.chainId, address, message
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
//  chain's REST (LCD) endpoint and grant privileges by tier.
//
//  npm install @keplr-wallet/cosmos
// ============================================================
const { verifyADR36Amino } = require("@keplr-wallet/cosmos");

const REST_ENDPOINT = "https://bluechip.api.bluechip.link";
const POOL_ADDRESS  = "bluechip1your_pool_address_here";
const BECH32_PREFIX = "bluechip";

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

    // 1. Check the nonce inside \`message\` is one you issued and unused,
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
    const role = totalUsd >= 5000 ? "gold"
               : totalUsd >= 500  ? "silver"
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
//  Subscribe over the RPC websocket and grant perks instantly
//  (unlock a chat, ping Discord, send a thank-you email...).
// ============================================================
var RPC_WS = bluechip_CONFIG.rpc.replace(/^http/, "ws") + "/websocket";

function watchCommits(onCommit) {
    var ws = new WebSocket(RPC_WS);

    ws.onopen = function () {
        ws.send(JSON.stringify({
            jsonrpc: "2.0",
            method:  "subscribe",
            id:      1,
            params:  {
                query: "tm.event='Tx' AND wasm.action='commit'" +
                       " AND wasm._contract_address='" + bluechip_CONFIG.poolAddress + "'"
            }
        }));
    };

    ws.onmessage = function (msgEvent) {
        var msg = JSON.parse(msgEvent.data);
        // Tendermint flattens attributes into result.events:
        // { "wasm.committer": ["bluechip1..."], "wasm.commit_amount_usd": ["1000000"], ... }
        var events = msg.result && msg.result.events;
        if (!events || !events["wasm.committer"]) return;

        onCommit({
            committer: events["wasm.committer"][0],
            phase:     (events["wasm.phase"] || [])[0],
            amountUsd: parseInt((events["wasm.commit_amount_usd"] || ["0"])[0]) / 1000000,
            txHash:    (events["tx.hash"] || [])[0]
        });
    };

    // Reconnect on drop — RPC nodes recycle websocket connections.
    ws.onclose = function () { setTimeout(function () { watchCommits(onCommit); }, 5000); };
    return ws;
}

// Example: grant a perk the moment someone commits.
watchCommits(function (commit) {
    console.log(commit.committer + " committed $" + commit.amountUsd + " (" + commit.phase + ")");
    // -> POST to your backend, flip a UI flag, fire a Discord webhook, etc.
});

// No websocket? Poll the LCD for recent commit txs instead:
//   GET /cosmos/tx/v1beta1/txs?query=wasm.action='commit'
//        AND wasm._contract_address='<POOL>'&order_by=ORDER_BY_DESC&limit=20`;

const fullExampleCode = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BlueChip - My Creator Page</title>
    <!-- CosmJS has no prebuilt browser bundle; load it as an ES module
         and expose the global the handlers below use. -->
    <script type="module">
        import * as cosmwasm from "https://esm.sh/@cosmjs/cosmwasm-stargate@0.32.4";
        window.CosmWasmClient = cosmwasm;
        window.dispatchEvent(new Event("cosmjs-ready"));
    <\/script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: #fafafa;
        }
        h1 { text-align: center; color: #333; }
        .card {
            background: white;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .card h3 { margin-top: 0; }
        input, select {
            width: 100%;
            padding: 10px;
            margin-bottom: 10px;
            border: 1px solid #ddd;
            border-radius: 6px;
            box-sizing: border-box;
            font-size: 14px;
        }
        .btn {
            width: 100%;
            padding: 12px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: bold;
            color: white;
            cursor: pointer;
        }
        .btn-green  { background: #4CAF50; }
        .btn-blue   { background: #1976d2; }
        .btn-red    { background: #d32f2f; }
        .btn-teal   { background: #00897b; }
        .btn:hover  { opacity: 0.9; }
    </style>
</head>
<body>
    <h1>My Creator Page</h1>

    <!-- Wallet Connection -->
    <div class="card">
        <h3>Wallet</h3>
        <button class="btn btn-green" onclick="connectKeplrWallet()">
            Connect Keplr Wallet
        </button>
        <div id="bluechip-wallet-status" style="margin-top:8px;"></div>
        <div id="bluechip-balance" style="margin-top:4px;font-weight:bold;"></div>
    </div>

    <!-- Subscribe -->
    <div class="card">
        <h3>Subscribe</h3>
        <input id="subscribe-amount" type="number" placeholder="Amount (bluechip)" />
        <input id="subscribe-spread" type="text" value="0.005" placeholder="Max spread" />
        <button class="btn btn-green" onclick="handleSubscribe()">Subscribe</button>
        <div id="subscribe-status"></div>
        <div id="subscribe-tx"></div>
    </div>

    <!-- Buy -->
    <div class="card">
        <h3>Buy Creator Tokens</h3>
        <input id="buy-amount" type="number" placeholder="Amount (bluechip)" />
        <input id="buy-spread" type="text" value="0.005" placeholder="Max spread" />
        <button class="btn btn-blue" onclick="handleBuy()">Buy</button>
        <div id="buy-status"></div>
        <div id="buy-tx"></div>
    </div>

    <!-- Sell -->
    <div class="card">
        <h3>Sell Creator Tokens</h3>
        <input id="sell-token-address" type="text" placeholder="Creator token address" />
        <input id="sell-amount" type="number" placeholder="Amount" />
        <input id="sell-spread" type="text" value="0.005" placeholder="Max spread" />
        <button class="btn btn-red" onclick="handleSell()">Sell</button>
        <div id="sell-status"></div>
        <div id="sell-tx"></div>
    </div>

    <!-- Collect Fees -->
    <div class="card">
        <h3>Collect Fees</h3>
        <input id="fees-position-id" type="text" placeholder="Position ID" />
        <button class="btn btn-teal" onclick="handleCollectFees()">Collect Fees</button>
        <div id="fees-status"></div>
        <div id="fees-tx"></div>
    </div>

    <!--
        IMPORTANT: Paste the bluechip_CONFIG block, wallet connection script,
        and all handler functions from this guide here.
    -->
</body>
</html>`;


const tocItems = [
    { num: '1', title: 'Prerequisites — What You Need First', id: 'prerequisites' },
    { num: '2', title: 'Quick Start — Add the Script Tags', id: 'quick-start' },
    { num: '3', title: 'Connecting to Keplr Wallet', id: 'keplr-wallet' },
    { num: '4', title: 'Subscribe Button (Commit)', id: 'subscribe' },
    { num: '5', title: 'Buy Button (Swap Bluechips for Creator Tokens)', id: 'buy' },
    { num: '6', title: 'Sell Button (Swap Creator Tokens for Bluechips)', id: 'sell' },
    { num: '7', title: 'Cross-Token Swaps (Router)', id: 'cross-token' },
    { num: '8', title: 'Add Liquidity', id: 'add-liquidity' },
    { num: '9', title: 'Remove Liquidity', id: 'remove-liquidity' },
    { num: '10', title: 'Collect Fees', id: 'collect-fees' },
    { num: '11', title: 'Create a Pool', id: 'create-pool' },
    { num: '12', title: 'Querying Pool Info (Read-Only)', id: 'query-pool' },
    { num: '13', title: 'Granting Special Privileges to Committed Users', id: 'special-privileges' },
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
                            </CardContent>
                        </Card>

                        {/* Table of Contents */}
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                                    Table of Contents
                                </Typography>
                                <Box component="ol" sx={{ pl: 3 }}>
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
                                                {item.title}
                                            </Typography>
                                        </li>
                                    ))}
                                </Box>
                            </CardContent>
                        </Card>

                        {/* Section 1: Prerequisites */}
                        <SectionCard id="prerequisites" number="1" title="Prerequisites — What You Need First">
                            <Typography variant="h6" gutterBottom>
                                For Your Visitors (People Using Your Website)
                            </Typography>
                            <Typography paragraph>
                                Your visitors will need the <strong>Keplr Wallet</strong> browser extension
                                to interact with BlueChip buttons on your site.
                            </Typography>
                            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
                                Install Keplr:
                            </Typography>
                            <Box component="ul" sx={{ mb: 2 }}>
                                <li><Typography><strong>Chrome / Brave / Edge:</strong> Install from Chrome Web Store</Typography></li>
                                <li><Typography><strong>Firefox:</strong> Install from Firefox Add-ons</Typography></li>
                                <li><Typography><strong>Mobile:</strong> Keplr Mobile App (iOS / Android)</Typography></li>
                            </Box>
                            <Alert severity="info" sx={{ mb: 2 }}>
                                If a visitor does not have Keplr installed, the code below will show them
                                a friendly message with a link to install it.
                            </Alert>

                            <Typography variant="h6" gutterBottom>
                                For You (The Website Owner)
                            </Typography>
                            <Box component="ol">
                                <li><Typography>A website where you can add HTML and JavaScript (WordPress, Squarespace with code injection, a custom site, etc.)</Typography></li>
                                <li><Typography>Your <strong>Pool Contract Address</strong> — the address of the creator pool on the BlueChip chain (looks like <code>bluechip1abc...xyz</code>)</Typography></li>
                                <li><Typography>Your <strong>Factory Contract Address</strong> — only needed if you want to create new pools</Typography></li>
                            </Box>
                        </SectionCard>

                        {/* Section 2: Quick Start */}
                        <SectionCard id="quick-start" number="2" title="Quick Start — Add the Script Tags">
                            <Typography variant="h6" gutterBottom>Fastest path: the BlueChip widget (recommended)</Typography>
                            <Typography paragraph>
                                For a Subscribe button and/or subscriber-gated content, use the prebuilt widget —
                                one self-contained script tag, and the only thing you edit is your pool address.
                                See the <code>widget/</code> directory of this repo for all options.
                            </Typography>
                            <CodeBlock code={widgetQuickStartCode} language="HTML" />

                            <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>Manual path: load CosmJS yourself</Typography>
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                CosmJS publishes no ready-made browser bundle — a plain{' '}
                                <code>&lt;script src=&quot;unpkg.com/.../build/bundle.js&quot;&gt;</code> tag 404s. Sites with a
                                bundler should <code>npm install @cosmjs/cosmwasm-stargate</code>; plain HTML sites can load
                                it as an ES module from a CJS-to-ESM CDN:
                            </Alert>
                            <CodeBlock code={scriptTagsCode} language="HTML" />

                            <Typography paragraph sx={{ mt: 2 }}>
                                Then add this configuration block. <strong>Replace the placeholder values</strong> with
                                your actual addresses:
                            </Typography>
                            <CodeBlock code={configCode} language="HTML" />
                        </SectionCard>

                        {/* Section 3: Keplr Wallet */}
                        <SectionCard id="keplr-wallet" number="3" title="Connecting to Keplr Wallet">
                            <Typography paragraph>
                                Every BlueChip interaction starts by connecting the user's Keplr wallet.
                                Add this script <strong>once</strong> on any page where you have BlueChip buttons:
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
                                The <strong>Subscribe</strong> button lets your fans commit Bluechip tokens to your creator pool.
                                This is how people support you. Before the pool reaches $25,000 USD, commits are recorded
                                in a ledger. After the threshold is crossed, commits are swapped through the AMM and
                                your supporter receives your creator tokens.
                            </Typography>
                            <Alert severity="info" sx={{ mb: 2 }}>
                                A 6% fee is deducted: 1% goes to the BlueChip protocol, 5% goes to you the creator.
                            </Alert>
                            <CodeBlock code={subscribeCode} language="JavaScript" />
                        </SectionCard>

                        {/* Section 5: Buy */}
                        <SectionCard id="buy" number="5" title="Buy Button (Swap Bluechips for Creator Tokens)">
                            <Typography paragraph>
                                The <strong>Buy</strong> button lets people swap their Bluechip tokens for your
                                creator tokens. This only works <strong>after</strong> the pool has crossed the
                                $25,000 threshold and has active liquidity.
                            </Typography>
                            <CodeBlock code={buyCode} language="JavaScript" />
                        </SectionCard>

                        {/* Section 6: Sell */}
                        <SectionCard id="sell" number="6" title="Sell Button (Swap Creator Tokens for Bluechips)">
                            <Typography paragraph>
                                The <strong>Sell</strong> button lets people swap their creator tokens back into
                                Bluechip tokens. This uses the CW20 <code>send</code> mechanism — the tokens are
                                sent to the pool contract with an embedded swap instruction.
                            </Typography>
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                Selling creator tokens requires the CW20 token contract address, which is different
                                from the pool address. You can find this by querying the pool's <code>pair</code> endpoint
                                (see Section 12).
                            </Alert>
                            <CodeBlock code={sellCode} language="JavaScript" />
                        </SectionCard>

                        {/* Section 7: Cross-Token Swaps */}
                        <SectionCard id="cross-token" number="7" title="Cross-Token Swaps (Router)">
                            <Typography paragraph>
                                Creator tokens never share a pool with each other — every pair trades
                                through bluechip. To let a fan swap <em>another creator's token</em>{' '}
                                directly into yours, use the <strong>router contract</strong>: it executes
                                the whole route (up to 3 hops) in a single atomic transaction and validates
                                every hop's pool against the factory registry before moving funds.
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
                                Get the router address from the BlueChip team alongside the factory
                                address. Both pools in the route must be past their threshold (active AMMs).
                            </Typography>
                        </SectionCard>

                        {/* Section 8: Add Liquidity */}
                        <SectionCard id="add-liquidity" number="8" title="Add Liquidity">
                            <Typography paragraph>
                                Liquidity providers earn trading fees. When you add liquidity, you receive an NFT that
                                represents your position. You must provide <strong>both</strong> Bluechip tokens and
                                creator tokens in the correct ratio.
                            </Typography>
                            <Alert severity="info" sx={{ mb: 2 }}>
                                Adding liquidity only works <strong>after</strong> the pool threshold has been
                                crossed ($25,000 USD in commits). There are two steps: approve the pool to spend
                                your creator tokens (CW20 allowance), then deposit both tokens into the pool.
                            </Alert>
                            <CodeBlock code={addLiquidityCode} language="JavaScript" />
                        </SectionCard>

                        {/* Section 9: Remove Liquidity */}
                        <SectionCard id="remove-liquidity" number="9" title="Remove Liquidity">
                            <Typography paragraph>
                                You can remove liquidity three ways:
                            </Typography>
                            <Box component="ul" sx={{ mb: 2 }}>
                                <li><Typography><strong>By Amount</strong> — Remove a specific amount of liquidity units</Typography></li>
                                <li><Typography><strong>By Percentage</strong> — Remove a percentage (e.g., 50%) of your position</Typography></li>
                                <li><Typography><strong>Remove All</strong> — Withdraw everything</Typography></li>
                            </Box>
                            <Typography paragraph>
                                You will need your <strong>Position ID</strong> (the NFT token ID you received when adding liquidity).
                            </Typography>
                            <CodeBlock code={removeLiquidityCode} language="JavaScript" />
                        </SectionCard>

                        {/* Section 10: Collect Fees */}
                        <SectionCard id="collect-fees" number="10" title="Collect Fees">
                            <Typography paragraph>
                                If you have a liquidity position (NFT), you can collect your accumulated trading
                                fees <strong>without</strong> removing your liquidity. Fees are paid out in both
                                Bluechip and creator tokens.
                            </Typography>
                            <CodeBlock code={collectFeesCode} language="JavaScript" />
                        </SectionCard>

                        {/* Section 11: Create a Pool */}
                        <SectionCard id="create-pool" number="11" title="Create a Pool">
                            <Typography paragraph>
                                Anyone can create a new pool through the factory. Two flavors are supported:
                            </Typography>
                            <Box component="ul" sx={{ mb: 2 }}>
                                <li>
                                    <Typography>
                                        <strong>Commit (creator) pool</strong> — the factory mints a fresh CW20
                                        creator token and the pool starts in a funding (commit) phase. Once the
                                        configured USD threshold is crossed, 1,200,000 creator tokens are minted
                                        and distributed (500k to subscribers, 325k to the creator, 25k to BlueChip,
                                        350k seeded as initial liquidity).
                                    </Typography>
                                </li>
                                <li>
                                    <Typography>
                                        <strong>Standard pool</strong> — wraps two pre-existing assets in a plain
                                        xyk pool. No commit phase, no distribution. One leg of the pair must be the
                                        canonical bluechip denom.
                                    </Typography>
                                </li>
                            </Box>
                            <Alert severity="info" sx={{ mb: 2 }}>
                                Both creation paths charge a <strong>USD-denominated creation fee paid in canonical
                                bluechip</strong>. Attach the funds to the call; the factory verifies, forwards the
                                fee to the bluechip wallet, and refunds any surplus on-chain.
                            </Alert>
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                For commit pools, the wallet that creates the pool becomes the creator wallet.
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
                                    <Typography sx={{ fontWeight: 'bold' }}>Get Pool Reserves and Liquidity</Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <CodeBlock code={queryPoolStateCode} language="JavaScript" />
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

                        {/* Section 13: Special Privileges */}
                        <SectionCard id="special-privileges" number="13" title="Granting Special Privileges to Committed Users">
                            <Typography paragraph>
                                Every commit writes a permanent, public record to your pool's ledger:
                                who committed, how much (in USD and bluechip), and when. After the
                                threshold, supporters also receive your creator tokens. Your website
                                can read either of these to give supporters <strong>special privileges</strong> —
                                subscriber-only pages, download links, badges, Discord roles, early access,
                                anything you can gate.
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
                                your server verifies the signature, then queries the pool over the chain's
                                REST endpoint and grants a role based on the on-chain record.
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
                                (<code>total_paid_usd</code> of 5000000000 = $5,000);&nbsp;
                                <code>last_committed</code> is in nanoseconds; commit records never expire
                                on-chain, so "active subscriber" windows (e.g. committed within 30 days) are
                                your site's policy, enforced from <code>last_committed</code>. For
                                token-balance-based perks instead, query the creator token's CW20&nbsp;
                                <code>balance</code> endpoint the same way.
                            </Alert>
                        </SectionCard>

                        {/* Section 14: Full Working Example */}
                        <SectionCard id="full-example" number="14" title="Full Working Example Page">
                            <Typography paragraph>
                                Here's a complete, self-contained HTML page you can save and use. It includes
                                wallet connection, subscribe, buy, sell, and fee collection all on one page.
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
                                            ['"Please install Keplr extension"', 'Install Keplr from keplr.app/get and refresh the page'],
                                            ['"Failed to connect"', 'Make sure you\'ve approved the BlueChip chain in Keplr. Try disconnecting and reconnecting'],
                                            ['"out of gas"', 'Increase the gas limit in the execute() call (e.g., change "500000" to "800000")'],
                                            ['"insufficient funds"', 'You need more bluechip tokens. Check your balance in Keplr'],
                                            ['"Invalid creation funds: ... Send exactly one denom"', 'Create-pool requires exactly one coin entry of the canonical bluechip denom. Remove any IBC / tokenfactory / stray denoms from the funds array'],
                                            ['"Insufficient creation fee"', "The attached bluechip amount is below the oracle-derived USD fee. Re-query the required amount (it changes with bluechip's USD price) and re-attach"],
                                            ['"creation fee is disabled; do not attach any funds"', 'The factory currently has the creation fee set to zero. Pass an empty funds array on these calls'],
                                            ['"rate limited"', 'Commits have a 13-second cooldown per wallet. Wait and try again'],
                                            ['"Route exceeds the maximum of 3 hops"', 'The router caps routes at 3 hops. Any creator-token pair needs at most 2 (token → bluechip → token)'],
                                            ['"not registered with the factory" (router)', "A hop's pool address is not in the factory registry. Use pool addresses from the factory's pools query or this explorer"],
                                            ['Router swap reverts with a minimum_receive error', 'Price moved past your tolerance between simulation and execution. Re-quote and retry, or widen slippage slightly'],
                                            ['"Commit too small"', 'Each pool enforces a minimum commit value in USD (separate pre- and post-threshold floors). Increase the amount'],
                                            ['"Pool is not fully committed"', 'Buy/Sell only work after the pool crosses the $25,000 threshold. Use Subscribe instead'],
                                            ['"You do not own this position"', 'Double-check your Position ID. Query positions_by_owner to find your positions'],
                                            ['Transaction stuck / pending', 'The transaction may still be processing. Check the tx hash on your block explorer'],
                                            ['Keplr not detecting on mobile', 'Use the Keplr mobile app\'s built-in browser to visit your site'],
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
                            <Typography paragraph>
                                These are the addresses you need. Get them from the BlueChip team or your block explorer:
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
                                            ['Factory Address', 'Creates new pools', 'Deployment records / block explorer'],
                                            ['Pool Address', 'Your specific creator pool', 'Returned when pool is created (tx hash)'],
                                            ['Creator Token Address', 'The CW20 token for your pool', "Query pool's pair endpoint"],
                                            ['Position NFT Address', 'NFT contract for LP positions', 'Part of pool creation response'],
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
                                code={`var pairInfo = await client.queryContractSmart("YOUR_POOL_ADDRESS", { pair: {} });
// Look for the creator_token entry in pairInfo.asset_infos
// (pool_token_info is the factory-side input field, not this response)`}
                                language="JavaScript"
                            />
                            <Typography variant="body2" color="text.secondary">
                                Or check the pool creation transaction on your block explorer — the token contract
                                address appears in the instantiation events.
                            </Typography>
                        </SectionCard>
                    </Stack>
                </Grid>
        </PageShell>
    );
};

export default IntegrationGuidePage;
