#[derive(Clone, Debug)]
pub struct TokenDef {
    pub symbol: &'static str,
    pub name: &'static str,
    pub contract: &'static str,
    pub decimals: u8,
}

pub const ETH_TOKENS: &[TokenDef] = &[
    TokenDef {
        symbol: "USDT",
        name: "Tether USD",
        contract: "0xdac17f958d2ee523a2206206994597c13d831ec7",
        decimals: 6,
    },
    TokenDef {
        symbol: "USDC",
        name: "USD Coin",
        contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        decimals: 6,
    },
    TokenDef {
        symbol: "DAI",
        name: "Dai Stablecoin",
        contract: "0x6b175474e89094c44da98b954eedeac495271d0f",
        decimals: 18,
    },
    TokenDef {
        symbol: "WBTC",
        name: "Wrapped BTC",
        contract: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
        decimals: 8,
    },
    TokenDef {
        symbol: "LINK",
        name: "Chainlink",
        contract: "0x514910771af9ca656af840dff83e8264ecf986ca",
        decimals: 18,
    },
    TokenDef {
        symbol: "UNI",
        name: "Uniswap",
        contract: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
        decimals: 18,
    },
    TokenDef {
        symbol: "SHIB",
        name: "Shiba Inu",
        contract: "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce",
        decimals: 18,
    },
    TokenDef {
        symbol: "PEPE",
        name: "Pepe",
        contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
        decimals: 18,
    },
];

pub const BSC_TOKENS: &[TokenDef] = &[
    TokenDef {
        symbol: "USDT",
        name: "Tether USD (BEP20)",
        contract: "0x55d398326f99059ff775485246999027b3197955",
        decimals: 18,
    },
    TokenDef {
        symbol: "USDC",
        name: "USD Coin (BEP20)",
        contract: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
        decimals: 18,
    },
    TokenDef {
        symbol: "BUSD",
        name: "Binance USD",
        contract: "0xe9e7cea3dedca5984780bafc599bd69add087d56",
        decimals: 18,
    },
    TokenDef {
        symbol: "CAKE",
        name: "PancakeSwap Token",
        contract: "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82",
        decimals: 18,
    },
    TokenDef {
        symbol: "DAI",
        name: "Dai Token",
        contract: "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3",
        decimals: 18,
    },
];

pub const BASE_TOKENS: &[TokenDef] = &[
    TokenDef {
        symbol: "USDC",
        name: "USD Coin",
        contract: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        decimals: 6,
    },
    TokenDef {
        symbol: "USDbC",
        name: "USD Base Coin",
        contract: "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca",
        decimals: 6,
    },
    TokenDef {
        symbol: "DAI",
        name: "Dai Stablecoin",
        contract: "0x50c5725949a6f0c72e6c4a641f24049a917db0cb",
        decimals: 18,
    },
    TokenDef {
        symbol: "AERO",
        name: "Aerodrome",
        contract: "0x940181a94a35a4569e4529a3cdfb74e48fd98762",
        decimals: 18,
    },
];

pub const ARB_TOKENS: &[TokenDef] = &[
    TokenDef {
        symbol: "USDT",
        name: "Tether USD",
        contract: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
        decimals: 6,
    },
    TokenDef {
        symbol: "USDC",
        name: "USD Coin",
        contract: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
        decimals: 6,
    },
    TokenDef {
        symbol: "ARB",
        name: "Arbitrum",
        contract: "0x912ce59144191c1204e64559fe8253a0e49e6548",
        decimals: 18,
    },
    TokenDef {
        symbol: "DAI",
        name: "Dai Stablecoin",
        contract: "0xda10009cbd5d07dd0cecc6616156627511bb9813",
        decimals: 18,
    },
    TokenDef {
        symbol: "WBTC",
        name: "Wrapped BTC",
        contract: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
        decimals: 8,
    },
    TokenDef {
        symbol: "GMX",
        name: "GMX",
        contract: "0xfc5a1a6eb0ba367c0e73da63a5cc324f9f4a2111",
        decimals: 18,
    },
];

pub const ROBINHOOD_TOKENS: &[TokenDef] = &[
    TokenDef {
        symbol: "$PLUR",
        name: "Plurivex",
        contract: "0xf890d3fe2be22c6259bbe9f607692c7168556c93",
        decimals: 18,
    },
    TokenDef {
        symbol: "PLX",
        name: "Plurivex",
        contract: "0x2411cfb697efc0efd32a4e98f7be5ba098b671a5",
        decimals: 18,
    },
    TokenDef {
        symbol: "WETH",
        name: "Wrapped Ether",
        contract: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
        decimals: 18,
    },
    TokenDef {
        symbol: "USDG",
        name: "Global Dollar",
        contract: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
        decimals: 6,
    },
    TokenDef {
        symbol: "ASTEROID",
        name: "Asteroid Shiba",
        contract: "0x38aaf33082b20aff2e33433138de920f131b7777",
        decimals: 18,
    },
    TokenDef {
        symbol: "IB-ASTEROID",
        name: "IB-ASTEROID",
        contract: "0x6E96e5d84513996eF7dF308aF345F9283C4da284",
        decimals: 18,
    },
    TokenDef {
        symbol: "CRDO",
        name: "Credo Technology",
        contract: "0x4D67253bc223e6b0e104F1084c1fb2b669dDC41b",
        decimals: 18,
    },
    TokenDef {
        symbol: "QUBT",
        name: "Quantum Computing",
        contract: "0x59818904ab4cE163b3cE4FfB64f2D6Ca02c434B4",
        decimals: 18,
    },
    TokenDef {
        symbol: "RBLX",
        name: "Roblox",
        contract: "0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8",
        decimals: 18,
    },
    TokenDef {
        symbol: "JEV",
        name: "OpenJEV",
        contract: "0x4d066ab4d924b7b3d01c6ecbfc142efe33aeb7fa",
        decimals: 18,
    },
    TokenDef {
        symbol: "SMA",
        name: "Summa",
        contract: "0x3bd9136d51af679bd1b11d06b951155543c5449f",
        decimals: 18,
    },
];
