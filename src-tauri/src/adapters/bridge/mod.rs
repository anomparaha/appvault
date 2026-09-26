// Bridge integration adapter (deBridge DLN / Mayan Finance / Li.Fi SDK)
pub struct BridgeQuote {
    pub provider: String,
    pub src_chain: String,
    pub dst_chain: String,
    pub estimated_fee: f64,
}
