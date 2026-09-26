import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImportPanel } from "./ImportPanel";
import { IconWalletImport } from "../icons";

const STORAGE_KEY = "floating-import-pos";
const PANEL_W = 640;
const PANEL_H = 480;
const DRAG_THRESHOLD = 5;

function defaultPos() {
  return {
    x: Math.max(16, Math.round((window.innerWidth - PANEL_W) / 2)),
    y: Math.max(30, Math.round((window.innerHeight - PANEL_H) / 2)),
  };
}

function loadPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { x: number; y: number };
      if (typeof p.x === "number" && typeof p.y === "number") {
        return clampPos(p.x, p.y, PANEL_W, PANEL_H);
      }
    }
  } catch {
    /* ignore */
  }
  return defaultPos();
}

function clampPos(x: number, y: number, width: number, height: number) {
  const pad = 12;
  const maxX = Math.max(pad, window.innerWidth - width - pad);
  const maxY = Math.max(pad, window.innerHeight - height - pad);
  return {
    x: Math.min(Math.max(pad, x), maxX),
    y: Math.min(Math.max(pad, y), maxY),
  };
}

interface FloatingImportProps {
  open: boolean;
  onClose: () => void;
}

export function FloatingImport({ open, onClose }: FloatingImportProps) {
  const [pos, setPos] = useState(loadPos);
  const drag = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    width: PANEL_W,
    height: PANEL_H,
  });
  const dragHandlers = useRef({
    onMove: (_e: PointerEvent) => {},
    onUp: () => {},
  });

  useEffect(() => {
    setPos((p) => clampPos(p.x, p.y, PANEL_W, PANEL_H));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  }, [pos]);

  useEffect(() => {
    const onResize = () => {
      setPos((p) => clampPos(p.x, p.y, PANEL_W, PANEL_H));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!drag.current.active) return;
      const dx = e.clientX - drag.current.startX;
      const dy = e.clientY - drag.current.startY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        drag.current.moved = true;
      }
      setPos(clampPos(
        drag.current.origX + dx,
        drag.current.origY + dy,
        drag.current.width,
        drag.current.height,
      ));
    };

    const onUp = () => {
      drag.current.active = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    dragHandlers.current = { onMove, onUp };
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const startDrag = (e: React.PointerEvent, size: { w: number; h: number }) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      width: size.w,
      height: size.h,
    };
    window.addEventListener("pointermove", dragHandlers.current.onMove);
    window.addEventListener("pointerup", dragHandlers.current.onUp);
  };

  if (!open) return null;

  const ui = (
    <div
      className="floating-import is-open"
      style={{ left: pos.x, top: pos.y, zIndex: 99999 }}
    >
      <div className="floating-import-panel">
        <header
          className="floating-import-header"
          onPointerDown={(e) => startDrag(e, { w: PANEL_W, h: PANEL_H })}
        >
          <span className="floating-import-header-icon">
            <IconWalletImport size={20} />
          </span>
          <div className="floating-import-header-copy">
            <h3>Import Wallets</h3>
            <p>Paste, drop files, or import raw text</p>
          </div>
          <button
            type="button"
            className="floating-import-close"
            aria-label="Close import"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <ImportPanel floating onClose={onClose} />
      </div>
    </div>
  );

  return createPortal(ui, document.body);
}