/**
 * Dedicated Real-Time WebSocket Service for Solana Mainnet (Helius Dedicated WSS).
 * Uses accountSubscribe to reactively push native SOL balance changes directly to UI
 * and slotSubscribe for block/slot synchronization without manual refresh.
 */

export interface SolanaAccountUpdate {
  address: string;
  lamports: number;
  solFormatted: string;
  slot?: number;
}

type AccountUpdateCallback = (update: SolanaAccountUpdate) => void;
type SlotCallback = (slot: number) => void;
type StatusCallback = (connected: boolean) => void;

class SolanaWsClient {
  private wsUrl: string = "wss://mainnet.helius-rpc.com/?api-key=f0adee34-1df4-45c6-b897-b93f4cad01c9";
  private socket: WebSocket | null = null;
  private isConnecting: boolean = false;
  private isConnected: boolean = false;
  private reconnectTimer: number | null = null;
  private pingInterval: number | null = null;

  private watchedAddresses: Set<string> = new Set();
  // Map subscriptionId -> address
  private subIdToAddress: Map<number, string> = new Map();
  // Map requestId -> address
  private reqIdToAddress: Map<number, string> = new Map();
  // Map address -> subscriptionId
  private addressToSubId: Map<string, number> = new Map();

  private slotSubId: number | null = null;
  private currentSlot: number = 0;
  private nextReqId: number = 100;

  private accountListeners: Set<AccountUpdateCallback> = new Set();
  private slotListeners: Set<SlotCallback> = new Set();
  private statusListeners: Set<StatusCallback> = new Set();

