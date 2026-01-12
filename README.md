# TipMNEE Chrome Extension

**TipMNEE** is a Chrome extension that lets users tip YouTube creators using MNEE. Tips are routed through an on-chain escrow smart contract keyed by the creator’s YouTube `channel_id`, enabling creators to claim funds later after verification.

This repository contains **only the Chrome extension frontend**. It assumes a deployed smart contract and a wallet such as MetaMask.

---

## Repo Overview

Key files:
- `manifest.json` — Chrome Extension (Manifest V3) configuration
- `src/content.js` — Injected into YouTube pages (adds tip UI)
- `src/background.js` — Background service worker
- `src/popup/popup.html` — Extension popup UI
- `src/popup/popup.js` — Popup logic
- `webpack.config.js` — Bundles in-page scripts
- `dist/` — Webpack build output (generated)

Dependencies are managed via `npm` and webpack.

---

## Prerequisites

- **Node.js** ≥ 18
- **npm**
- **Google Chrome**
- **Web3 wallet** (MetaMask recommended)
- Access to **Ethereum mainnet** (or a testnet if modifying configs)

---

Run Locally (Chrome Dev Mode)
1. Open Chrome and go to: chrome://extensions
2. Enable Developer mode (top-right).
3. Click Load unpacked.
4. Select the root directory of this repo (the folder containing manifest.json).
5. The TipMNEE icon should now appear in your extensions toolbar.
5.1 If you rebuild with webpack, click Reload on the extension in chrome://extensions.

---

Using the Extension (Local / Dev)
- Visit YouTube
- The extension injects UI via content.js
- Click Tip on a creator
- Wallet prompts appear via ethers + injected provider
- Transactions are sent directly from the user’s wallet

---

Requirements for Mainnet Use
- MetaMask network set to Ethereum Mainnet
- User has ETH for gas
- User holds MNEE tokens
- The contract address in the extension code matches the mainnet contract
