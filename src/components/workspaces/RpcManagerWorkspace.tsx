import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useApp } from "../../context/AppContext";
import { CHAINS, type ChainKey } from "../../lib/chains/chains";
import { ChainIcon, IconRefresh, IconArrowLeft, IconZap, IconTrash } from "../../icons";
import { robinhoodWs } from "../../services/robinhoodWsService";

interface RpcPingResult {
  latency_ms: number;
  status: string;
  block_height: number | null;
}

interface EndpointState {
  url: string;
  latency: number | null;
  status: "idle" | "testing" | "online" | "offline";
  blockHeight: number | null;
  isCustom?: boolean;
}

const STORAGE_KEY_CUSTOM_RPCS = "plurivex_custom_rpcs";

function formatRpcUrlForDisplay(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/");
    const host = parsed.hostname.toLowerCase();
    const safePath = segments
      .map((segment, index) => {
        const previous = segments[index - 1]?.toLowerCase();
        const followsCredentialVersion = previous === "v2" || previous === "v3";
        const looksLikeLongToken = segment.length >= 16 && /^[a-z0-9_-]+$/i.test(segment);
        const quickNodePath = host.endsWith(".quiknode.pro") && segment.length > 0;
        return followsCredentialVersion || looksLikeLongToken || quickNodePath ? "••••" : segment;
      })
      .join("/");

    // Query values and names are intentionally omitted: provider-specific keys
    // can use arbitrary parameter names and should not be echoed into the UI.
    return `${parsed.host}${safePath}${parsed.search ? "?••••" : ""}`;
  } catch {
    return "Custom RPC endpoint";
  }
}