  public connect(): void {
    if (typeof window === "undefined" || this.socket || this.isConnecting) return;
    this.isConnecting = true;

    try {
      this.socket = new WebSocket(this.wsUrl);

      this.socket.onopen = () => {
        this.isConnecting = false;
        this.isConnected = true;
        this.notifyStatus(true);

        // 1. Subscribe to Solana slots
        this.sendJson({
          jsonrpc: "2.0",
          id: 1,
          method: "slotSubscribe",
        });

        // 2. Re-subscribe all watched addresses
        for (const addr of this.watchedAddresses) {
          this.subscribeAccount(addr);
        }

        // 3. Keepalive ping
        this.startPing();
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle subscription acknowledgment
          if (data.id !== undefined && data.result !== undefined) {
            const reqId = data.id;
            const subId = data.result;

            if (reqId === 1) {
              this.slotSubId = subId;
              return;
            }

            const addr = this.reqIdToAddress.get(reqId);
            if (addr) {
              this.reqIdToAddress.delete(reqId);
              this.subIdToAddress.set(subId, addr);
              this.addressToSubId.set(addr, subId);
            }
            return;
          }

          // Handle incoming notifications
          if (data.method === "slotNotification" && data.params?.result) {
            const slotNum = data.params.result.slot;
            if (slotNum && slotNum !== this.currentSlot) {
              this.currentSlot = slotNum;
              this.notifySlot(slotNum);
            }
            return;
          }

          if (data.method === "accountNotification" && data.params) {
            const subId = data.params.subscription;
            const addr = this.subIdToAddress.get(subId);
            const val = data.params.result?.value;

            if (addr && val !== undefined) {
              const lamports = typeof val.lamports === "number" ? val.lamports : 0;
              const solAmt = lamports / 1_000_000_000;
              const solFormatted =
                solAmt === 0
                  ? "0 SOL"
                  : solAmt < 0.0001
                  ? "< 0.0001 SOL"
                  : `${solAmt.toFixed(4)} SOL`;

              this.notifyAccount({
                address: addr,
                lamports,
                solFormatted,
                slot: data.params.result?.context?.slot,
              });
            }
          }
        } catch (err) {
          console.warn("[Solana WS] Parse error:", err);
        }
      };

      this.socket.onerror = (err) => {
        console.warn("[Solana WS] Connection error:", err);
      };

      this.socket.onclose = () => {
        this.cleanup();
        this.scheduleReconnect();
      };
    } catch (err) {
      this.cleanup();
      this.scheduleReconnect();
    }
  }

  private sendJson(payload: unknown): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  private subscribeAccount(address: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (this.addressToSubId.has(address)) return;

    const reqId = ++this.nextReqId;
    this.reqIdToAddress.set(reqId, address);

    this.sendJson({
      jsonrpc: "2.0",
      id: reqId,
      method: "accountSubscribe",
      params: [
        address,
        {
          encoding: "jsonParsed",
          commitment: "confirmed",
        },
      ],
    });
  }

  private unsubscribeAccount(address: string): void {
    const subId = this.addressToSubId.get(address);
    if (subId !== undefined) {
      this.addressToSubId.delete(address);
      this.subIdToAddress.delete(subId);

      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.sendJson({
          jsonrpc: "2.0",
          id: ++this.nextReqId,
          method: "accountUnsubscribe",
          params: [subId],
        });
      }
    }
  }

  public setWatchedAddresses(addresses: string[]): void {
    const nextSet = new Set(addresses.filter(Boolean));

    // Unsubscribe removed
    for (const oldAddr of this.watchedAddresses) {
      if (!nextSet.has(oldAddr)) {
        this.unsubscribeAccount(oldAddr);
      }
    }

    // Subscribe new
    for (const newAddr of nextSet) {
      if (!this.watchedAddresses.has(newAddr)) {
        this.subscribeAccount(newAddr);
      }
    }

    this.watchedAddresses = nextSet;

    // Connect if we have addresses and listeners
    if (this.watchedAddresses.size > 0 && !this.isConnected && !this.isConnecting) {
      this.connect();
    }
  }

  public subscribeAccountUpdates(cb: AccountUpdateCallback): () => void {
    this.accountListeners.add(cb);
    if (!this.isConnected && !this.isConnecting) {
      this.connect();
    }
    return () => {
      this.accountListeners.delete(cb);
    };
  }

  public subscribeSlots(cb: SlotCallback): () => void {
    this.slotListeners.add(cb);
    if (!this.isConnected && !this.isConnecting) {
      this.connect();
    }
    return () => {
      this.slotListeners.delete(cb);
    };
  }

  public subscribeStatus(cb: StatusCallback): () => void {
    this.statusListeners.add(cb);
    cb(this.isConnected);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  private notifyAccount(update: SolanaAccountUpdate): void {
    for (const listener of this.accountListeners) {
      try {
        listener(update);
      } catch (e) {
        console.error("[Solana WS] Account listener error:", e);
      }
    }
  }

  private notifySlot(slot: number): void {
    for (const listener of this.slotListeners) {
      try {
        listener(slot);
      } catch (e) {
        console.error("[Solana WS] Slot listener error:", e);
      }
    }
  }

  private notifyStatus(status: boolean): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (e) {
        console.error("[Solana WS] Status listener error:", e);
      }
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = window.setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        // Send a lightweight ping/slot query to keep connection warm
        this.sendJson({
          jsonrpc: "2.0",
          id: 9999,
          method: "getSlot",
        });
      }
    }, 25000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.watchedAddresses.size > 0 || this.accountListeners.size > 0 || this.slotListeners.size > 0) {
        this.connect();
      }
    }, 3000);
  }

  private cleanup(): void {
    this.isConnecting = false;
    this.isConnected = false;
    this.socket = null;
    this.slotSubId = null;
    this.subIdToAddress.clear();
    this.reqIdToAddress.clear();
    this.addressToSubId.clear();
    this.stopPing();
    this.notifyStatus(false);
  }

  public getStatus(): boolean {
    return this.isConnected;
  }

  public getCurrentSlot(): number {
    return this.currentSlot;
  }

  public getSlotSubId(): number | null {
    return this.slotSubId;
  }
}

export const solanaWs = new SolanaWsClient();
