import type { ManifestV3Export } from "@crxjs/vite-plugin";

const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: "TipMNEE",
  version: "0.0.1",
  description: "Tip YouTube creators via direct payout or escrow.",
  action: {
    default_title: "TipMNEE",
    default_popup: "src/popup/index.html",
  },
  permissions: ["storage", "activeTab", "scripting"],
  host_permissions: ["https://www.youtube.com/*", "http://localhost:8080/*"],
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  content_scripts: [
    {
        matches: ["https://www.youtube.com/*"],
        js: ["src/contentScript.ts"],
        run_at: "document_idle",
        // @crxjs types may not include this; it's valid in MV3.
        world: "MAIN" as any,
    },
    ],
};

export default manifest;
