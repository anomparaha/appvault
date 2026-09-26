/**
 * Dedicated Real-Time WebSocket Service for Robinhood Chain (Zan.top Dedicated Node).
 * Subscribes to newHeads and allows reactive on-chain balance updates without polling.
 */

type BlockCallback = (blockNumber: number, blockHash: string) => void;
type StatusCallback = (connected: boolean) => void;

class RobinhoodWsClient {
  private wsUrl: string = "wss://api.zan.top/node/ws/v1/robinhood/mainnet/9f2590af4fda43418ca4f0e8ded27af5";
  private socket: WebSocket | null = null;
  private isConnecting: boolean = false;
  private isConnected: boolean = false;
  private blockListeners: Set<BlockCallback> = new Set();
  private statusListeners: Set<StatusCallback> = new Set();
  private reconnectTimer: number | null = null;
  private subscriptionId: string | null = null;
  private lastBlockNumber: number = 0;

  constructor() {
    // Lazily initialized when subscribers attach
  }

  public connect(): void {
    if (typeof window === "undefined" || this.socket || this.isConnecting) return;
    this.isConnecting = true;

    try {
      this.socket = new WebSocket(this.wsUrl);

      this.socket.onopen = () => {
        this.isConnecting = false;
        this.isConnected = true;
        this.notifyStatus(true);

        // Subscribe to newHeads
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "eth_subscribe",
              params: ["newHeads"],
            })
          );
        }
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Subscription acknowledgment
          if (data.id === 1 && data.result) {
            this.subscriptionId = data.result;
            return;
          }

          // New head notification
          if (data.method === "eth_subscription" && data.params?.result) {
            const head = data.params.result;
            const bNum = parseInt(head.number, 16);
            const bHash = head.hash || "";

            if (bNum && bNum !== this.lastBlockNumber) {
              this.lastBlockNumber = bNum;
              this.notifyBlock(bNum, bHash);
            }
          }
        } catch (err) {
          console.warn("[Robinhood WS] Message parse warning:", err);
        }
      };

      this.socket.onerror = (err) => {
        console.warn("[Robinhood WS] Socket error:", err);
      };

      this.socket.onclose = () => {
        this.isConnecting = false;
        this.isConnected = false;
        this.socket = null;
        this.subscriptionId = null;
        this.notifyStatus(false);
        this.scheduleReconnect();
      };
    } catch (err) {
      this.isConnecting = false;
      this.isConnected = false;
      this.socket = null;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.blockListeners.size > 0 || this.statusListeners.size > 0) {
        this.connect();
      }
    }, 4000);
  }

  public subscribeBlocks(cb: BlockCallback): () => void {
    this.blockListeners.add(cb);
    if (!this.isConnected && !this.isConnecting) {
      this.connect();
    }
    return () => {
      this.blockListeners.delete(cb);
      if (this.blockListeners.size === 0 && this.statusListeners.size === 0) {
        this.disconnect();
      }
    };
  }

  public subscribeStatus(cb: StatusCallback): () => void {
    this.statusListeners.add(cb);
    cb(this.isConnected);
    if (!this.isConnected && !this.isConnecting) {
      this.connect();
    }
    return () => {
      this.statusListeners.delete(cb);
      if (this.blockListeners.size === 0 && this.statusListeners.size === 0) {
        this.disconnect();
      }
    };
  }

  private notifyBlock(blockNumber: number, blockHash: string): void {
    for (const listener of this.blockListeners) {
      try {
        listener(blockNumber, blockHash);
      } catch (e) {
        console.error("[Robinhood WS] Listener error:", e);
      }
    }
  }

  private notifyStatus(status: boolean): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (e) {
        console.error("[Robinhood WS] Status listener error:", e);
      }
    }
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
    this.subscriptionId = null;
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
