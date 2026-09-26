import { Buffer } from "buffer";
if (typeof window !== "undefined") {
  (window as any).Buffer = Buffer;
  (window as any).global = window;
}

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";

// Remove browser focus ring after mouse click
document.addEventListener("mousedown", (e) => {
  const t = e.target as HTMLElement;
  if (t.matches("input, textarea, button, select") || t.closest("button, .wallet-item, .filter-tab")) {
    t.style.outline = "none";
  }
});

document.addEventListener("mouseup", (e) => {
  const el = (e.target as HTMLElement).closest(
    "button, .wallet-item, .filter-tab, .btn",
  );
  if (el) {
    requestAnimationFrame(() => (document.activeElement as HTMLElement)?.blur?.());
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);