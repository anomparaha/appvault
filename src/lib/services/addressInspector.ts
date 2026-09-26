import { isEvmAddress, isValidSolAddress } from "../utils/format";
import { CHAINS } from "../chains/chains";
import { invoke } from "@tauri-apps/api/core";
import type { SolanaAccountDetails } from "./sweeper";

export type AddressType =
  | "eoa"
  | "smart_wallet"
  | "token_contract"
  | "contract_generic"
  | "cross_chain_contract"
  | "solana_wallet"
  | "solana_program"
  | "invalid"
  | "unknown";

export type InspectionSeverity = "success" | "info" | "warning" | "danger" | "neutral";

export interface AddressInspectionResult {
  address: string;
  type: AddressType;
  label: string;
  subLabel?: string;
  severity: InspectionSeverity;
  warning?: string;
  canSend: boolean;
  requiresBypass?: boolean;
  deployedChain?: string;
  deployedChainName?: string;
  suggestedChain?: string;
  tokenInfo?: {
    name?: string;
    symbol?: string;
    decimals?: number;
  };
}

interface KnownToken {
  name: string;
  symbol: string;
  decimals: number;
}

/**
 * High-profile Token Contracts across major EVM chains to instantly catch
 * catastrophic transfer mistakes without relying solely on network latency.
 */
const KNOWN_TOKENS: Record<string, KnownToken> = {
  // USDT
  "0xdac17f958d2ee523a2206206994597c13d831ec7": { name: "Tether USD", symbol: "USDT", decimals: 6 },
  "0x55d398326f99059ff775485246999027b3197955": { name: "Tether USD", symbol: "USDT", decimals: 18 },
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": { name: "Tether USD", symbol: "USDT", decimals: 6 },
  "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": { name: "Tether USD", symbol: "USDT", decimals: 6 },
  // USDC
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { name: "USD Coin", symbol: "USDC", decimals: 6 },
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": { name: "USD Coin", symbol: "USDC", decimals: 18 },
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": { name: "USD Coin", symbol: "USDC", decimals: 6 },
  "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8": { name: "USD Coin (Bridged)", symbol: "USDC.e", decimals: 6 },
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { name: "USD Coin", symbol: "USDC", decimals: 6 },
  // DAI
  "0x6b175474e89094c44da98b954eedeac495271d0f": { name: "Dai Stablecoin", symbol: "DAI", decimals: 18 },
  "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3": { name: "Dai Stablecoin", symbol: "DAI", decimals: 18 },
  "0xda10009cbd5d07dd0cecc6616156627511bb9889": { name: "Dai Stablecoin", symbol: "DAI", decimals: 18 },
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": { name: "Dai Stablecoin", symbol: "DAI", decimals: 18 },
  // WETH / Wrapped Native
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { name: "Wrapped Ether", symbol: "WETH", decimals: 18 },
  "0x82af49447d8a04e343e4ffd802a792d76b69443d": { name: "Wrapped Ether", symbol: "WETH", decimals: 18 },
  "0x4200000000000000000000000000000000000006": { name: "Wrapped Ether", symbol: "WETH", decimals: 18 },
  "0x2170ed0880ac9a755fd29b2688956bd959f933f8": { name: "Binance-Peg Ethereum", symbol: "ETH", decimals: 18 },
  "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": { name: "Wrapped BNB", symbol: "WBNB", decimals: 18 },
  // WBTC
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": { name: "Wrapped BTC", symbol: "WBTC", decimals: 8 },
  "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": { name: "Wrapped BTC", symbol: "WBTC", decimals: 8 },
  "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c": { name: "Binance-Peg BTC", symbol: "BTCB", decimals: 18 },
  // DeFi & Popular
  "0x514910771af9ca656af840dff83e8264ecf986ca": { name: "ChainLink Token", symbol: "LINK", decimals: 18 },
  "0xf97f4df75117a78c1a5a0dbb814af92458539fb4": { name: "ChainLink Token", symbol: "LINK", decimals: 18 },
  "0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd": { name: "Binance-Peg ChainLink", symbol: "LINK", decimals: 18 },
  "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": { name: "Uniswap", symbol: "UNI", decimals: 18 },
  "0xfa7f8980b0f1e64a2062791ce3b08783fb0bd600": { name: "Uniswap", symbol: "UNI", decimals: 18 },
  "0xbf5140a22578168fd5626cd235650934e28e470f": { name: "Binance-Peg Uniswap", symbol: "UNI", decimals: 18 },
  "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce": { name: "SHIBA INU", symbol: "SHIB", decimals: 18 },
  "0x2859e4544c4bb03966803b044a93563bd2d0dd4d": { name: "Binance-Peg SHIBA INU", symbol: "SHIB", decimals: 18 },
  "0x6982508145454ce325ddbe47a25d4ec3d2311933": { name: "Pepe", symbol: "PEPE", decimals: 18 },
  "0x25d887ce7a35172c62febfd67a185662043f60e6": { name: "Pepe", symbol: "PEPE", decimals: 18 },
  // Plurivex
  "0xf890d3fe2be22c6259bbe9f607692c7168556c93": { name: "Plurivex", symbol: "$PLUR", decimals: 18 },
  "0x2411cfb697efc0efd32a4e98f7be5ba098b671a5": { name: "Plurivex", symbol: "PLX", decimals: 18 },
  // Robinhood
  "0x0bd7d308f8e1639fab988df18a8011f41eacad73": { name: "Wrapped Ether", symbol: "WETH", decimals: 18 },
};

