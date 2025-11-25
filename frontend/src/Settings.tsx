import { useState } from "react";
import "./styles.css";
import { api } from "./api";

type SettingsProps = {
  onBack: () => void;
};

export default function Settings({ onBack }: SettingsProps) {
  const [status, setStatus] = useState<string>("");
  const [isResetting, setIsResetting] = useState(false);

  async function handleReset() {
    const confirmed = window.confirm(
      "⚠️ ARE YOU SURE?\n\n" +
      "This will permanently delete:\n" +
      "• All groups\n" +
      "• All email threads\n" +
      "• All messages\n\n" +
      "This action CANNOT be undone!\n\n" +
      "Click OK to proceed with the reset."
    );

    if (!confirmed) return;

    try {
      setIsResetting(true);
      setStatus("Resetting database...");
      await api.resetDatabase();
      setStatus("✓ Database reset successfully. Please restart the server to run the wizard again.");
    } catch (err) {
      setStatus(`✗ Error: ${(err as Error).message}`);
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div className="app">
      <section className="panel" style={{ maxWidth: "600px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <button onClick={onBack} style={{ padding: "8px 16px" }}>
            ← Back
          </button>
          <h2 className="section-title" style={{ margin: 0 }}>Settings</h2>
        </div>

        <div className="stack" style={{ gap: "20px" }}>
          <div>
            <h3 className="section-title">About</h3>
            <p className="muted" style={{ lineHeight: "1.6" }}>
              Simple Email Sandbox (SES) is a fast prototyping tool for LLM agent email networks.
            </p>
          </div>

          <div style={{
            background: "#fff5f5",
            border: "2px solid #fed7d7",
            borderRadius: "8px",
            padding: "20px"
          }}>
            <h3 className="section-title" style={{ color: "#c53030", marginBottom: "10px" }}>
              ⚠️ Danger Zone
            </h3>
            <p className="muted" style={{ marginBottom: "16px", lineHeight: "1.6", color: "#742a2a" }}>
              <strong>Reset Database:</strong> This will permanently delete all groups, threads, and messages.
              You will need to restart the server to run the initialization wizard again.
            </p>
            <button
              onClick={handleReset}
              disabled={isResetting}
              style={{
                background: "#e53e3e",
                color: "white",
                width: "100%",
                padding: "12px",
                fontWeight: "600",
                border: "none",
                borderRadius: "6px",
                cursor: isResetting ? "not-allowed" : "pointer",
                opacity: isResetting ? 0.6 : 1
              }}
            >
              {isResetting ? "Resetting..." : "Reset Database"}
            </button>
            {status && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  background: status.startsWith("✓") ? "#c6f6d5" : "#fed7d7",
                  color: status.startsWith("✓") ? "#22543d" : "#742a2a",
                  borderRadius: "6px",
                  fontWeight: "500"
                }}
              >
                {status}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