export function RpcManagerWorkspace({ onBack }: { onBack?: () => void }) {
  const { toast, isAirGapped, sessionToken } = useApp();

  // Load custom RPCs from localStorage
  const [customRpcs, setCustomRpcs] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CUSTOM_RPCS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Endpoints status map
  const [endpoints, setEndpoints] = useState<Record<string, EndpointState[]>>({});
  const [isPingingAll, setIsPingingAll] = useState(false);
  const [newRpcInput, setNewRpcInput] = useState<Record<string, string>>({});
  const [zanApiKeyInput, setZanApiKeyInput] = useState("");
  const [hasZanApiKey, setHasZanApiKey] = useState(false);
  const [isSavingZanApiKey, setIsSavingZanApiKey] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHasZanApiKey(false);
    setZanApiKeyInput("");
    if (!sessionToken) return () => { cancelled = true; };
    void invoke<boolean>("has_robinhood_wss_api_key", { sessionToken })
      .then((configured) => {
        if (!cancelled) setHasZanApiKey(configured);
      })
      .catch(() => {
        if (!cancelled) setHasZanApiKey(false);
      });
    return () => { cancelled = true; };
  }, [sessionToken]);

  const saveZanApiKey = async () => {
    const apiKey = zanApiKeyInput.trim();
    if (!sessionToken || !apiKey || isSavingZanApiKey) return;
    setIsSavingZanApiKey(true);
    try {
      await invoke("set_robinhood_wss_api_key", { sessionToken, apiKey });
      setHasZanApiKey(true);
      setZanApiKeyInput("");
      robinhoodWs.reconnectNow();
      toast("ZAN Robinhood WSS credential saved encrypted in the vault.", "success");
    } catch {
      toast("Could not save the ZAN API key. Check the key format and unlock the vault.", "error");
    } finally {
      setIsSavingZanApiKey(false);
    }
  };

  const clearZanApiKey = async () => {
    if (!sessionToken || isSavingZanApiKey) return;
    setIsSavingZanApiKey(true);
    try {
      await invoke("clear_robinhood_wss_api_key", { sessionToken });
      setHasZanApiKey(false);
      setZanApiKeyInput("");
      robinhoodWs.reconnectNow();
      toast("ZAN Robinhood WSS credential removed from the vault.", "info");
    } catch {
      toast("Could not remove the ZAN API key.", "error");
    } finally {
      setIsSavingZanApiKey(false);
    }
  };

  // Initialize endpoints from CHAINS and customRpcs
  useEffect(() => {
    const initial: Record<string, EndpointState[]> = {};
    for (const chain of CHAINS) {
      const defaultList: EndpointState[] = (chain.rpcs as readonly string[]).map((url) => ({
        url,
        latency: null,
        status: "idle",
        blockHeight: null,
        isCustom: false,
      }));

      const customs: EndpointState[] = (customRpcs[chain.key] || []).map((url) => ({
        url,
        latency: null,
        status: "idle",
        blockHeight: null,
        isCustom: true,
      }));

      initial[chain.key] = [...defaultList, ...customs];
    }
    setEndpoints(initial);
  }, [customRpcs]);

  // Ping a single endpoint via Rust core
  const pingEndpoint = useCallback(
    async (chainKey: string, family: string, url: string) => {
      if (!sessionToken) {
        toast("Unlock the vault before testing RPC endpoints.", "error");
        return;
      }
      if (isAirGapped) {
        toast("Network offline: Air-Gapped Safe Mode is active.", "error");
        return;
      }

      setEndpoints((prev) => {
        const list = prev[chainKey] || [];
        return {
          ...prev,
          [chainKey]: list.map((item) =>
            item.url === url ? { ...item, status: "testing" } : item
          ),
        };
      });

      try {
        const res = await invoke<RpcPingResult>("ping_rpc_node", {
          sessionToken,
          url,
          family,
        });

        setEndpoints((prev) => {
          const list = prev[chainKey] || [];
          return {
            ...prev,
            [chainKey]: list.map((item) =>
              item.url === url
                ? {
                    ...item,
                    latency: res.latency_ms,
                    status: res.status === "online" ? "online" : "offline",
                    blockHeight: res.block_height,
                  }
                : item
            ),
          };
        });
      } catch (err) {
        setEndpoints((prev) => {
          const list = prev[chainKey] || [];
          return {
            ...prev,
            [chainKey]: list.map((item) =>
              item.url === url ? { ...item, status: "offline", latency: null } : item
            ),
          };
        });
      }
    },
    [isAirGapped, sessionToken, toast]
  );

  // Ping all endpoints across all chains
  const pingAll = useCallback(async () => {
    if (!sessionToken) {
      toast("Unlock the vault before testing RPC endpoints.", "error");
      return;
    }
    if (isAirGapped) {
      toast("Air-Gapped Safe Mode active: Disable Safe Mode in header to test RPCs.", "error");
      return;
    }

    setIsPingingAll(true);
    const tasks: Promise<void>[] = [];

    for (const chain of CHAINS) {
      const list = endpoints[chain.key] || [];
      for (const ep of list) {
        tasks.push(pingEndpoint(chain.key, chain.family, ep.url));
      }
    }

    await Promise.allSettled(tasks);
    setIsPingingAll(false);
    toast("RPC latency test complete across all networks", "success");
  }, [isAirGapped, sessionToken, endpoints, pingEndpoint, toast]);

  // Add custom RPC
  const handleAddCustomRpc = (chainKey: ChainKey) => {
    const rawUrl = (newRpcInput[chainKey] || "").trim();
    if (!rawUrl) return;

    if (!rawUrl.startsWith("https://")) {
      toast("RPC URL must begin with https://", "error");
      return;
    }

    const updated = {
      ...customRpcs,
      [chainKey]: [...(customRpcs[chainKey] || []), rawUrl],
    };

    setCustomRpcs(updated);
    localStorage.setItem(STORAGE_KEY_CUSTOM_RPCS, JSON.stringify(updated));
    setNewRpcInput((prev) => ({ ...prev, [chainKey]: "" }));
    toast(`Added custom RPC endpoint for ${chainKey.toUpperCase()}`, "success");
  };

  // Remove custom RPC
  const handleRemoveCustomRpc = (chainKey: string, url: string) => {
    const updated = {
      ...customRpcs,
      [chainKey]: (customRpcs[chainKey] || []).filter((u) => u !== url),
    };
    setCustomRpcs(updated);
    localStorage.setItem(STORAGE_KEY_CUSTOM_RPCS, JSON.stringify(updated));
    toast("Custom RPC removed", "info");
  };

  return (
    <div className="import-workspace-view" style={{ maxWidth: "1160px" }}>
      {/* Header */}
      <div className="page-head" style={{ marginBottom: "22px" }}>
        <div className="grow">
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
            {onBack && (
              <button
                type="button"
                className="btn sm"
                onClick={onBack}
                style={{ height: "26px", padding: "0 8px" }}
              >
                <IconArrowLeft size={13} />
                <span>Back</span>
              </button>
            )}
            <h1>RPC Node Manager</h1>
          </div>
          <p>Monitor connection health, latency, and custom RPC endpoints across all 7 supported chains.</p>
        </div>

        <div className="page-head-actions">
          <span
            className="badge"
            style={{
              height: "26px",
              padding: "0 10px",
              background: isAirGapped ? "var(--surface-3)" : "var(--ok-soft)",
              color: isAirGapped ? "var(--text-dim)" : "var(--ok)",
              border: `1px solid ${isAirGapped ? "var(--border)" : "var(--ok-border)"}`,
            }}
          >
            {isAirGapped ? "🛡️ Air-Gapped Safe Mode" : "🌐 Online Mode"}
          </span>

          <button
            type="button"
            className="btn primary sm"
            onClick={pingAll}
            disabled={isPingingAll || isAirGapped || !sessionToken}
            style={{ height: "26px", padding: "0 12px", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <IconRefresh size={12} className={isPingingAll ? "spin-scan" : ""} />
            <span>{isPingingAll ? "Testing All Nodes…" : "Test All Nodes"}</span>
          </button>
        </div>
      </div>

      <section
        aria-label="Robinhood live WebSocket configuration"
        style={{
          marginBottom: "18px",
          padding: "16px 18px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "14px", display: "flex", alignItems: "center", gap: "7px" }}>
              <IconZap size={14} /> Robinhood Chain · ZAN WSS
            </h2>
            <p style={{ margin: "5px 0 0", fontSize: "11px", color: "var(--text-dim)" }}>
              Subscribe to new blocks and refresh selected Robinhood wallets as soon as a block arrives.
            </p>
          </div>
          <span
            className="badge"
            style={{
              background: hasZanApiKey ? "var(--ok-soft)" : "var(--surface-3)",
              color: hasZanApiKey ? "var(--ok)" : "var(--text-dim)",
              border: `1px solid ${hasZanApiKey ? "var(--ok-border)" : "var(--border)"}`,
            }}
          >
            {hasZanApiKey ? "ZAN key saved in vault" : "ZAN key not configured"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
          <input
            type="password"
            className="input-base"
            autoComplete="new-password"
            spellCheck={false}
            aria-label="ZAN API key for Robinhood Chain WebSocket"
            placeholder={hasZanApiKey ? "Enter a replacement ZAN API key…" : "Paste the ZAN API key (not the full endpoint URL)…"}
            value={zanApiKeyInput}
            onChange={(event) => setZanApiKeyInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void saveZanApiKey();
            }}
            disabled={!sessionToken || isSavingZanApiKey}
            style={{ height: "32px", flex: "1 1 300px", maxWidth: "620px", fontSize: "11px" }}
          />
          <button
            type="button"
            className="btn primary sm"
            onClick={() => void saveZanApiKey()}
            disabled={!sessionToken || !zanApiKeyInput.trim() || isSavingZanApiKey}
            style={{ height: "32px", padding: "0 12px", fontSize: "11px" }}
          >
            {isSavingZanApiKey ? "Saving…" : hasZanApiKey ? "Replace key" : "Save key"}
          </button>
          {hasZanApiKey && (
            <button
              type="button"
              className="btn sm"
              onClick={() => void clearZanApiKey()}
              disabled={!sessionToken || isSavingZanApiKey}
              style={{ height: "32px", padding: "0 12px", fontSize: "11px", color: "var(--danger)" }}
            >
              Remove key
            </button>
          )}
        </div>
        <p style={{ margin: "8px 0 0", fontSize: "10px", color: "var(--text-dim)" }}>
          The key is encrypted with the vault master password; it is never written to localStorage or source code.
          The live socket only runs in an unlocked vault with Safe Mode off. Robinhood HTTP fallback is used only while WSS is unavailable.
        </p>
      </section>

      {/* Network Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "18px" }}>
        {CHAINS.map((chain) => {
          const list = endpoints[chain.key] || [];
          const inputVal = newRpcInput[chain.key] || "";

          return (
            <div
              key={chain.key}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)",
                padding: "18px 20px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                {/* Chain Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                    <ChainIcon chain={chain.key} size={20} />
                    <div>
                      <b style={{ fontSize: "13.5px", color: "var(--text)", display: "block", lineHeight: 1.2 }}>
                        {chain.label}
                      </b>
                      <span className="mono" style={{ fontSize: "10px", color: "var(--text-dim)" }}>
                        {chain.symbol} · {chain.family.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <span
                    className="badge b-ghost"
                    style={{ fontSize: "9.5px", padding: "1px 7px" }}
                  >
                    {list.length} Node{list.length > 1 ? "s" : ""}
                  </span>
                </div>

                {/* Node List */}
                <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginBottom: "14px" }}>
                  {list.map((ep, idx) => {
                    const isFast = ep.latency !== null && ep.latency < 200;
                    const isMed = ep.latency !== null && ep.latency >= 200 && ep.latency < 500;

                    return (
                      <div
                        key={ep.url}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 10px",
                          background: "var(--surface-2)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--r-sm)",
                          gap: "8px",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {idx === 0 && (
                              <span style={{ fontSize: "8px", fontWeight: 700, padding: "1px 4px", borderRadius: "3px", background: "var(--accent-soft)", color: "var(--accent)" }}>
                                PRIMARY
                              </span>
                            )}
                            {ep.isCustom && (
                              <span style={{ fontSize: "8px", fontWeight: 700, padding: "1px 4px", borderRadius: "3px", background: "var(--surface-3)", color: "var(--text-dim)" }}>
                                CUSTOM
                              </span>
                            )}
                            <span
                              className="mono"
                              title={formatRpcUrlForDisplay(ep.url)}
                              style={{
                                fontSize: "10.5px",
                                color: "var(--text)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {formatRpcUrlForDisplay(ep.url)}
                            </span>
                          </div>

                          {ep.blockHeight !== null && (
                            <span className="mono" style={{ fontSize: "9px", color: "var(--text-dim)", display: "block", marginTop: "2px" }}>
                              Block #{ep.blockHeight.toLocaleString()}
                            </span>
                          )}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                          {ep.status === "testing" ? (
                            <span className="mono" style={{ fontSize: "10px", color: "var(--text-dim)" }}>
                              pinging…
                            </span>
                          ) : ep.status === "online" && ep.latency !== null ? (
                            <span
                              className="mono"
                              style={{
                                fontSize: "10.5px",
                                fontWeight: 700,
                                color: isFast ? "var(--ok)" : isMed ? "var(--warning)" : "var(--danger)",
                              }}
                            >
                              {ep.latency}ms
                            </span>
                          ) : ep.status === "offline" ? (
                            <span style={{ fontSize: "9.5px", color: "var(--danger)", fontWeight: 600 }}>
                              Offline
                            </span>
                          ) : null}

                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => pingEndpoint(chain.key, chain.family, ep.url)}
                            disabled={ep.status === "testing" || isAirGapped || !sessionToken}
                            style={{ height: "22px", padding: "0 7px", fontSize: "10px" }}
                            title="Ping this endpoint"
                          >
                            <IconZap size={11} />
                          </button>

                          {ep.isCustom && (
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => handleRemoveCustomRpc(chain.key, ep.url)}
                              style={{ height: "22px", padding: "0 6px", color: "var(--danger)" }}
                              title="Delete custom RPC"
                            >
                              <IconTrash size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add Custom RPC Form */}
              <div style={{ paddingTop: "10px", borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input
                    type="text"
                    className="input-base"
                    placeholder="https://your-node-url…"
                    value={inputVal}
                    onChange={(e) => setNewRpcInput((prev) => ({ ...prev, [chain.key]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddCustomRpc(chain.key as ChainKey);
                    }}
                    style={{ height: "28px", fontSize: "10.5px", flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => handleAddCustomRpc(chain.key as ChainKey)}
                    disabled={!inputVal.trim()}
                    style={{ height: "28px", padding: "0 10px", fontSize: "10.5px", whiteSpace: "nowrap" }}
                  >
                    + Add
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
