/**
 * ZAN WSS client for Robinhood Chain.
 *
 * The API key is encrypted in the native vault database and is only requested
 * after the unlocked-session + Online Mode gate has passed. `newHeads` is the
 * real-time trigger; balances are refreshed through the existing native scanner
 * so results continue to be validated and persisted by the Rust layer.
 */

import { invoke } from "@tauri-apps/api/core";
import { verifyOnlineNetworkAccess } from "../lib/services/networkAccess";

export interface RobinhoodBlock {
  number: number;
  hash: string;
  numberHex: string;
}

export type RobinhoodWsStatus =
  | "disabled"
  | "connecting"
  | "subscribing"
  | "connected"
  | "disconnected"
  | "unconfigured"
  | "error";

type BlockCallback = (block: RobinhoodBlock) => void;
type StatusCallback = (status: RobinhoodWsStatus) => void;

const CHAIN_ID_REQUEST_ID = 1;
const SUBSCRIPTION_REQUEST_ID = 2;
const ROBINHOOD_CHAIN_ID = "0x1237";
const ROBINHOOD_WS_ENDPOINT_PREFIX = "wss://api.zan.top/node/ws/v1/robinhood/mainnet/";
const HEARTBEAT_INTERVAL_MS = 25_000;

class RobinhoodWsClient {
  private socket: WebSocket | null = null;
  private isEnabled = false;
  private isConnecting = false;
  private sessionToken: string | null = null;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectAttempts = 0;
  private generation = 0;
  private nextRequestId = 10;
  private subscriptionId: string | null = null;
  private latestBlock: RobinhoodBlock | null = null;
  private status: RobinhoodWsStatus = "disabled";
  private messageProcessing: Promise<void> = Promise.resolve();
  private blockListeners = new Set<BlockCallback>();
  private statusListeners = new Set<StatusCallback>();

  public setEnabled(enabled: boolean, sessionToken?: string | null): void {
    const nextToken = enabled ? sessionToken?.trim() || null : null;
    if (!nextToken) {
      this.isEnabled = false;
      this.sessionToken = null;
      this.generation += 1;
      this.disconnect();
      this.setStatus("disabled");
      return;
    }

    const sessionChanged = this.sessionToken !== nextToken;
    this.sessionToken = nextToken;
    this.isEnabled = true;
    if (sessionChanged) {
      this.generation += 1;
      this.disconnect();
    }
    if (!this.socket && !this.isConnecting) this.connect();
  }

  /** Re-read the vault-encrypted ZAN key after it is saved or removed. */
  public reconnectNow(): void {
    if (!this.isEnabled || !this.sessionToken) return;
    this.generation += 1;
    this.disconnect();
    this.connect();
  }

  public subscribeBlocks(callback: BlockCallback): () => void {
    this.blockListeners.add(callback);
    return () => this.blockListeners.delete(callback);
  }

  public subscribeStatus(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => this.statusListeners.delete(callback);
  }

  public getStatus(): RobinhoodWsStatus {
    return this.status;
  }

  public getLatestBlock(): RobinhoodBlock | null {
    return this.latestBlock;
  }

  private connect(): void {
    const sessionToken = this.sessionToken;
    const generation = this.generation;
    if (
      !this.isEnabled || !sessionToken || this.socket || this.isConnecting ||
      typeof window === "undefined" || typeof WebSocket === "undefined"
    ) return;

    this.isConnecting = true;
    this.setStatus("connecting");
    void this.openAfterNativeGate(sessionToken, generation);
  }

  private async openAfterNativeGate(sessionToken: string, generation: number): Promise<void> {
    try {
      await verifyOnlineNetworkAccess(sessionToken);
    } catch {
      this.failClosed(sessionToken, generation);
      return;
    }
    if (!this.isCurrentSession(sessionToken, generation)) return;

    let endpoint: string | null;
    try {
      endpoint = await invoke<string | null>("get_robinhood_wss_endpoint_scoped", {
        sessionToken,
      });
    } catch {
      if (!this.isCurrentSession(sessionToken, generation)) return;
      this.isConnecting = false;
      this.setStatus("error");
      this.scheduleReconnect();
      return;
    }
    if (!this.isCurrentSession(sessionToken, generation)) return;
    if (!endpoint) {
      this.isConnecting = false;
      this.setStatus("unconfigured");
      return;
    }

    // The native command builds this exact provider URL from the encrypted key.
    // Validate the origin/path without logging or displaying the credential.
    if (!endpoint.startsWith(ROBINHOOD_WS_ENDPOINT_PREFIX)) {
      this.isConnecting = false;
      this.setStatus("error");
      return;
    }

    try {
      await verifyOnlineNetworkAccess(sessionToken);
    } catch {
      this.failClosed(sessionToken, generation);
      return;
    }
    if (!this.isCurrentSession(sessionToken, generation)) return;

    try {
      const socket = new WebSocket(endpoint);
      this.socket = socket;
      socket.onopen = () => void this.handleSocketOpen(socket, sessionToken, generation);
      socket.onmessage = (event) => {
        if (!this.isCurrentSession(sessionToken, generation, socket)) return;
        this.messageProcessing = this.messageProcessing
          .then(() => this.handleSocketMessage(event.data, socket, sessionToken, generation))
          .catch(() => this.failClosed(sessionToken, generation));
      };
      socket.onerror = () => {
        // Do not log browser error objects: WebSocket diagnostics may contain the URL.
        if (this.isCurrentSession(sessionToken, generation, socket)) this.setStatus("error");
      };
      socket.onclose = () => {
        if (!this.isCurrentSession(sessionToken, generation, socket)) return;
        this.cleanupSocketState(socket);
        this.setStatus("disconnected");
        this.scheduleReconnect();
      };
    } catch {
      if (!this.isCurrentSession(sessionToken, generation)) return;
      this.isConnecting = false;
      this.setStatus("error");
      this.scheduleReconnect();
    }
  }

