import { invoke } from "@tauri-apps/api/core";

let activeClipboardTimer: any = null;

export async function copySensitiveToClipboard(
  secret: string,
  timeoutMs: number = 30000
): Promise<boolean> {
  try {
    // 1. Write text to clipboard
    await navigator.clipboard.writeText(secret);

    // 2. Schedule native OS-level clipboard wipe via Rust backend
    // This executes at the Windows OS User32 level, so it works even if window is not focused or minimized!
    const timeoutSecs = Math.max(1, Math.round(timeoutMs / 1000));
    try {
      await invoke("schedule_clipboard_clear", { timeoutSecs, timeout_secs: timeoutSecs });
      console.log(`[Security] Native OS clipboard clear scheduled in ${timeoutSecs}s`);
    } catch (err) {
      console.error("[Security] Native clipboard clear call failed:", err);
    }

    // 3. Secondary web fallback
    if (activeClipboardTimer) {
      clearTimeout(activeClipboardTimer);
    }
    activeClipboardTimer = setTimeout(async () => {
      try {
        await navigator.clipboard.writeText("");
      } catch {}
      activeClipboardTimer = null;
    }, timeoutMs);

    return true;
  } catch (err) {
    console.error("Failed to copy sensitive data:", err);
    return false;
  }
}

