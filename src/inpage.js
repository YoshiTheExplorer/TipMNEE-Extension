import { BrowserProvider, Contract, parseUnits, keccak256, toUtf8Bytes } from 'ethers';
import { ERC20_ABI, ESCROW_ABI } from './abi';

if (window.tipmnee_inpage_loaded) {
    // console.log('TipMNEE: Inpage script already loaded.');
} else {
    window.tipmnee_inpage_loaded = true;

    // Default constants (will be overridden by config if available)
    let TOKEN_ADDRESS = '0xCF0e825ddfbfcbCf9620eAA6ab3A7c289457107b'.toLowerCase(); 
    let ESCROW_ADDRESS = '0x8cCC7A14Ba1fFc540e4D982568451Ec9D85799Ac'.toLowerCase();
    let CHAIN_ID = 11155111n;
    const API_BASE_URL = 'http://localhost:8080';

    // Try to load config from the script tag attribute
    const scriptTag = document.querySelector('script[data-config]');
    if (scriptTag) {
        try {
            const config = JSON.parse(scriptTag.getAttribute('data-config'));
            
            // Only override if backend provides a valid-looking token address
            if (config.token_contract && config.token_contract.startsWith('0x')) {
                TOKEN_ADDRESS = config.token_contract.toLowerCase();
            }

            // Reject the old escrow address even if the backend sends it
            const oldEscrow = '0x78b738bbdfa6efddb817ffcf731f352fe5f780df';
            const providedEscrow = config.escrow_contract ? config.escrow_contract.toLowerCase() : null;
            
            if (providedEscrow && providedEscrow !== oldEscrow && providedEscrow.startsWith('0x')) {
                ESCROW_ADDRESS = providedEscrow;
            } else if (providedEscrow === oldEscrow) {
                console.warn('TipMNEE: Ignoring stale backend escrow address:', oldEscrow);
            }
            
            if (config.chain_id) CHAIN_ID = BigInt(config.chain_id);
            console.log('TipMNEE: Config Loaded. Token:', TOKEN_ADDRESS, 'Escrow:', ESCROW_ADDRESS);
        } catch (e) {
            console.error('TipMNEE: Failed to parse inpage config', e);
        }
    }

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
      let { amount, message } = event.detail;
      const channelId = getChannelIdFromPage();
      
      if (!channelId) {
          alert('Error: Could not determine the YouTube Channel ID for this video.');
          return;
      }
      
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
          alert('Error: Please enter a valid tip amount.');
          return;
      }
      
      message = message || "";

      try {
        console.log('TipMNEE: Starting tip flow for channel:', channelId, 'amount:', amount);
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        const network = await provider.getNetwork();
        
        console.log('TipMNEE: Connected network:', network.chainId.toString(), 'Current Account:', address);

        if (network.chainId !== CHAIN_ID) {
           console.log('TipMNEE: Switching network to:', CHAIN_ID.toString());
           const hexChainId = '0x' + CHAIN_ID.toString(16);
           await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChainId }] });
        }

        console.log('TipMNEE: Checking contract existence at addresses...');
        const tokenCode = await provider.getCode(TOKEN_ADDRESS);
        const escrowCode = await provider.getCode(ESCROW_ADDRESS);
        
        console.log('TipMNEE: Token Contract Status:', tokenCode === '0x' ? 'NOT FOUND' : 'ACTIVE');
        console.log('TipMNEE: Escrow Contract Status:', escrowCode === '0x' ? 'NOT FOUND' : 'ACTIVE');
        console.log('TipMNEE: Target Token:', TOKEN_ADDRESS);
        console.log('TipMNEE: Target Escrow:', ESCROW_ADDRESS);

        if (tokenCode === '0x' || escrowCode === '0x') {
            throw new Error(`Contracts not found on network ${network.chainId}. Please check if addresses match the active network.`);
        }

        // 1. Resolve Creator
        console.log('TipMNEE: Resolving creator via backend...');
        const resolveResp = await fetch(`${API_BASE_URL}/api/resolve/youtube/${channelId}`);
        if (!resolveResp.ok) throw new Error('Failed to resolve creator status');
        const resolveData = await resolveResp.json();
        console.log('TipMNEE: Resolve result:', resolveData);

        let tx;
        const amountBigInt = parseUnits(amount.toString(), 18);
        const tokenContract = new Contract(TOKEN_ADDRESS, ERC20_ABI, signer);
        const escrowContract = new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
        
        // Use contract's own hashing to be 100% safe
        const channelIdHash = await escrowContract.channelHash(channelId);
        console.log('TipMNEE: Channel ID Hash:', channelIdHash);

        if (resolveData.status === 'direct' && resolveData.address) {
            console.log('TipMNEE: Primary Path -> Direct Transfer to:', resolveData.address);
            tx = await tokenContract.transfer(resolveData.address, amountBigInt);
            alert("Transaction Sent: Direct Tip. Please wait...");
        } else {
            console.log('TipMNEE: Primary Path -> Escrow Tipping');
            const currentAllowance = await tokenContract.allowance(address, ESCROW_ADDRESS);
            console.log('TipMNEE: Current Allowance:', currentAllowance.toString(), 'Required:', amountBigInt.toString());

            if (currentAllowance < amountBigInt) {
                console.log('TipMNEE: Requesting approval...');
                const approveTx = await tokenContract.approve(ESCROW_ADDRESS, amountBigInt);
                alert("Transaction 1/2 Sent: Approve. Please wait...");
                await approveTx.wait();
                console.log('TipMNEE: Approval confirmed.');
            }

            console.log('TipMNEE: Sending tip transaction...');
            tx = await escrowContract.tip(channelIdHash, amountBigInt, message);
            alert("Transaction 2/2 Sent: Tip (Escrow). Please wait...");
        }

        console.log('TipMNEE: Transaction hash:', tx.hash);
        await tx.wait();
        console.log('TipMNEE: Transaction confirmed on-chain.');

        // 3. Notify Content Script to handle backend registration
        window.dispatchEvent(new CustomEvent('TIPMNEE_TX_COMPLETED', {
            detail: {
                tx_hash: tx.hash,
                channel_id: channelId,
                amount: amount,
                message: message
            }
        }));
        alert('Success! Transaction confirmed on-chain.');
        
      } catch (error) {
        console.error('TipMNEE: Tip failed with full error:', error);
        alert('TipMNEE Action Failed: ' + (error.shortMessage || error.message || 'Unknown error. Check console.'));
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

    window.addEventListener('TIPMNEE_WITHDRAW_REQUEST', async (event) => {
        const { channelId } = event.detail;
        if (!channelId) {
            alert('Error: No Channel ID provided for withdrawal.');
            return;
        }

        try {
            const provider = new BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const address = await signer.getAddress();
            const network = await provider.getNetwork();
            
            if (network.chainId !== CHAIN_ID) {
               const hexChainId = '0x' + CHAIN_ID.toString(16);
               await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChainId }] });
            }

            const escrowContract = new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
            
            // Use contract's own hashing to be 100% safe
            const channelIdHash = await escrowContract.channelHash(channelId);
            console.log('TipMNEE: Withdrawal for Channel ID Hash:', channelIdHash);

            // 1. Check if we need to claim first or if already claimed
            const payoutAddr = await escrowContract.payoutOf(channelIdHash);
            console.log('TipMNEE: Current Payout Address for channel:', payoutAddr);
            
            if (payoutAddr === '0x0000000000000000000000000000000000000000') {
               // Must CLAIM first
               console.log('TipMNEE: Channel not yet claimed in contract. Requesting claim signature from backend...');
               
               alert('Linking your wallet to this channel on-chain. Please sign the claim transaction.');
               
               // Ask the content script to get the signature from the backend
               const signatureData = await new Promise((resolve, reject) => {
                   const onSig = (e) => {
                       window.removeEventListener('TIPMNEE_CLAIM_SIGNATURE_RECEIVED', onSig);
                       if (e.detail.error) reject(new Error(e.detail.error));
                       else resolve(e.detail);
                   };
                   window.addEventListener('TIPMNEE_CLAIM_SIGNATURE_RECEIVED', onSig);
                   window.dispatchEvent(new CustomEvent('TIPMNEE_REQUEST_CLAIM_SIGNATURE', { 
                       detail: { channelId, payoutAddress: address } 
                   }));
               });

               console.log('TipMNEE: Received claim signature data:', signatureData);
               
               // DEBUG: Log Contract Domain
               try {
                   const domain = await escrowContract.eip712Domain();
                   console.log('TipMNEE: Contract EIP-712 Domain:', {
                       name: domain.name,
                       version: domain.version,
                       chainId: domain.chainId.toString(),
                       verifyingContract: domain.verifyingContract
                   });
               } catch (e) {
                   console.log('TipMNEE: Could not fetch domain info from contract');
               }

               // Ensure nonce is hex and 32 bytes (64 chars + 0x)
               let nonce = signatureData.nonce;
               if (typeof nonce === 'string') {
                   if (!nonce.startsWith('0x')) nonce = '0x' + nonce;
                   if (nonce.length < 66) nonce = '0x' + nonce.slice(2).padStart(64, '0');
               }
               
               const expiry = BigInt(signatureData.expiry);
               const now = BigInt(Math.floor(Date.now() / 1000));
               
               if (expiry < now) {
                   alert('Error: The claim signature from the backend has expired. Please try again.');
                   return;
               }

               console.log('TipMNEE: Executing claim(...) with params:', {
                   channelIdHash,
                   address,
                   expiry: expiry.toString(),
                   nonce,
                   signature: signatureData.signature
               });

               const claimTx = await escrowContract.claim(
                   channelIdHash,
                   address,
                   expiry,
                   nonce,
                   signatureData.signature
               );
               alert('Claim Transaction Sent. Please wait...');
               await claimTx.wait();
               console.log('TipMNEE: Claim confirmed.');
            }

            // 2. Perform withdrawal
            const balance = await escrowContract.balanceOf(channelIdHash);
            console.log('TipMNEE: Current on-chain balance:', balance.toString());

            if (balance === 0n) {
                alert('On-chain balance for this channel is 0. Nothing more to withdraw.');
                return;
            }

            const formattedBalance = parseFloat(balance) / 1e18;
            alert(`Withdrawing ${formattedBalance} tokens...`);
            
            console.log('TipMNEE: Executing withdraw(...)');
            const withdrawTx = await escrowContract.withdraw(channelIdHash);
            alert("Withdrawal Transaction Sent. Please wait...");
            await withdrawTx.wait();
            console.log('TipMNEE: Withdrawal confirmed.');

            // 4. Notify backend
            window.dispatchEvent(new CustomEvent('TIPMNEE_WITHDRAWAL_COMPLETED', {
                detail: {
                    tx_hash: withdrawTx.hash,
                    channel_id: channelId,
                    amount: balance.toString()
                }
            }));

            alert('Withdrawal successful!');

        } catch (error) {
            console.error('TipMNEE: Withdrawal/Claim Failed:', error);
            alert('Withdrawal Failed: ' + (error.shortMessage || error.message || 'Unknown error. Check console.'));
        }
    });
}
