import { AppProvider, useApp } from "./context/AppContext";
import { SetupScreen, UnlockScreen } from "./components/AuthScreens";
import { MainApp } from "./components/MainApp";
import { ToastContainer } from "./components/Toast";
import { GlobalTooltip } from "./components/GlobalTooltip";

function AppRouter() {
  const { screen, initError } = useApp();

  if (screen === "loading") {
    return (
      <div className="auth-screen">
        <p style={{ color: "var(--text-dim)" }}>Loading…</p>
      </div>
    );
  }
  if (screen === "error") {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>Failed to load database</h1>
          <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 16 }}>{initError}</p>
          <p>Please try restarting the application. If the error persists, try rebuilding the app.</p>
        </div>
      </div>
    );
  }
  if (screen === "setup") return <SetupScreen />;
  if (screen === "unlock") return <UnlockScreen />;
  return <MainApp />;
}

export default function App() {
  return (
    <AppProvider>
      <AppRouter />
      <ToastContainer />
      <GlobalTooltip />
    </AppProvider>
  );
}