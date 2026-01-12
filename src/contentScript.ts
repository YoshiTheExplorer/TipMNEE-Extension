import { CONFIG } from "./shared/config";
import type { ResolveResponse, TipRequest, TxPlan } from "./shared/types";
import { ethers } from "ethers";

declare global {
  interface Window {
    ethereum?: any;
    ytInitialPlayerResponse?: any;
  }
}

// ---------- YouTube channelId extraction ----------
function getChannelId(): string | null {
  // 1) best: ytd-video-owner-renderer attribute
  const owner = document.querySelector<HTMLElement>("ytd-video-owner-renderer");
  const attr = owner?.getAttribute("data-channel-external-id");
  if (attr && attr.startsWith("UC")) return attr;

  // 2) sometimes exists
  const meta = document.querySelector<HTMLMetaElement>('meta[itemprop="channelId"]');
  if (meta?.content) return meta.content.trim();

  // 3) link href might be /channel/UC...
  const a = document.querySelector<HTMLAnchorElement>(
    "ytd-video-owner-renderer a[href^='/channel/'], #channel-name a[href^='/channel/']"
  );
  const href = a?.getAttribute("href") || "";
  const m = href.match(/^\/channel\/(UC[\w-]+)/);
  if (m?.[1]) return m[1];

  // 4) JS object (if readable)
  const cid = window.ytInitialPlayerResponse?.videoDetails?.channelId;
  if (typeof cid === "string" && cid.startsWith("UC")) return cid;

  return null;
}

