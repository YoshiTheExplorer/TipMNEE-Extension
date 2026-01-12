import { ethers } from "ethers";
import type { InpageRequest, InpageResponse, TxPlan } from "./shared/types";

const REQ = "TIPMNEE_REQUEST";
const RES = "TIPMNEE_RESPONSE";

function post(nonce: string, payload: InpageResponse) {
  window.postMessage({ __tipmnee: RES, nonce, payload }, "*");
}

async function ensureChain(provider: ethers.BrowserProvider, wantedChainId: number) {
  const net = await provider.getNetwork();
  const current = Number(net.chainId);
  if (current === wantedChainId) return;

  const hex = "0x" + wantedChainId.toString(16);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eth = (window as any).ethereum;

  await eth.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: hex }],
  });
}

async function sendDirect(signer: ethers.Signer, token: string, to: string, amountRaw: string) {
  const erc20 = new ethers.Contract(
    token,
    ["function transfer(address to, uint256 amount) returns (bool)"],
    signer
  );
  return await erc20.transfer(to, amountRaw);
}

async function sendEscrow(
  signer: ethers.Signer,
  token: string,
  escrow: string,
  channelIdHash: string,
  amountRaw: string,
  message: string
) {
  // If escrow pulls tokens via transferFrom, we need approve.
  const erc20 = new ethers.Contract(
    token,
    [
      "function allowance(address owner, address spender) view returns (uint256)",
      "function approve(address spender, uint256 amount) returns (bool)",
    ],
    signer
  );

  const owner = await signer.getAddress();
  const allowance: bigint = await erc20.allowance(owner, escrow);
  if (allowance < BigInt(amountRaw)) {
    const approveTx = await erc20.approve(escrow, amountRaw);
    await approveTx.wait(1);
  }

  // Adjust ABI if your TipEscrow tip signature differs
  const escrowC = new ethers.Contract(
    escrow,
    ["function tip(bytes32 channelIdHash, uint256 amount, string message)"],
    signer
  );

  return await escrowC.tip(channelIdHash, amountRaw, message);
}

async function sendTx(provider: ethers.BrowserProvider, plan: TxPlan) {
  const signer = await provider.getSigner();
  if (plan.kind === "DIRECT") {
    return await sendDirect(signer, plan.token, plan.to, plan.amountRaw);
  }
  return await sendEscrow(
    signer,
    plan.token,
    plan.escrow,
    plan.channelIdHash,
    plan.amountRaw,
    plan.message
  );
}

window.addEventListener("message", async (ev) => {
  if (ev.source !== window) return;
  const data = ev.data;
  if (!data || data.__tipmnee !== REQ) return;

  const nonce: string = data.nonce;
  const req: InpageRequest = data.payload;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = (window as any).ethereum;
    if (!eth?.request) throw new Error("No injected wallet found (install MetaMask).");

    const provider = new ethers.BrowserProvider(eth);

    if (req.type === "TIPMNEE_CONNECT") {
      await eth.request({ method: "eth_requestAccounts" });
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const net = await provider.getNetwork();
      post(nonce, { type: "TIPMNEE_CONNECTED", address, chainId: Number(net.chainId) });
      return;
    }

    if (req.type === "TIPMNEE_SEND_TX") {
      await eth.request({ method: "eth_requestAccounts" });
      await ensureChain(provider, req.chainId);
      const tx = await sendTx(provider, req.plan);
      await tx.wait(1);
      post(nonce, { type: "TIPMNEE_TX_SENT", txHash: tx.hash });
      return;
    }
  } catch (e) {
    post(nonce, { type: "TIPMNEE_ERROR", error: (e as Error).message });
  }
});
