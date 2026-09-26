pub fn solana_token_meta(mint: &str) -> (&'static str, &'static str) {
    match mint {
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" => ("USDC", "USD Coin"),
        "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" => ("USDT", "Tether USD"),
        "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" => ("BONK", "Bonk"),
        "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" => ("JUP", "Jupiter"),
        "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" => ("RAY", "Raydium"),
        "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" => ("WIF", "dogwifhat"),
        "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So" => ("mSOL", "Marinade Staked SOL"),
        "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1" => ("bSOL", "BlazeStake Staked SOL"),
        "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn" => ("JitoSOL", "Jito Staked SOL"),
        "BoBBYtpE2kpAJwh5TPPky72KND2cWmtdYa63bqo2yiKs" => ("BTc", "Bobby The Cat"),
        "7gcgahvsgvx42yuiqtzj7ezf4b8t9k8h6f67v7a9b" => ("POPCAT", "Popcat"),
        "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82" => ("BOME", "BOOK OF MEME"),
        "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5" => ("MEW", "cat in a dogs world"),
        "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof" => ("RENDER", "Render Token"),
        "HZ1JovNiDcBaKhQPPBp8KgWNyAbLqygXAmjBk1BpPump" => ("PYTH", "Pyth Network"),
        _ => ("", "SPL Token"),
    }
}