  private async handleSocketOpen(
    socket: WebSocket,
    sessionToken: string,
    generation: number,
  ): Promise<void> {
    try {
      await verifyOnlineNetworkAccess(sessionToken);
    } catch {
      this.failClosed(sessionToken, generation);
      socket.close();
      return;
    }
    if (!this.isCurrentSession(sessionToken, generation, socket)) {
      socket.close();
      return;
    }

    this.isConnecting = false;
    this.setStatus("subscribing");
    this.sendJson({
      jsonrpc: "2.0",
      id: CHAIN_ID_REQUEST_ID,
      method: "eth_chainId",
      params: [],
    }, socket, sessionToken, generation);
    this.startHeartbeat(socket, sessionToken, generation);
  }

  private async handleSocketMessage(
    data: MessageEvent["data"],
    socket: WebSocket,
    sessionToken: string,
    generation: number,
  ): Promise<void> {
    try {
      await verifyOnlineNetworkAccess(sessionToken);
    } catch {
      this.failClosed(sessionToken, generation);
      return;
    }
    if (!this.isCurrentSession(sessionToken, generation, socket)) return;

    let message: any;
    try {
      message = JSON.parse(typeof data === "string" ? data : String(data));
    } catch {
      return;
    }

    if (Number(message?.id) === CHAIN_ID_REQUEST_ID) {
      if (typeof message.result !== "string" || message.result.toLowerCase() !== ROBINHOOD_CHAIN_ID) {
        this.setStatus("error");
        socket.close();
        return;
      }
      this.sendJson({
        jsonrpc: "2.0",
        id: SUBSCRIPTION_REQUEST_ID,
        method: "eth_subscribe",
        params: ["newHeads"],
      }, socket, sessionToken, generation);
      return;
    }

    if (Number(message?.id) === SUBSCRIPTION_REQUEST_ID) {
      if (typeof message.result === "string" && message.result.length > 0) {
        this.subscriptionId = message.result;
        this.reconnectAttempts = 0;
        this.setStatus("connected");
      } else {
        this.setStatus("error");
        socket.close();
      }
      return;
    }

    if (
      message?.method !== "eth_subscription" ||
      message.params?.subscription !== this.subscriptionId
    ) return;

    const header = message.params?.result;
    const numberHex = header?.number;
    const blockHash = header?.hash;
    if (
      typeof numberHex !== "string" || !/^0x[0-9a-f]+$/i.test(numberHex) ||
      typeof blockHash !== "string" || !/^0x[0-9a-f]{64}$/i.test(blockHash)
    ) return;

    const parsedNumber = Number.parseInt(numberHex.slice(2), 16);
    if (!Number.isSafeInteger(parsedNumber) || parsedNumber <= 0) return;
    if (this.latestBlock?.number === parsedNumber && this.latestBlock.hash === blockHash) return;

    const block = { number: parsedNumber, hash: blockHash, numberHex };
    this.latestBlock = block;
    for (const listener of this.blockListeners) {
      try {
        listener(block);
      } catch (error) {
        console.error("[Robinhood WS] Block listener failed:", error);
      }
    }
  }

  private sendJson(
    payload: unknown,
    socket: WebSocket,
    sessionToken: string,
    generation: number,
  ): void {
    void verifyOnlineNetworkAccess(sessionToken).then(() => {
      if (!this.isCurrentSession(sessionToken, generation, socket) || socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(JSON.stringify(payload));
      } catch {
        socket.close();
      }
    }).catch(() => this.failClosed(sessionToken, generation));
  }

  private startHeartbeat(socket: WebSocket, sessionToken: string, generation: number): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (!this.isCurrentSession(sessionToken, generation, socket)) return;
      this.sendJson({
        jsonrpc: "2.0",
        id: this.nextRequestId++,
        method: "eth_blockNumber",
        params: [],
      }, socket, sessionToken, generation);
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (!this.isEnabled || !this.sessionToken || this.reconnectTimer !== null) return;
    const delay = Math.min(1_500 * 2 ** Math.min(this.reconnectAttempts, 5), 45_000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.isEnabled && this.sessionToken && !this.socket && !this.isConnecting) this.connect();
    }, delay);
  }

  private isCurrentSession(sessionToken: string, generation: number, socket?: WebSocket): boolean {
    return this.isEnabled && this.sessionToken === sessionToken && this.generation === generation &&
      (!socket || this.socket === socket);
  }

  private failClosed(sessionToken: string, generation: number): void {
    if (this.sessionToken !== sessionToken || this.generation !== generation) return;
    this.isEnabled = false;
    this.sessionToken = null;
    this.generation += 1;
    this.disconnect();
    this.setStatus("disabled");
  }

  private cleanupSocketState(socket: WebSocket): void {
    if (this.socket !== socket) return;
    this.socket = null;
    this.isConnecting = false;
    this.subscriptionId = null;
    this.stopHeartbeat();
  }

  private disconnect(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    const socket = this.socket;
    this.socket = null;
    this.isConnecting = false;
    this.subscriptionId = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try { socket.close(); } catch { /* best-effort teardown */ }
    }
  }

  private setStatus(status: RobinhoodWsStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (error) {
        console.error("[Robinhood WS] Status listener failed:", error);
      }
    }
  }
}

export const robinhoodWs = new RobinhoodWsClient();
