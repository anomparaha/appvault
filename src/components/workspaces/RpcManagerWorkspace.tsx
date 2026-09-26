import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useApp } from "../../context/AppContext";
import { CHAINS, type ChainKey } from "../../lib/chains/chains";
import { ChainIcon, IconRefresh, IconArrowLeft, IconZap, IconTrash } from "../../icons";

interface RpcPingResult {
  url: string;
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

export function RpcManagerWorkspace({ onBack }: { onBack?: () => void }) {
  const { toast, isAirGapped } = useApp();

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
    [isAirGapped, toast]
  );

  // Ping all endpoints across all chains
  const pingAll = useCallback(async () => {
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
  }, [isAirGapped, endpoints, pingEndpoint, toast]);

  // Add custom RPC
  const handleAddCustomRpc = (chainKey: ChainKey) => {
    const rawUrl = (newRpcInput[chainKey] || "").trim();
    if (!rawUrl) return;

    if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
      toast("RPC URL must begin with https:// or http://", "error");
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
            disabled={isPingingAll || isAirGapped}
            style={{ height: "26px", padding: "0 12px", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <IconRefresh size={12} className={isPingingAll ? "spin-scan" : ""} />
            <span>{isPingingAll ? "Testing All Nodes…" : "Test All Nodes"}</span>
          </button>
        </div>
      </div>

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
                              title={ep.url}
                              style={{
                                fontSize: "10.5px",
                                color: "var(--text)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {ep.url.replace(/^https?:\/\//, "")}
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
                            disabled={ep.status === "testing" || isAirGapped}
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