// ---------- backend ----------
async function resolvePayout(channelId: string): Promise<ResolveResponse> {
  const url = `${CONFIG.API_BASE}/api/resolve/youtube/${encodeURIComponent(channelId)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`resolve failed: ${r.status}`);
  return (await r.json()) as ResolveResponse;
}

async function ingestDeposit(txHash: string, channelId: string) {
  const url = `${CONFIG.API_BASE}/api/ledger/deposit`;

  console.log("[TipMNEE] ingestDeposit", { txHash, channelId });

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tx_hash: txHash,
      channel_id: channelId,
      chain_id: CONFIG.CHAIN_ID,
    }),
  });

  const text = await r.text();
  if (!r.ok) {
    console.error("[TipMNEE] ingest failed", r.status, text);
    throw new Error(`deposit ingest failed ${r.status}: ${text}`);
  }

  return text ? JSON.parse(text) : {};
}


// ---------- wallet / tx ----------
async function getProvider(): Promise<ethers.BrowserProvider> {
  if (!window.ethereum?.request) throw new Error("No injected wallet found (install MetaMask).");
  return new ethers.BrowserProvider(window.ethereum);
}

async function ensureChain(provider: ethers.BrowserProvider, wantedChainId: number) {
  const net = await provider.getNetwork();
  if (Number(net.chainId) === wantedChainId) return;

  const hex = "0x" + wantedChainId.toString(16);
  await window.ethereum.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: hex }],
  });
}

async function sendTx(plan: TxPlan): Promise<string> {
  const provider = await getProvider();
  await window.ethereum.request({ method: "eth_requestAccounts" });
  await ensureChain(provider, CONFIG.CHAIN_ID);

  const signer = await provider.getSigner();

  if (plan.kind === "DIRECT") {
    const erc20 = new ethers.Contract(
      plan.token,
      ["function transfer(address to, uint256 amount) returns (bool)"],
      signer
    );
    const tx = await erc20.transfer(plan.to, plan.amountRaw);
    await tx.wait(1);
    return tx.hash;
  }

  // ESCROW: approve + tip
  const erc20 = new ethers.Contract(
    plan.token,
    [
      "function allowance(address owner, address spender) view returns (uint256)",
      "function approve(address spender, uint256 amount) returns (bool)",
    ],
    signer
  );

  const owner = await signer.getAddress();
  const allowance: bigint = await erc20.allowance(owner, plan.escrow);
  if (allowance < BigInt(plan.amountRaw)) {
    const approveTx = await erc20.approve(plan.escrow, plan.amountRaw);
    await approveTx.wait(1);
  }

  const escrowC = new ethers.Contract(
    plan.escrow,
    ["function tip(bytes32 channelIdHash, uint256 amount, string message)"],
    signer
  );

  const tx = await escrowC.tip(plan.channelIdHash, plan.amountRaw, plan.message);
  await tx.wait(1);
  return tx.hash;
}

// ---------- UI ----------
function createModal(onSubmit: (req: TipRequest) => Promise<void>) {
  const root = document.createElement("div");
  root.style.position = "fixed";
  root.style.inset = "0";
  root.style.zIndex = "999999";
  root.style.background = "rgba(0,0,0,0.45)";
  root.style.display = "flex";
  root.style.alignItems = "center";
  root.style.justifyContent = "center";

  const box = document.createElement("div");
  box.style.width = "360px";
  box.style.maxWidth = "92vw";
  box.style.background = "white";
  box.style.borderRadius = "12px";
  box.style.padding = "14px";
  box.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

  const title = document.createElement("div");
  title.textContent = "TipMNEE";
  title.style.fontWeight = "800";
  title.style.fontSize = "16px";
  title.style.marginBottom = "10px";

  const amount = document.createElement("input");
  amount.placeholder = "Amount (e.g. 1.0)";
  amount.inputMode = "decimal";
  amount.style.width = "100%";
  amount.style.padding = "10px";
  amount.style.border = "1px solid #ddd";
  amount.style.borderRadius = "10px";
  amount.style.marginBottom = "8px";

  const message = document.createElement("input");
  message.placeholder = "Message (optional)";
  message.style.width = "100%";
  message.style.padding = "10px";
  message.style.border = "1px solid #ddd";
  message.style.borderRadius = "10px";
  message.style.marginBottom = "10px";

  const status = document.createElement("div");
  status.style.fontSize = "12px";
  status.style.opacity = "0.85";
  status.style.minHeight = "18px";
  status.style.marginBottom = "8px";

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "8px";

  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  cancel.style.flex = "1";
  cancel.style.padding = "10px";
  cancel.style.borderRadius = "10px";
  cancel.style.border = "1px solid #ddd";
  cancel.style.cursor = "pointer";

  const send = document.createElement("button");
  send.textContent = "Send Tip";
  send.style.flex = "1";
  send.style.padding = "10px";
  send.style.borderRadius = "10px";
  send.style.border = "1px solid #111";
  send.style.background = "#111";
  send.style.color = "white";
  send.style.cursor = "pointer";

  cancel.onclick = () => root.remove();

  send.onclick = async () => {
    const a = amount.value.trim();
    if (!a) {
      status.textContent = "Enter an amount.";
      return;
    }

    send.disabled = true;
    cancel.disabled = true;
    status.textContent = "Preparing...";

    try {
      const channelId = getChannelId();
      if (!channelId) throw new Error("Could not find channelId on this page.");

      await onSubmit({ channelId, amount: a, message: message.value.trim() });

      status.textContent = "Done ✅";
      setTimeout(() => root.remove(), 900);
    } catch (e) {
      status.textContent = `Error: ${(e as Error).message}`;
      send.disabled = false;
      cancel.disabled = false;
    }
  };

  row.append(cancel, send);
  box.append(title, amount, message, status, row);
  root.append(box);
  return root;
}

// ---------- button injection ----------
function findActionBar(): HTMLElement | null {
  return document.querySelector<HTMLElement>("#top-level-buttons-computed");
}

function addTipButton() {
  if (location.pathname !== "/watch") return;

  const bar = findActionBar();
  if (!bar) return;
  if (bar.querySelector("[data-tipmnee='1']")) return;

  const btn = document.createElement("button");
  btn.textContent = "Tip";
  btn.setAttribute("data-tipmnee", "1");
  btn.style.padding = "8px 12px";
  btn.style.borderRadius = "18px";
  btn.style.border = "1px solid rgba(0,0,0,0.15)";
  btn.style.cursor = "pointer";
  btn.style.marginLeft = "8px";

  btn.onclick = async () => {
    const modal = createModal(async ({ channelId, amount, message }) => {
      const res = await resolvePayout(channelId);
      const amountRaw = ethers.parseUnits(amount, CONFIG.TOKEN_DECIMALS).toString();

      let plan: TxPlan;
      if (res.status === "direct") {
        plan = { kind: "DIRECT", to: res.address, token: CONFIG.TOKEN_CONTRACT, amountRaw };
      } else {
        const channelIdHash = ethers.keccak256(ethers.toUtf8Bytes(channelId));
        plan = {
          kind: "ESCROW",
          escrow: CONFIG.ESCROW_CONTRACT,
          token: CONFIG.TOKEN_CONTRACT,
          channelId,
          channelIdHash,
          amountRaw,
          message: message ?? "",
        };
      }

      const txHash = await sendTx(plan);
      await ingestDeposit(txHash, channelId);
    });

    document.body.appendChild(modal);
  };

  bar.appendChild(btn);
}

const obs = new MutationObserver(() => addTipButton());
obs.observe(document.documentElement, { childList: true, subtree: true });
addTipButton();
