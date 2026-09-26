/**
 * Optional Solana mainnet WebSocket client.
 * Account updates keep native SOL responsive; logsSubscribe notices any successful
 * transaction mentioning a watched owner so the RPC scanner can refresh its SPL
 * token accounts. HTTP/RPC polling remains the recovery path when WSS is unavailable.
 */

export interface SolanaAccountUpdate {
  address: string;
  lamports: number;
  solFormatted: string;
  slot?: number;
}

export interface SolanaTransactionUpdate {
  address: string;
  signature: string;
  slot?: number;
}

type AccountUpdateCallback = (update: SolanaAccountUpdate) => void;
type TransactionCallback = (update: SolanaTransactionUpdate) => void;
type SlotCallback = (slot: number) => void;
type StatusCallback = (connected: boolean) => void;

class SolanaWsClient {
  private readonly wsUrl = "wss://mainnet.helius-rpc.com/?api-key=f0adee34-1df4-45c6-b897-b93f4cad01c9";
  private socket: WebSocket | null = null;
  private isConnecting = false;
  private isConnected = false;
  private enabled = false;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private pingInterval: number | null = null;

  private watchedAddresses = new Set<string>();
  private accountSubIdToAddress = new Map<number, string>();
  private logSubIdToAddress = new Map<number, string>();
  private accountReqIdToAddress = new Map<number, string>();
  private logReqIdToAddress = new Map<number, string>();

  private slotSubId: number | null = null;
  private currentSlot = 0;
  private nextReqId = 100;

