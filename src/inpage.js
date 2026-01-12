// This script runs in the MAIN world, so it can access window.ethereum
console.log('TipMNEE: inpage.js loaded');

// Listen for messages from content.js
window.addEventListener('TIPMNEE_SEND_TIP', async (event) => {
  const { amount, message } = event.detail;
  console.log('TipMNEE: Received tip request in main world', { amount, message });

  if (!window.ethereum) {
    alert('TipMNEE: MetaMask is not installed!');
    return;
  }

  try {
    // 1. Request Account Access
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const account = accounts[0];
    console.log('TipMNEE: Connected account:', account);

    // 2. Placeholder for Transaction Logic
    // In a real scenario, we would construct the transaction data here.
    // For now, we'll just mock a signature or show a simple transaction.
    
    alert(`Ready to send ${amount} ETH (simulated) from ${account}\nMessage: ${message}`);
    
    // Example: Simple ETH Send (not ERC20 yet, just testing connection)
    /*
    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [
        {
          from: account,
          to: account, // Sending to self for test
          value: '0x0', // 0 ETH
        },
      ],
    });
    console.log('TipMNEE: Transaction sent:', txHash);
    */

  } catch (error) {
    console.error('TipMNEE: Transaction failed', error);
    alert('TipMNEE: Transaction failed: ' + error.message);
  }
});
