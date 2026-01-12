// This script runs in the MAIN world, so it can access window.ethereum
const { BrowserProvider, Contract, parseUnits, keccak256, toUtf8Bytes, encodePacked } = require('ethers');
const { ESCROW_ABI, ERC20_ABI } = require('./abi');

console.log('TipMNEE: inpage.js loaded (bundled with ethers)');

const TOKEN_ADDRESS = '0x291bcF208542fbeCD42030184c242Ac91F40B4Ae'; // ERC20 Token (Sepolia)
const ESCROW_ADDRESS = '0x78B738bbdfa6efDdb817ffCf731F352fe5f780DF'; // Escrow Contract

// --- Helper Functions ---

function getChannelIdFromPage() {
  try {
    if (window.ytInitialPlayerResponse && 
        window.ytInitialPlayerResponse.videoDetails && 
        window.ytInitialPlayerResponse.videoDetails.channelId) {
      return window.ytInitialPlayerResponse.videoDetails.channelId;
    }
    console.warn('TipMNEE: ytInitialPlayerResponse not found or missing channelId');
    return null;
  } catch (e) {
    console.error('TipMNEE: Error extracting Channel ID', e);
    return null;
  }
}

// --- Login Flow ---

window.addEventListener('TIPMNEE_LOGIN_REQUEST', async () => {
  console.log('TipMNEE: Login Request Received');
  const API_BASE_URL = 'http://localhost:8080';

  if (!window.ethereum) {
    alert('MetaMask is not installed!');
    return;
  }

  try {
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();

    console.log('TipMNEE: Authenticating address:', address);

    // 1. Get Challenge Message
    const msgResp = await fetch(`${API_BASE_URL}/api/auth/wallet/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address })
    });
    
    if (!msgResp.ok) throw new Error('Failed to get auth message');
    const { message } = await msgResp.json();
    console.log('TipMNEE: Challenge Message:', message);

    // 2. Sign Message
    const signature = await signer.signMessage(message);
    console.log('TipMNEE: Signature:', signature);

    // 3. Login
    const loginResp = await fetch(`${API_BASE_URL}/api/auth/wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, signature })
    });

    if (!loginResp.ok) {
       const errorText = await loginResp.text();
       throw new Error(`Login failed (${loginResp.status}): ${errorText}`);
    }
    const authData = await loginResp.json(); // Expected: { AccessToken, UserID }
    
    console.log('TipMNEE: Login Successful', authData);

    // 4. Send Success Event back to ContentScript
    window.dispatchEvent(new CustomEvent('TIPMNEE_LOGIN_SUCCESS', {
      detail: authData
    }));
    
    alert('Logged in successfully!');

  } catch (error) {
    console.error('TipMNEE: Login Error', error);
    alert('Login Failed: ' + error.message);
    
    window.dispatchEvent(new CustomEvent('TIPMNEE_LOGIN_FAILURE', {
      detail: { error: error.message }
    }));
  }
});

// --- Main Event Listener ---

window.addEventListener('TIPMNEE_SEND_TIP', async (event) => {
  const { amount, message } = event.detail;
  const channelId = getChannelIdFromPage();
  
  console.log('TipMNEE: Initiating Tip', { amount, message, channelId });

  if (!channelId) {
    alert('TipMNEE Error: Could not find Channel ID on this page. Wait for video to load.');
    return;
  }

  if (!window.ethereum) {
    alert('TipMNEE: MetaMask is not installed!');
    return;
  }

  try {
    // 1. Setup Ethers Provider & Signer
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    
    // 2. Network Check (Sepolia)
    const network = await provider.getNetwork();
    if (network.chainId !== 11155111n) { // Sepolia chainId
       try {
         await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }],
        });
       } catch (err) {
         alert("Please switch to Sepolia network manually.");
         return;
       }
    }

    // 3. Contracts
    const tokenContract = new Contract(TOKEN_ADDRESS, ERC20_ABI, signer);
    const escrowContract = new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);

    // 4. Conversion
    const amountBigInt = parseUnits(amount, 18); // Assuming 18 decimals

    // 5. Hash Channel ID 
    const channelIdHash = keccak256(toUtf8Bytes(channelId));
    console.log('TipMNEE: Computed Channel Hash:', channelIdHash);

    // 6. Check Allowance 
    const currentAllowance = await tokenContract.allowance(signer.address, ESCROW_ADDRESS);
    console.log('TipMNEE: Current Allowance:', currentAllowance.toString());

    if (currentAllowance < amountBigInt) {
        console.log('TipMNEE: Approving...');
        const approveTx = await tokenContract.approve(ESCROW_ADDRESS, amountBigInt);
        console.log('TipMNEE: Approve Tx Sent:', approveTx.hash);
        
        // ALERT USER
        alert("Transaction 1/2 Sent: Approve.\nPlease wait for confirmation...");
        
        // WAIT for mining
        const receipt = await approveTx.wait();
        console.log('TipMNEE: Approve Confirmed:', receipt);
        alert("Transaction 1/2 Confirmed! Sending Tip now...");
    } else {
        console.log('TipMNEE: Sufficient allowance, skipping approve.');
    }

    // 7. Send Tip
    console.log('TipMNEE: Sending Tip...');
    const tipTx = await escrowContract.tip(channelIdHash, amountBigInt, message);
    console.log('TipMNEE: Tip Tx Sent:', tipTx.hash);
    
    alert(`Transaction 2/2 Sent: Tip!\nHash: ${tipTx.hash}\n\nYou can track it on Sepolia Etherscan.`);
    
    // Optional: wait for final confirmation
    await tipTx.wait();
    console.log('TipMNEE: Tip Confirmed!');

    // 8. Notify Backend
    const API_BASE_URL = 'http://localhost:8080'; // TODO: Update this to your production API URL
    const payload = {
      tx_hash: tipTx.hash,
      channel_id: channelId,
      chain_id: Number(network.chainId)
    };

    console.log('TipMNEE: Notifying backend...', payload);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/ledger/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }
      
      const responseData = await response.json();
      console.log('TipMNEE: Backend notification successful', responseData);
      alert('Success! Tip sent and registered.');
      
    } catch (apiError) {
      console.error('TipMNEE: Failed to notify backend', apiError);
      alert('Tip sent, but failed to register with backend. Please contact support with Tx Hash: ' + tipTx.hash);
    }

  } catch (error) {
    console.error('TipMNEE: Transaction failed', error);
    alert('TipMNEE Action Failed: ' + (error.shortMessage || error.message));
  }
});

// --- Claim Flow ---

window.addEventListener('TIPMNEE_CLAIM_REQUEST', async () => {
    console.log('TipMNEE: Claim Request Received');
    const channelId = getChannelIdFromPage();

    if (!channelId) {
        alert('Could not find YouTube Channel ID. Make sure you are on a video or channel page.');
        return;
    }

    console.log('TipMNEE: Sending channel ID to extension:', channelId);
    window.dispatchEvent(new CustomEvent('TIPMNEE_CHANNEL_ID_FOUND', { detail: { channelId } }));
});
