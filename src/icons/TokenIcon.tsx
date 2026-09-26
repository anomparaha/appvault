import type { IconProps } from "./types";
import { ChainIcon } from "./ChainIcon";
import { OFFICIAL_TOKEN_SPEC } from "../services/officialTokenService";

export interface TokenIconProps extends IconProps {
  chain?: string;
  symbol?: string;
  contractAddress?: string;
  name?: string;
}

/**
 * Universal Token Icon resolver.
 * Accurately displays token-specific brand assets:
 * 1. Plurivex Ecosystem Token ($PLUR) -> /plurivex-token-logo-128.png
 * 2. Bobby The Cat (BTc on Solana) -> /bobby-the-cat.png (NEVER Bitcoin orange logo!)
 * 3. Fallback: Host chain icon (Solana logo for SPL tokens, etc.)
 */
export function TokenIcon({
  chain = "",
  symbol = "",
  contractAddress = "",
  name = "",
  size = 16,
  className,
}: TokenIconProps) {
  const normSym = (symbol || "").trim().toLowerCase();
  const normChain = (chain || "").trim().toLowerCase();
  const normAddr = (contractAddress || "").trim();
  const normName = (name || "").trim().toLowerCase();

  // 1. Plurivex Official Token ($PLUR)
  if (
    (normAddr && normAddr.toLowerCase() === OFFICIAL_TOKEN_SPEC.contractAddress.toLowerCase()) ||
    normSym === "$plur" ||
    normSym === "plur" ||
    normName.includes("plurivex")
  ) {
    return (
      <img
        src={OFFICIAL_TOKEN_SPEC.logoUrl}
        alt={OFFICIAL_TOKEN_SPEC.name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        className={className}
      />
    );
  }

  // 2. Bobby The Cat (BTc on Solana)
  // Contract: BoBBYtpE2kpAJwh5TPPky72KND2cWmtdYa63bqo2yiKs
  if (
    normAddr === "BoBBYtpE2kpAJwh5TPPky72KND2cWmtdYa63bqo2yiKs" ||
    (normChain === "sol" && (normSym === "btc" || normName.includes("bobby") || normName.includes("cat"))) ||
    normName.includes("bobby the cat")
  ) {
    return (
      <img
        src="/bobby-the-cat.png"
        alt="Bobby The Cat"
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        className={className}
      />
    );
  }

  // 3. Asteroid Shiba (ASTEROID / IB-ASTEROID on Robinhood Chain)
  if (
    normSym.includes("asteroid") ||
    normName.includes("asteroid") ||
    normAddr.toLowerCase() === "0x38aaf33082b20aff2e33433138de920f131b7777" ||
    normAddr.toLowerCase() === "0x6e96e5d84513996ef7df308af345f9283c4da284"
  ) {
    return (
      <img
        src="/asteroid-logo.png"
        alt="Asteroid Shiba"
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        className={className}
      />
    );
  }

  // 4. Global Dollar / Robin (USDG / ROBIN on Robinhood Chain)
  if (
    normSym === "usdg" ||
    normSym === "robin" ||
    normName.includes("global dollar") ||
    normAddr.toLowerCase() === "0x5fc5360d0400a0fd4f2af552add042d716f1d168"
  ) {
    return (
      <img
        src="/robin-logo.png"
        alt="Global Dollar"
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        className={className}
      />
    );
  }

  // 5. OpenJEV (JEV on Robinhood Chain)
  if (
    normSym === "jev" ||
    normName.includes("openjev") ||
    normAddr.toLowerCase() === "0x4d066ab4d924b7b3d01c6ecbfc142efe33aeb7fa"
  ) {
    return (
      <img
        src="/openjev-logo.png"
        alt="OpenJEV"
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        className={className}
      />
    );
  }

  // 6. Summa (SMA on Robinhood Chain)
  if (
    normSym === "sma" ||
    normName.includes("summa") ||
    normAddr.toLowerCase() === "0x3bd9136d51af679bd1b11d06b951155543c5449f"
  ) {
    return (
      <img
        src="/sma-logo.png"
        alt="Summa"
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        className={className}
      />
    );
  }

  // 6. Wrapped Ether (WETH) across any EVM chain (Robinhood, Arbitrum, Base, Ethereum)
  if (normSym === "weth") {
    return <ChainIcon chain="eth" size={size} className={className} />;
  }

  // 4. Fallback to host blockchain icon (Solana icon for Solana SPL tokens, Robinhood feather for Robinhood tokens, etc.)
  if (normChain) {
    return <ChainIcon chain={normChain} size={size} className={className} />;
  }

  return null;
}
