export type ActivityType = "sweep" | "scan" | "import" | "security" | "export";
export type ActivityStatus = "success" | "failed" | "info" | "warning";

export interface ActivityRecord {
  id: string;
  type: ActivityType;
  title: string;
  desc: string;
  amount?: string;
  amountColor?: string;
  timestamp: number;
  status: ActivityStatus;
  chain?: string;
  txHash?: string;
  explorerUrl?: string;
  recipient?: string;
  sender?: string;
  metadata?: Record<string, unknown>;
}

const STORAGE_KEY = "plurivex_activity_logs";
const EVENT_NAME = "plurivex-activity-updated";
const MAX_LOGS = 500;

function getDefaultInitialActivities(): ActivityRecord[] {
  const now = Date.now();
  return [
    {
      id: "init-1",
      type: "security",
      title: "Local Vault Initialized",
      desc: "Argon2id key derivation & encrypted SQLite local database active",
      amount: "Locked",
      amountColor: "var(--ok)",
      timestamp: now - 3600000 * 2,
      status: "success",
    },
    {
      id: "init-2",
      type: "security",
      title: "Air-Gapped Safe Mode Ready",
      desc: "Kernel-level execution gate blocks unconfirmed outbound network calls",
      amount: "Protected",
      amountColor: "var(--ok)",
      timestamp: now - 3600000,
      status: "info",
    },
  ];
}

export function getActivities(): ActivityRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = getDefaultInitialActivities();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.error("Failed to read activity logs:", err);
    return [];
  }
}

export function logActivity(
  entry: Omit<ActivityRecord, "id" | "timestamp"> & { id?: string; timestamp?: number }
): ActivityRecord {
  const record: ActivityRecord = {
    ...entry,
    id: entry.id || `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: entry.timestamp || Date.now(),
  };

  try {
    const existing = getActivities();
    const updated = [record, ...existing].slice(0, MAX_LOGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: updated }));
  } catch (err) {
    console.error("Failed to persist activity log:", err);
  }

  return record;
}

export function clearActivities(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: [] }));
  } catch (err) {
    console.error("Failed to clear activity logs:", err);
  }
}

export function subscribeActivities(callback: (activities: ActivityRecord[]) => void): () => void {
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<ActivityRecord[]>;
    if (customEvent.detail) {
      callback(customEvent.detail);
    } else {
      callback(getActivities());
    }
  };

  window.addEventListener(EVENT_NAME, handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
  };
}

export function formatActivityTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 45) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function exportActivitiesJson(): void {
  const data = getActivities();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `plurivex_audit_log_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportActivitiesCsv(): void {
  const items = getActivities();
  const headers = ["Timestamp", "Date", "Type", "Status", "Title", "Description", "Amount", "Chain", "TxHash"];
  const rows = items.map((i) => [
    i.timestamp,
    new Date(i.timestamp).toISOString(),
    i.type,
    i.status,
    `"${(i.title || "").replace(/"/g, '""')}"`,
    `"${(i.desc || "").replace(/"/g, '""')}"`,
    `"${(i.amount || "").replace(/"/g, '""')}"`,
    i.chain || "",
    i.txHash || "",
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `plurivex_audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
