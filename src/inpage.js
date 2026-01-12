import { BrowserProvider, Contract, parseUnits, keccak256, toUtf8Bytes } from 'ethers';
import { ERC20_ABI, ESCROW_ABI } from './abi';

if (window.tipmnee_inpage_loaded) {
    // console.log('TipMNEE: Inpage script already loaded.');
} else {
    window.tipmnee_inpage_loaded = true;

    const TOKEN_ADDRESS = '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238'.toLowerCase(); 
    const ESCROW_ADDRESS = '0x327f29235e589f2977f5b667356c198d02ad00c0'.toLowerCase();
    const API_BASE_URL = 'http://localhost:8080';

    function getChannelIdFromPage() {
      try {
        if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.videoDetails) {
          return window.ytInitialPlayerResponse.videoDetails.channelId;
        }
        const metaTag = document.querySelector('meta[itemprop="channelId"]');
        if (metaTag) return metaTag.getAttribute('content');
      } catch (e) {
        console.error('TipMNEE: Failed to get Channel ID', e);
      }
      return null;
    }

    window.addEventListener('TIPMNEE_LOGIN_REQUEST', async () => {
      try {
        const provider = new BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        
        const msgResp = await fetch(`${API_BASE_URL}/api/auth/wallet/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address })
        });
        
        if (!msgResp.ok) throw new Error('Failed to get auth message');
        const msgData = await msgResp.json();
        const messageToSign = msgData.canonical || msgData.message;
        
        const signature = await signer.signMessage(messageToSign);
        
        const loginResp = await fetch(`${API_BASE_URL}/api/auth/wallet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, signature })
        });

        if (!loginResp.ok) {
           const errorText = await loginResp.text();
           throw new Error(`Login failed (${loginResp.status}): ${errorText}`);
        }
        const authData = await loginResp.json();
        
        window.dispatchEvent(new CustomEvent('TIPMNEE_LOGIN_SUCCESS', { detail: authData }));
        alert('Logged in successfully!');

      } catch (error) {
        console.error('TipMNEE: Login Error', error);
        alert('Login Failed: ' + error.message);
        window.dispatchEvent(new CustomEvent('TIPMNEE_LOGIN_FAILURE', { detail: { error: error.message } }));
      }
    });

    window.addEventListener('TIPMNEE_SEND_TIP', async (event) => {
      const { amount, message } = event.detail;
      const channelId = getChannelIdFromPage();
      
      try {
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const network = await provider.getNetwork();
        
        if (network.chainId !== 11155111n) {
           await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] });
        }

        const tokenContract = new Contract(TOKEN_ADDRESS, ERC20_ABI, signer);
        const escrowContract = new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
        const amountBigInt = parseUnits(amount, 18);
        const channelIdHash = keccak256(toUtf8Bytes(channelId));

        const currentAllowance = await tokenContract.allowance(signer.address, ESCROW_ADDRESS);
        if (currentAllowance < amountBigInt) {
            const approveTx = await tokenContract.approve(ESCROW_ADDRESS, amountBigInt);
            alert("Transaction 1/2 Sent: Approve. Please wait...");
            await approveTx.wait();
        }

        const tipTx = await escrowContract.tip(channelIdHash, amountBigInt, message);
        alert("Transaction 2/2 Sent: Tip. Please wait...");
        await tipTx.wait();

        // 3. Notify Content Script to handle backend registration
        window.dispatchEvent(new CustomEvent('TIPMNEE_TX_COMPLETED', {
            detail: {
                tx_hash: tipTx.hash,
                channel_id: channelId,
                amount: amount,
                message: message
            }
        }));
        alert('Success! Transaction confirmed on-chain.');
        
      } catch (error) {
        alert('TipMNEE Action Failed: ' + (error.shortMessage || error.message));
      }
    });

    window.addEventListener('TIPMNEE_CLAIM_REQUEST', async () => {
        const channelId = getChannelIdFromPage();
        if (!channelId) {
            alert('Could not find YouTube Channel ID.');
            return;
        }
        window.dispatchEvent(new CustomEvent('TIPMNEE_CHANNEL_ID_FOUND', { detail: { channelId } }));
    });
}