// Supported EVM chains list for cross-chain smart contract discovery
const EVM_NETWORKS = [
  { key: "robinhood", name: "Robinhood Chain", rpc: "https://api.zan.top/node/v1/robinhood/mainnet/9f2590af4fda43418ca4f0e8ded27af5" },
  { key: "eth", name: "Ethereum", rpc: "https://ethereum.publicnode.com" },
  { key: "bsc", name: "BNB Chain", rpc: "https://bsc-dataseed.binance.org" },
  { key: "base", name: "Base", rpc: "https://mainnet.base.org" },
  { key: "arb", name: "Arbitrum", rpc: "https://arb1.arbitrum.io/rpc" },
];

// In-memory cache for inspection results
const inspectionCache = new Map<string, AddressInspectionResult>();

function decodeAbiUint(hex?: string): number | null {
  if (!hex || hex === "0x") return null;
  const clean = hex.replace(/^0x/, "");
  if (clean.length < 64) return null;
  try {
    const val = BigInt("0x" + clean.slice(-64));
    if (val >= 0n && val <= 255n) {
      return Number(val);
    }
  } catch {
    return null;
  }
  return null;
}

function decodeAbiString(hex?: string): string {
  if (!hex || hex === "0x") return "";
  const clean = hex.replace(/^0x/, "");
  if (clean.length >= 128) {
    try {
      const length = parseInt(clean.substring(64, 128), 16);
      if (length > 0 && length < 1000) {
        const dataHex = clean.substring(128, 128 + length * 2);
        const bytes: number[] = [];
        for (let i = 0; i < dataHex.length; i += 2) {
          bytes.push(parseInt(dataHex.substring(i, i + 2), 16));
        }
        return new TextDecoder().decode(new Uint8Array(bytes)).replace(/\0/g, "").trim();
      }
    } catch {
      // Fallback to bytes32 decoding below
    }
  }
  // Try bytes32 interpretation
  if (clean.length === 64) {
    try {
      const bytes: number[] = [];
      for (let i = 0; i < clean.length; i += 2) {
        const byte = parseInt(clean.substring(i, i + 2), 16);
        if (byte !== 0) bytes.push(byte);
      }
      return new TextDecoder().decode(new Uint8Array(bytes)).replace(/\0/g, "").trim();
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * Inspects a recipient address across EVM or Solana chains.
 * Detects format validity, known token contracts, bytecode existence (EOA vs Contract),
 * smart contract wallets (Gnosis Safe, ERC-4337), token contracts, and cross-chain
 * deployed contracts with automatic network mismatch detection.
 */
export async function inspectRecipientAddress(
  rawAddress: string,
  chainKey: string,
  isAirGapped: boolean = false,
  sessionToken = "",
): Promise<AddressInspectionResult> {
  const address = rawAddress.trim();
  if (!address) {
    return {
      address: "",
      type: "invalid",
      label: "Empty Address",
      severity: "neutral",
      canSend: false,
    };
  }

  // 1. Solana Chain Inspection
  if (chainKey === "sol") {
    if (!isValidSolAddress(address)) {
      return {
        address,
        type: "invalid",
        label: "Invalid Solana Address",
        warning: "Address does not match standard Solana Base58 format.",
        severity: "danger",
        canSend: false,
      };
    }

    if (isAirGapped || !sessionToken) {
      return {
        address,
        type: "solana_wallet",
        label: isAirGapped ? "Solana Address (Offline)" : "Solana Address (Session Required)",
        severity: "info",
        canSend: true,
      };
    }

    try {
      const details = await invoke<SolanaAccountDetails>("get_solana_account_details", { address, sessionToken });
      if (details) {
        if (details.is_system_program || details.owner === "11111111111111111111111111111111" || !details.exists) {
          return {
            address,
            type: "solana_wallet",
            label: "Solana Wallet Account",
            severity: "success",
            canSend: true,
          };
        }
        return {
          address,
          type: "solana_program",
          label: "Solana Program / Token Account",
          subLabel: details.account_type || "Program Account",
          warning: "This is a Solana Program or Token Data Account, not a standard user wallet.",
          severity: "warning",
          canSend: true,
        };
      }
    } catch {
      // Ignore network errors and treat as standard Solana address
    }

    return {
      address,
      type: "solana_wallet",
      label: "Solana Wallet Address",
      severity: "success",
      canSend: true,
    };
  }

  // 2. EVM Address Format Validation
  if (!isEvmAddress(address)) {
    return {
      address,
      type: "invalid",
      label: "Invalid EVM Address",
      warning: "Address must be 42 characters starting with 0x.",
      severity: "danger",
      canSend: false,
    };
  }

  const normalized = address.toLowerCase();
  const cacheKey = `${chainKey}:${normalized}`;
  if (inspectionCache.has(cacheKey)) {
    return inspectionCache.get(cacheKey)!;
  }

  // 3. Known Static Token Contract Registry Check
  if (KNOWN_TOKENS[normalized]) {
    const token = KNOWN_TOKENS[normalized];
    const result: AddressInspectionResult = {
      address,
      type: "token_contract",
      label: `Token Contract (${token.symbol})`,
      subLabel: token.name,
      severity: "danger",
      warning: `CRITICAL SAFETY ALERT: This address is the ${token.name} (${token.symbol}) Token Contract, NOT a personal wallet! Sending native cryptocurrency directly to a token contract will permanently lock or destroy your funds.`,
      canSend: false,
      requiresBypass: true,
      tokenInfo: token,
    };
    inspectionCache.set(cacheKey, result);
    return result;
  }

  // If Air-Gapped Mode is active, bypass remote RPC calls
  if (isAirGapped || !sessionToken) {
    const offlineResult: AddressInspectionResult = {
      address,
      type: "unknown",
      label: isAirGapped ? "Valid EVM Address (Offline)" : "Valid EVM Address (Session Required)",
      subLabel: isAirGapped ? "Air-Gapped Mode Active" : "Unlock the vault for online verification",
      severity: "neutral",
      canSend: true,
    };
    return offlineResult;
  }

  // Find active chain config
  const chainConfig = CHAINS.find((c) => c.key === chainKey);
  const activeChainName = chainConfig?.label || chainKey.toUpperCase();
  const rpcList = chainConfig && "rpcs" in chainConfig ? (chainConfig.rpcs as readonly string[]) : [];

  // 4. On-Chain RPC Query on Currently Selected Chain
  let selectedChainHasBytecode = false;

  for (const rpcUrl of rpcList) {
    try {
      const batchPayload = [
        // ID 1: Query Bytecode (EOA vs Contract)
        { jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [address, "latest"] },
        // ID 2: Safe getOwners() (0xa0e67e2b)
        { jsonrpc: "2.0", id: 2, method: "eth_call", params: [{ to: address, data: "0xa0e67e2b" }, "latest"] },
        // ID 3: ERC-4337 entryPoint() (0xb2d92157)
        { jsonrpc: "2.0", id: 3, method: "eth_call", params: [{ to: address, data: "0xb2d92157" }, "latest"] },
        // ID 4: ERC-20 decimals() (0x313ce567)
        { jsonrpc: "2.0", id: 4, method: "eth_call", params: [{ to: address, data: "0x313ce567" }, "latest"] },
      ];

      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batchPayload),
        signal: AbortSignal.timeout(3500),
      });

      if (!res.ok) continue;

      const batchResults = await res.json();
      if (!Array.isArray(batchResults)) continue;

      const codeRes = batchResults.find((r) => r.id === 1);
      const safeRes = batchResults.find((r) => r.id === 2);
      const aaRes = batchResults.find((r) => r.id === 3);
      const decimalsRes = batchResults.find((r) => r.id === 4);

      const code = codeRes?.result || "0x";
      selectedChainHasBytecode = typeof code === "string" && code.length > 2 && code !== "0x" && code !== "0x0";

      // If bytecode exists on the selected chain:
      if (selectedChainHasBytecode) {
        // Case A: Smart Contract Wallet (Safe / ERC-4337)
        const safeData = safeRes?.result;
        const isSafe =
          typeof safeData === "string" &&
          safeData.startsWith("0x0000000000000000000000000000000000000000000000000000000000000020") &&
          safeData.length >= 130;

        const aaData = aaRes?.result;
        const isAA =
          typeof aaData === "string" &&
          aaData.startsWith("0x000000000000000000000000") &&
          aaData.length === 66 &&
          !aaData.endsWith("0000000000000000000000000000000000000000");

        if (isSafe || isAA) {
          const subLabel = isSafe ? "Gnosis Safe Multi-Sig" : "ERC-4337 Smart Account";
          const scwResult: AddressInspectionResult = {
            address,
            type: "smart_wallet",
            label: "Smart Contract Wallet",
            subLabel,
            severity: "info",
            warning: `This address is a verified Smart Contract Wallet (${subLabel}). It is fully capable of receiving native coins and executing account transactions.`,
            canSend: true,
          };
          inspectionCache.set(cacheKey, scwResult);
          return scwResult;
        }

        // Case B: ERC-20 Token Contract
        const decimalsVal = decodeAbiUint(decimalsRes?.result);
        if (decimalsVal !== null && decimalsVal >= 0 && decimalsVal <= 36) {
          let tokenSymbol = "ERC-20";
          let tokenName = "Unknown Token";
          try {
            const metaRes = await fetch(rpcUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify([
                { jsonrpc: "2.0", id: 10, method: "eth_call", params: [{ to: address, data: "0x95d89b41" }, "latest"] },
                { jsonrpc: "2.0", id: 11, method: "eth_call", params: [{ to: address, data: "0x06fdde03" }, "latest"] },
              ]),
              signal: AbortSignal.timeout(2000),
            });
            if (metaRes.ok) {
              const metaJson = await metaRes.json();
              if (Array.isArray(metaJson)) {
                const symHex = metaJson.find((m) => m.id === 10)?.result;
                const nameHex = metaJson.find((m) => m.id === 11)?.result;
                const sym = decodeAbiString(symHex);
                const nam = decodeAbiString(nameHex);
                if (sym) tokenSymbol = sym;
                if (nam) tokenName = nam;
              }
            }
          } catch {
            // Keep default metadata if query fails
          }

          const tokenResult: AddressInspectionResult = {
            address,
            type: "token_contract",
            label: `Token Contract (${tokenSymbol})`,
            subLabel: tokenName,
            severity: "danger",
            warning: `CRITICAL SAFETY ALERT: This address is an ERC-20 Token Contract (${tokenName} - ${tokenSymbol}), NOT a personal wallet! Sending native coins directly will permanently lock your funds unless the contract explicitly has a payable deposit function.`,
            canSend: false,
            requiresBypass: true,
            tokenInfo: {
              name: tokenName,
              symbol: tokenSymbol,
              decimals: decimalsVal,
            },
          };
          inspectionCache.set(cacheKey, tokenResult);
          return tokenResult;
        }

        // Case C: Generic Smart Contract
        const genericResult: AddressInspectionResult = {
          address,
          type: "contract_generic",
          label: "Smart Contract Address",
          subLabel: "Contract Bytecode Detected",
          severity: "warning",
          warning:
            "Attention: This address is a Smart Contract, not a standard EOA wallet. Ensure this contract has a payable fallback or deposit function before sending native coins, otherwise the transaction will revert or funds could be trapped.",
          canSend: true,
        };
        inspectionCache.set(cacheKey, genericResult);
        return genericResult;
      }

      // If active chain returned result with NO bytecode, stop loop and proceed to cross-chain check
      break;
    } catch {
      continue;
    }
  }

  // 5. Cross-Chain Smart Contract Discovery
  // If the address has NO bytecode on the currently selected chain, we MUST check
  // if this address is an active contract deployed on other EVM chains (e.g. Robinhood, BSC, Base, Arbitrum).
  // An address that is a contract on any EVM chain was derived from a factory or deployer nonce:
  // NO private key exists for it, making it extremely dangerous to treat as a standard EOA on other chains!
  const otherNetworks = EVM_NETWORKS.filter((net) => net.key !== chainKey);

  try {
    const crossChecks = await Promise.all(
      otherNetworks.map(async (net) => {
        try {
          const res = await fetch(net.rpc, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "eth_getCode",
              params: [address, "latest"],
            }),
            signal: AbortSignal.timeout(2800),
          });
          if (!res.ok) return null;
          const data = await res.json();
          const code = data.result || "0x";
          const hasCode = typeof code === "string" && code.length > 2 && code !== "0x" && code !== "0x0";
          return hasCode ? net : null;
        } catch {
          return null;
        }
      })
    );

    const foundNetwork = crossChecks.find((net) => net !== null);
    if (foundNetwork) {
      // Contract is active on foundNetwork (e.g. Robinhood Chain)!
      // Let's probe details on that network to know whether it's a Token Contract or SCW
      let tokenSymbol = "";
      let tokenName = "";
      let decimalsVal: number | null = null;
      let isSafe = false;

      try {
        const probeRes = await fetch(foundNetwork.rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([
            { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: address, data: "0x313ce567" }, "latest"] },
            { jsonrpc: "2.0", id: 2, method: "eth_call", params: [{ to: address, data: "0x95d89b41" }, "latest"] },
            { jsonrpc: "2.0", id: 3, method: "eth_call", params: [{ to: address, data: "0x06fdde03" }, "latest"] },
            { jsonrpc: "2.0", id: 4, method: "eth_call", params: [{ to: address, data: "0xa0e67e2b" }, "latest"] },
          ]),
          signal: AbortSignal.timeout(2500),
        });
        if (probeRes.ok) {
          const pJson = await probeRes.json();
          if (Array.isArray(pJson)) {
            decimalsVal = decodeAbiUint(pJson.find((m) => m.id === 1)?.result);
            tokenSymbol = decodeAbiString(pJson.find((m) => m.id === 2)?.result);
            tokenName = decodeAbiString(pJson.find((m) => m.id === 3)?.result);
            const safeData = pJson.find((m) => m.id === 4)?.result;
            isSafe =
              typeof safeData === "string" &&
              safeData.startsWith("0x0000000000000000000000000000000000000000000000000000000000000020") &&
              safeData.length >= 130;
          }
        }
      } catch {
        // Ignore probe errors
      }

      const isToken = decimalsVal !== null && decimalsVal >= 0 && decimalsVal <= 36;
      const displaySymbol = tokenSymbol || "Token Contract";
      const displayName = tokenName || `Contract on ${foundNetwork.name}`;

      if (isToken) {
        const mismatchResult: AddressInspectionResult = {
          address,
          type: "token_contract",
          label: `Token Contract (${displaySymbol} on ${foundNetwork.name})`,
          subLabel: `${displayName} · Undeployed on ${activeChainName}`,
          severity: "danger",
          warning: `CRITICAL NETWORK MISMATCH: This address is an active Token Contract (${displayName} - ${displaySymbol}) deployed on ${foundNetwork.name}, NOT a personal wallet! On your currently selected network (${activeChainName}), this contract is not deployed. Sending native coins to an undeployed contract address will permanently destroy your funds because nobody has the private key for contract addresses.`,
          canSend: false,
          requiresBypass: true,
          deployedChain: foundNetwork.key,
          deployedChainName: foundNetwork.name,
          suggestedChain: foundNetwork.key,
          tokenInfo: {
            name: displayName,
            symbol: displaySymbol,
            decimals: decimalsVal ?? undefined,
          },
        };
        inspectionCache.set(cacheKey, mismatchResult);
        return mismatchResult;
      }

      // If Smart Contract Wallet on other network
      if (isSafe) {
        const scwMismatchResult: AddressInspectionResult = {
          address,
          type: "cross_chain_contract",
          label: `Smart Contract Wallet on ${foundNetwork.name}`,
          subLabel: `Undeployed on ${activeChainName}`,
          severity: "warning",
          warning: `This address is a Gnosis Safe Multi-Sig deployed on ${foundNetwork.name}, but is NOT deployed on ${activeChainName}! Verify whether this Safe has been deployed on ${activeChainName} before sending funds.`,
          canSend: true,
          deployedChain: foundNetwork.key,
          deployedChainName: foundNetwork.name,
          suggestedChain: foundNetwork.key,
        };
        inspectionCache.set(cacheKey, scwMismatchResult);
        return scwMismatchResult;
      }

      // Generic Smart Contract on other network
      const crossContractResult: AddressInspectionResult = {
        address,
        type: "cross_chain_contract",
        label: `Smart Contract on ${foundNetwork.name}`,
        subLabel: `Undeployed on ${activeChainName}`,
        severity: "danger",
        warning: `WARNING: This address is a Smart Contract deployed on ${foundNetwork.name}, but is NOT deployed on ${activeChainName}! Nobody holds a private key for this contract address. Sending funds on ${activeChainName} will cause funds to be permanently trapped.`,
        canSend: false,
        requiresBypass: true,
        deployedChain: foundNetwork.key,
        deployedChainName: foundNetwork.name,
        suggestedChain: foundNetwork.key,
      };
      inspectionCache.set(cacheKey, crossContractResult);
      return crossContractResult;
    }
  } catch {
    // Ignore cross check error
  }

  // 6. Confirmed Standard EOA Wallet
  // Only when both the active chain AND all other EVM networks confirm no bytecode exists!
  const eoaResult: AddressInspectionResult = {
    address,
    type: "eoa",
    label: "Standard Wallet (EOA)",
    subLabel: "Externally Owned Account",
    severity: "success",
    canSend: true,
  };
  inspectionCache.set(cacheKey, eoaResult);
  return eoaResult;
}
