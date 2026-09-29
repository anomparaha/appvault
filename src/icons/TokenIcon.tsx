import { useEffect, useRef, useState } from "react";
import type { IconProps } from "./types";
import { ChainIcon } from "./ChainIcon";
import { useApp } from "../context/AppContext";
import { verifyOnlineNetworkAccess } from "../lib/services/networkAccess";

export interface TokenIconProps extends IconProps {
  chain?: string;
  symbol?: string;
  contractAddress?: string;
  name?: string;
  logoUrl?: string | null;
}

function isLocalOrPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").replace(/\.+$/, "").toLowerCase();
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
    if (
      url.protocol !== "https:" || !url.hostname || url.username || url.password ||
      isLocalOrPrivateHost(url.hostname)
    ) return null;
    // Token metadata is untrusted; strip query strings and fragments so a logo
    // cannot cause a provider/API token to be sent as part of an image URL.
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Universal Token Icon resolver.
 * Uses approved chain-specific art where available, otherwise a session-gated
 * token metadata logo or the host blockchain icon.
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
  const { sessionToken, isAirGapped, networkSessionReady } = useApp();
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [verifiedLogoUrl, setVerifiedLogoUrl] = useState<string | null>(null);
  const [retryGateway, setRetryGateway] = useState(0);
  const sanitizedLogoUrl = safeRemoteLogoUrl(logoUrl);
  const expectedLogoUrl = retryGateway === 1 && sanitizedLogoUrl?.includes("pump.mypinata.cloud/ipfs/")
    ? sanitizedLogoUrl.replace("pump.mypinata.cloud", "gateway.pinata.cloud")
    : sanitizedLogoUrl;
  const imgSrcRef = useRef(imgSrc);
  const sessionTokenRef = useRef(sessionToken);
  const isAirGappedRef = useRef(isAirGapped);
  const networkSessionReadyRef = useRef(networkSessionReady);
  imgSrcRef.current = imgSrc;
  sessionTokenRef.current = sessionToken;
  isAirGappedRef.current = isAirGapped;
  networkSessionReadyRef.current = networkSessionReady;

  useEffect(() => {
    let active = true;
    setImgSrc(null);
    setVerifiedLogoUrl(null);
    setRetryGateway(0);
    if (!sessionToken || isAirGapped || !networkSessionReady || !sanitizedLogoUrl) {
      return () => { active = false; };
    }

    // Revalidate natively just before starting a renderer-owned image request.
    void verifyOnlineNetworkAccess(sessionToken).then(() => {
      if (
        active && sessionTokenRef.current === sessionToken &&
        !isAirGappedRef.current && networkSessionReadyRef.current
      ) {
        setImgSrc(sanitizedLogoUrl);
      }
    }).catch(() => {
      if (active) setImgSrc(null);
    });
    return () => { active = false; };
  }, [sanitizedLogoUrl, sessionToken, isAirGapped, networkSessionReady]);

  const handleImgError = () => {
    const failedUrl = imgSrcRef.current;
    setVerifiedLogoUrl(null);
    if (!sessionToken || isAirGapped || !networkSessionReady || !failedUrl) {
      setImgSrc(null);
      return;
    }
    if (failedUrl.includes("pump.mypinata.cloud/ipfs/") && retryGateway === 0) {
      const fallbackUrl = failedUrl.replace("pump.mypinata.cloud", "gateway.pinata.cloud");
      void verifyOnlineNetworkAccess(sessionToken).then(() => {
        if (
          sessionTokenRef.current === sessionToken && !isAirGappedRef.current &&
          networkSessionReadyRef.current && imgSrcRef.current === failedUrl
        ) {
          setRetryGateway(1);
          setImgSrc(fallbackUrl);
        }
      }).catch(() => {
        if (imgSrcRef.current === failedUrl) setImgSrc(null);
      });
    } else {
      setImgSrc(null);
    }
  };

  const handleImgLoad = () => {
    const loadedUrl = imgSrcRef.current;
    if (!sessionToken || isAirGapped || !networkSessionReady || !loadedUrl) {
      setImgSrc(null);
      setVerifiedLogoUrl(null);
      return;
    }
    // Keep the image hidden until a second native check confirms the session and
    // Safe Mode gate after the remote response has completed.
    void verifyOnlineNetworkAccess(sessionToken).then(() => {
      if (
        sessionTokenRef.current === sessionToken && !isAirGappedRef.current &&
        networkSessionReadyRef.current && imgSrcRef.current === loadedUrl
      ) setVerifiedLogoUrl(loadedUrl);
    }).catch(() => {
      if (imgSrcRef.current === loadedUrl) setImgSrc(null);
      setVerifiedLogoUrl(null);
    });
  };

  const normChain = (chain || "").trim().toLowerCase();
  const normAddr = (contractAddress || "").trim();

  // 1. Bobby The Cat (BTc on Solana). Solana public keys are case-sensitive.
  if (
    normChain === "sol" &&
    normAddr === "BoBBYtpE2kpAJwh5TPPky72KND2cWmtdYa63bqo2yiKs"
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

  // 2. Asteroid Shiba. Require its canonical Robinhood Chain contract address.
  if (
    normChain === "robinhood" &&
    ["0x38aaf33082b20aff2e33433138de920f131b7777", "0x6e96e5d84513996ef7df308af345f9283c4da284"].includes(normAddr.toLowerCase())
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

  // 3. Global Dollar / Robin. Symbols and names can be spoofed by arbitrary tokens.
  if (
    normChain === "robinhood" &&
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

  // 4. OpenJEV. Require its canonical Robinhood Chain contract address.
  if (
    normChain === "robinhood" &&
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

  // 5. Summa. Require its canonical Robinhood Chain contract address.
  if (
    normChain === "robinhood" &&
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

  // Remote token artwork is loaded only after a fresh native gate check. It stays
  // visually hidden until the native session/Safe Mode gate is revalidated on load.
  if (imgSrc && imgSrc === expectedLogoUrl && sessionToken && !isAirGapped && networkSessionReady) {
    return (
      <img
        src={imgSrc}
        alt={`${name || symbol || "Token"} logo`}
        referrerPolicy="no-referrer"
        onLoad={handleImgLoad}
        onError={handleImgError}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
          visibility: verifiedLogoUrl === imgSrc ? "visible" : "hidden",
        }}
        className={className}
      />
    );
  }

  // Fallback to host blockchain icon (Solana icon for SPL tokens, Robinhood feather for Robinhood tokens, etc.)
  if (normChain) {
    return <ChainIcon chain={normChain} size={size} className={className} />;
  }

  return null;
}