  private accountListeners = new Set<AccountUpdateCallback>();
  private transactionListeners = new Set<TransactionCallback>();
  private slotListeners = new Set<SlotCallback>();
  private statusListeners = new Set<StatusCallback>();

  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      if (enabled && !this.isConnected && !this.isConnecting && this.hasDemand()) this.connect();
      return;
    }

    this.enabled = enabled;
    if (!enabled) {
      this.disconnect();
      return;
    }

    if (this.hasDemand()) this.connect();
  }

  public connect(): void {
    if (!this.enabled || typeof window === "undefined" || this.socket || this.isConnecting) return;
    this.isConnecting = true;

    try {
      const socket = new WebSocket(this.wsUrl);
      this.socket = socket;

      socket.onopen = () => {
        if (this.socket !== socket) return;
        this.isConnecting = false;
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.notifyStatus(true);

        this.sendJson({ jsonrpc: "2.0", id: 1, method: "slotSubscribe" });
        for (const address of this.watchedAddresses) {
          this.subscribeAccount(address);
          this.subscribeLogs(address);
        }
        this.startPing();
      };

      socket.onmessage = (event) => {
        try {
          this.handleMessage(JSON.parse(event.data));
        } catch (err) {
          console.warn("[Solana WS] Parse error:", err);
        }
      };

      socket.onerror = (err) => {
        console.warn("[Solana WS] Connection error:", err);
      };

      socket.onclose = () => {
        if (this.socket !== socket) return;
        this.cleanupSocketState();
        this.scheduleReconnect();
      };
    } catch (err) {
      this.cleanupSocketState();
      this.scheduleReconnect();
    }
  }

  private handleMessage(data: any): void {
    if (data?.error && typeof data.id === "number") {
      this.accountReqIdToAddress.delete(data.id);
      this.logReqIdToAddress.delete(data.id);
      console.warn("[Solana WS] Subscription request rejected:", data.error);
      return;
    }

    if (data?.id !== undefined && data.result !== undefined) {
      const requestId = Number(data.id);
      const subscriptionId = Number(data.result);
      if (!Number.isFinite(subscriptionId)) return;

      if (requestId === 1) {
        this.slotSubId = subscriptionId;
        return;
      }

      const accountAddress = this.accountReqIdToAddress.get(requestId);
      if (accountAddress) {
        this.accountReqIdToAddress.delete(requestId);
        this.accountSubIdToAddress.set(subscriptionId, accountAddress);
        return;
      }

      const logAddress = this.logReqIdToAddress.get(requestId);
      if (logAddress) {
        this.logReqIdToAddress.delete(requestId);
        this.logSubIdToAddress.set(subscriptionId, logAddress);
      }
      return;
    }

    if (data?.method === "slotNotification" && data.params?.result) {
      const slot = Number(data.params.result.slot);
      if (Number.isFinite(slot) && slot > 0 && slot !== this.currentSlot) {
        this.currentSlot = slot;
        this.notifySlot(slot);
      }
      return;
    }

    if (data?.method === "accountNotification" && data.params) {
      const subscriptionId = Number(data.params.subscription);
      const address = this.accountSubIdToAddress.get(subscriptionId);
      const value = data.params.result?.value;
      if (!address || !value || typeof value.lamports !== "number") return;

      const lamports = value.lamports;
      const solAmount = lamports / 1_000_000_000;
      const formattedAmount = solAmount.toFixed(9).replace(/\.?0+$/, "");
      this.notifyAccount({
        address,
        lamports,
        solFormatted: `${formattedAmount || "0"} SOL`,
        slot: data.params.result?.context?.slot,
      });
      return;
    }

    if (data?.method === "logsNotification" && data.params) {
      const subscriptionId = Number(data.params.subscription);
      const address = this.logSubIdToAddress.get(subscriptionId);
      const result = data.params.result;
      const signature = result?.value?.signature;
      // Failed transactions do not change the wallet's token holdings.
      if (address && signature && result?.value?.err == null) {
        this.notifyTransaction({
          address,
          signature,
          slot: result?.context?.slot,
        });
      }
    }
  }

  private sendJson(payload: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  private subscribeAccount(address: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if ([...this.accountSubIdToAddress.values()].includes(address)) return;

    const requestId = ++this.nextReqId;
    this.accountReqIdToAddress.set(requestId, address);
    this.sendJson({
      jsonrpc: "2.0",
      id: requestId,
      method: "accountSubscribe",
      params: [address, { encoding: "jsonParsed", commitment: "confirmed" }],
    });
  }

  private subscribeLogs(address: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if ([...this.logSubIdToAddress.values()].includes(address)) return;

    const requestId = ++this.nextReqId;
    this.logReqIdToAddress.set(requestId, address);
    this.sendJson({
      jsonrpc: "2.0",
      id: requestId,
      method: "logsSubscribe",
      params: [{ mentions: [address] }, { commitment: "confirmed" }],
    });
  }

  private unsubscribeAddress(address: string): void {
    this.accountReqIdToAddress.forEach((candidate, requestId) => {
      if (candidate === address) this.accountReqIdToAddress.delete(requestId);
    });
    this.logReqIdToAddress.forEach((candidate, requestId) => {
      if (candidate === address) this.logReqIdToAddress.delete(requestId);
    });

    for (const [subscriptionId, candidate] of this.accountSubIdToAddress) {
      if (candidate !== address) continue;
      this.accountSubIdToAddress.delete(subscriptionId);
      this.sendJson({
        jsonrpc: "2.0",
        id: ++this.nextReqId,
        method: "accountUnsubscribe",
        params: [subscriptionId],
      });
    }

    for (const [subscriptionId, candidate] of this.logSubIdToAddress) {
      if (candidate !== address) continue;
      this.logSubIdToAddress.delete(subscriptionId);
      this.sendJson({
        jsonrpc: "2.0",
        id: ++this.nextReqId,
        method: "logsUnsubscribe",
        params: [subscriptionId],
      });
    }
  }

  public setWatchedAddresses(addresses: string[]): void {
    const nextAddresses = new Set(addresses.filter(Boolean));
    for (const oldAddress of this.watchedAddresses) {
      if (!nextAddresses.has(oldAddress)) this.unsubscribeAddress(oldAddress);
    }

    this.watchedAddresses = nextAddresses;
    if (this.socket?.readyState === WebSocket.OPEN) {
      for (const address of nextAddresses) {
        this.subscribeAccount(address);
        this.subscribeLogs(address);
      }
    } else if (this.enabled && nextAddresses.size > 0) {
      this.connect();
    }
  }

  public subscribeAccountUpdates(callback: AccountUpdateCallback): () => void {
    this.accountListeners.add(callback);
    if (this.enabled) this.connect();
    return () => this.accountListeners.delete(callback);
  }

  public subscribeTransactions(callback: TransactionCallback): () => void {
    this.transactionListeners.add(callback);
    if (this.enabled) this.connect();
    return () => this.transactionListeners.delete(callback);
  }

  public subscribeSlots(callback: SlotCallback): () => void {
    this.slotListeners.add(callback);
    if (this.enabled) this.connect();
    return () => this.slotListeners.delete(callback);
  }

  public subscribeStatus(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    callback(this.isConnected);
    return () => this.statusListeners.delete(callback);
  }

  private notifyAccount(update: SolanaAccountUpdate): void {
    for (const listener of this.accountListeners) {
      try {
        listener(update);
      } catch (err) {
        console.error("[Solana WS] Account listener error:", err);
      }
    }
  }

  private notifyTransaction(update: SolanaTransactionUpdate): void {
    for (const listener of this.transactionListeners) {
      try {
        listener(update);
      } catch (err) {
        console.error("[Solana WS] Transaction listener error:", err);
      }
    }
  }

  private notifySlot(slot: number): void {
    for (const listener of this.slotListeners) {
      try {
        listener(slot);
      } catch (err) {
        console.error("[Solana WS] Slot listener error:", err);
      }
    }
  }

  private notifyStatus(connected: boolean): void {
    for (const listener of this.statusListeners) {
      try {
        listener(connected);
      } catch (err) {
        console.error("[Solana WS] Status listener error:", err);
      }
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = window.setInterval(() => {
      this.sendJson({ jsonrpc: "2.0", id: 9999, method: "getSlot" });
    }, 25_000);
  }

  private stopPing(): void {
    if (this.pingInterval !== null) {
      window.clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (!this.enabled || this.reconnectTimer !== null || !this.hasDemand()) return;
    const delayMs = Math.min(3_000 * 2 ** Math.min(this.reconnectAttempts, 5), 60_000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.enabled && this.hasDemand()) this.connect();
    }, delayMs);
  }

  private hasDemand(): boolean {
    return this.watchedAddresses.size > 0 || this.accountListeners.size > 0 ||
      this.transactionListeners.size > 0 || this.slotListeners.size > 0;
  }

  private cleanupSocketState(): void {
    this.isConnecting = false;
    this.isConnected = false;
    this.socket = null;
    this.slotSubId = null;
    this.accountSubIdToAddress.clear();
    this.logSubIdToAddress.clear();
    this.accountReqIdToAddress.clear();
    this.logReqIdToAddress.clear();
    this.stopPing();
    this.notifyStatus(false);
  }

  public disconnect(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPing();
    const socket = this.socket;
    this.socket = null;
    this.isConnecting = false;
    this.isConnected = false;
    this.slotSubId = null;
    this.accountSubIdToAddress.clear();
    this.logSubIdToAddress.clear();
    this.accountReqIdToAddress.clear();
    this.logReqIdToAddress.clear();
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    }
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
