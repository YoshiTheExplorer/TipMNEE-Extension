import React from "react";
import { CONFIG } from "../shared/config";

export default function App() {
  return (
    <div style={{ padding: 12, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>TipMNEE</div>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>
        Chain ID: {CONFIG.CHAIN_ID}
        <br />
        API: {CONFIG.API_BASE}
      </div>
      <div style={{ fontSize: 12 }}>
        Open a YouTube video and click <b>Tip</b>.
      </div>
    </div>
  );
}
