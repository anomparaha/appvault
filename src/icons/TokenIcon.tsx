import { useEffect, useState } from "react";
import type { IconProps } from "./types";
import { ChainIcon } from "./ChainIcon";
import { OFFICIAL_TOKEN_SPEC } from "../services/officialTokenService";
import { useApp } from "../context/AppContext";

export interface TokenIconProps extends IconProps {
  chain?: string;
  symbol?: string;
  contractAddress?: string;
  name?: string;
  logoUrl?: string | null;
}

function isLocalOrPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) return true;

  const octets = host.split(".").map(Number);
  if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [first, second] = octets;
    return first === 0 || first === 10 || first === 127 || first >= 224 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 198 && (second === 18 || second === 19));
  }

  if (host === "::" || host === "::1" || host.startsWith("::ffff:")) return true;
  const firstIpv6Segment = Number.parseInt(host.split(":")[0] || "0", 16);
  return (firstIpv6Segment & 0xfe00) === 0xfc00 || (firstIpv6Segment & 0xffc0) === 0xfe80;
}

function safeRemoteLogoUrl(value: string | null | undefined): string | null {
  if (!value || value.length > 2048) return null;
  try {
    let clean = value.trim();

    // Strip Helius image proxy prefix if present
    if (clean.startsWith("https://cdn.helius-rpc.com/cdn-cgi/image//")) {
      clean = clean.replace("https://cdn.helius-rpc.com/cdn-cgi/image//", "");
    }

    // Rewrite sunsetted IPFS gateways (ipfs.io, dweb.link, cf-ipfs) to dedicated pump/pinata gateway
    if (clean.startsWith("ipfs://")) {
      const path = clean.replace(/^ipfs:\/\/(?:ipfs\/)?/, "");
      clean = `https://pump.mypinata.cloud/ipfs/${path}`;
    } else if (clean.includes("/ipfs/")) {
      const idx = clean.indexOf("/ipfs/");
      const path = clean.slice(idx + 6).replace(/^\/+/, "");
      clean = `https://pump.mypinata.cloud/ipfs/${path}`;
    } else if (clean.startsWith("ar://")) {
      const path = clean.replace(/^ar:\/\//, "");
      clean = `https://arweave.net/${path}`;
    }

    const url = new URL(clean);
    return url.protocol === "https:" && url.hostname && !url.username && !url.password &&
      !isLocalOrPrivateHost(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
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
  logoUrl,
  size = 16,
  className,
}: TokenIconProps) {
  const { sessionToken, isAirGapped } = useApp();
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [retryGateway, setRetryGateway] = useState(0);

  useEffect(() => {
    const initial = sessionToken && !isAirGapped ? safeRemoteLogoUrl(logoUrl) : null;
    setImgSrc(initial);
    setRetryGateway(0);
  }, [logoUrl, sessionToken, isAirGapped]);

  const handleImgError = () => {
    if (imgSrc && imgSrc.includes("pump.mypinata.cloud/ipfs/") && retryGateway === 0) {
      setRetryGateway(1);
      setImgSrc(imgSrc.replace("pump.mypinata.cloud", "gateway.pinata.cloud"));
    } else {
      setImgSrc(null);
    }
  };

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

  // Remote token artwork is an optional network resource: it is fetched only after the vault
  // session is unlocked and Safe Mode is explicitly off. If it fails, fall back to the chain icon.
  if (imgSrc) {
    return (
      <img
        src={imgSrc}
        alt={`${name || symbol || "Token"} logo`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={handleImgError}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        className={className}
      />
    );
  }

  // 4. Fallback to host blockchain icon (Solana icon for SPL tokens, Robinhood feather for Robinhood tokens, etc.)
  if (normChain) {
    return <ChainIcon chain={normChain} size={size} className={className} />;
  }

  return null;
}
