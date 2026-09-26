import { invoke } from "@tauri-apps/api/core";

export function WindowControls() {
  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    invoke("window_minimize").catch(console.error);
  };

  const handleToggleMaximize = (e: React.MouseEvent) => {
    e.stopPropagation();
    invoke("window_toggle_maximize").catch(console.error);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    invoke("window_close").catch(console.error);
  };

  return (
    <div className="window-controls-group" data-tauri-drag-region="false">
      <button
        type="button"
        className="window-control-btn btn-win-minimize"
        onClick={handleMinimize}
        data-tooltip="Minimize Window"
        data-tooltip-pos="bottom"
        tabIndex={-1}
      >
        <svg width="10" height="1" viewBox="0 0 10 1">
          <rect width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        className="window-control-btn btn-win-maximize"
        onClick={handleToggleMaximize}
        data-tooltip="Maximize / Restore"
        data-tooltip-pos="bottom"
        tabIndex={-1}
      >
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1">
          <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />
        </svg>
      </button>
      <button
        type="button"
        className="window-control-btn btn-win-close"
        onClick={handleClose}
        data-tooltip="Close (Alt+F4)"
        data-tooltip-pos="bottom"
        tabIndex={-1}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
          <line x1="1" y1="1" x2="9" y2="9" />
          <line x1="9" y1="1" x2="1" y2="9" />
        </svg>
      </button>
    </div>
  );
}
