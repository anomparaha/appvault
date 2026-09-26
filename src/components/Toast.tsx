import { useApp } from "../context/AppContext";

export function ToastContainer() {
  const { toasts } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span className="toast-icon">
            {t.type === "success" ? "✓" : t.type === "error" ? "⚠️" : "ℹ️"}
          </span>
          <span className="toast-text">{t.text}</span>
        </div>
      ))}
    </div>
  );
}
