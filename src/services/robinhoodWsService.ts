/**
 * Optional Robinhood Chain WebSocket listener. It is explicitly gated by the
 * app's online/unlocked state; RPC polling remains independent of this socket.
 */

type BlockCallback = (blockNumber: number, blockHash: string) => void;
type StatusCallback = (connected: boolean) => void;

class RobinhoodWsClient {
  private readonly wsUrl = "wss://api.zan.top/node/ws/v1/robinhood/mainnet/9f2590af4fda43418ca4f0e8ded27af5";
  private socket: WebSocket | null = null;
  private isConnecting = false;
  private isConnected = false;
  private enabled = false;
  private blockListeners = new Set<BlockCallback>();
  private statusListeners = new Set<StatusCallback>();
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private subscriptionId: string | null = null;
  private lastBlockNumber = 0;

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
        socket.send(JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_subscribe",
          params: ["newHeads"],
        }));
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.id === 1 && data.result) {
            this.subscriptionId = String(data.result);
            return;
          }
          if (data.method !== "eth_subscription" || !data.params?.result) return;

          const head = data.params.result;
          const blockNumber = Number.parseInt(head.number, 16);
          const blockHash = typeof head.hash === "string" ? head.hash : "";
          if (Number.isFinite(blockNumber) && blockNumber > 0 && blockNumber !== this.lastBlockNumber) {
            this.lastBlockNumber = blockNumber;
            this.notifyBlock(blockNumber, blockHash);
          }
        } catch (err) {
          console.warn("[Robinhood WS] Message parse warning:", err);
        }
      };

      socket.onerror = (err) => {
        console.warn("[Robinhood WS] Socket error:", err);
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

  public subscribeBlocks(callback: BlockCallback): () => void {
    this.blockListeners.add(callback);
    if (this.enabled) this.connect();
    return () => this.blockListeners.delete(callback);
  }

  public subscribeStatus(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    callback(this.isConnected);
    if (this.enabled) this.connect();
    return () => this.statusListeners.delete(callback);
  }

  private notifyBlock(blockNumber: number, blockHash: string): void {
    for (const listener of this.blockListeners) {
      try {
        listener(blockNumber, blockHash);
      } catch (err) {
        console.error("[Robinhood WS] Listener error:", err);
      }
    }
  }

  private notifyStatus(connected: boolean): void {
    for (const listener of this.statusListeners) {
      try {
        listener(connected);
      } catch (err) {
        console.error("[Robinhood WS] Status listener error:", err);
      }
    }
  }

  private hasDemand(): boolean {
    return this.blockListeners.size > 0 || this.statusListeners.size > 0;
  }

  private scheduleReconnect(): void {
    if (!this.enabled || !this.hasDemand() || this.reconnectTimer !== null) return;
    const delayMs = Math.min(4_000 * 2 ** Math.min(this.reconnectAttempts, 4), 60_000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.enabled && this.hasDemand()) this.connect();
    }, delayMs);
  }

  private cleanupSocketState(): void {
    this.isConnecting = false;
    this.isConnected = false;
    this.socket = null;
    this.subscriptionId = null;
    this.notifyStatus(false);
  }

  public disconnect(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    this.isConnecting = false;
    this.isConnected = false;
    this.subscriptionId = null;
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

  public getLastBlock(): number {
    return this.lastBlockNumber;
  }

  public getSubscriptionId(): string | null {
    return this.subscriptionId;
  }
}

export const robinhoodWs = new RobinhoodWsClient();
