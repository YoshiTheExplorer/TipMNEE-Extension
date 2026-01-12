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
    // Contract logic assumed: keccak256(abi.encodePacked(channelId))
    // In Solidity: channelHash("UC...") -> keccak256(bytes("UC..."))
    // In Ethers: keccak256(toUtf8Bytes(channelId))
    // Wait, the ABI has a helper function `channelHash(string)`. We can use that if we want to be 100% sure.
    // BUT pure functions call requires read, we can just compute it locally to save a call.
    // Solidity: keccak256(abi.encodePacked(str)) == Ethers: keccak256(toUtf8Bytes(str))
    
    // NOTE (Important): The previous user request mentioned `channelHash` function in contract.
    // Let's compute it locally as it's faster/cheaper.
    const channelIdHash = keccak256(toUtf8Bytes(channelId));
    console.log('TipMNEE: Computed Channel Hash:', channelIdHash);

    // 6. Check Allowance (Optional optimization, but good practice)
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

  } catch (error) {
    console.error('TipMNEE: Transaction failed', error);
    alert('TipMNEE Action Failed: ' + (error.shortMessage || error.message));
  }
});
