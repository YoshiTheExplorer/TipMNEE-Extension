const API_BASE_URL = 'http://localhost:8080';

async function fetchConfig() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/config`);
    if (res.ok) {
      const config = await res.json();
      console.log('TipMNEE: Fetched config:', config);
      await chrome.storage.local.set({ tipmnee_config: config });
      return config;
    }
  } catch (err) {
    console.error('TipMNEE: Failed to fetch config:', err);
  }
  return null;
}

document.addEventListener('DOMContentLoaded', () => {
  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');
  const authButton = document.getElementById('auth-button');
  const logoutButton = document.getElementById('logout-button');
  const claimButton = document.getElementById('claim-button');
  const withdrawButton = document.getElementById('withdraw-button');

  // 1. Listen for storage changes to auto-transition from Login to Dashboard
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.tipmnee_is_logged_in?.newValue) {
      console.log('TipMNEE: Login detected via storage change, refreshing UI...');
      showDashboard();
    }
  });

  chrome.storage.local.get(['tipmnee_is_logged_in'], async (result) => {
    await fetchConfig();
    if (result.tipmnee_is_logged_in) showDashboard();
    else showLogin();
  });

  if (authButton) {
    authButton.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
        alert('This extension cannot run on this page.');
        return;
      }

      const sendLoginRequest = () => {
        chrome.tabs.sendMessage(tab.id, { action: 'LOGIN_REQUEST' }, (response) => {
          if (chrome.runtime.lastError) {
              console.log('TipMNEE: Content script missing, injecting...');
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['src/content.js'] // content.js will inject inpage.bundle.js
              }, () => {
                  setTimeout(() => {
                    chrome.tabs.sendMessage(tab.id, { action: 'LOGIN_REQUEST' });
                  }, 500);
              });
          }
        });
      };
      sendLoginRequest();
    });
  }

  if (claimButton) {
    claimButton.addEventListener('click', async () => {
      try {
        console.log('TipMNEE: Starting YouTube claim flow...');
        const googleToken = await new Promise((resolve, reject) => {
          chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(token);
          });
        });

        const ytResp = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true', {
            headers: { 'Authorization': `Bearer ${googleToken}` }
        });
        const ytData = await ytResp.json();
        
        if (!ytData.items || ytData.items.length === 0) {
            throw new Error('No YouTube channel found for this Google account.');
        }

        const autoChannelId = ytData.items[0].id;
        const channelTitle = ytData.items[0].snippet.title;
        console.log('TipMNEE: Found YouTube Channel:', channelTitle, autoChannelId);
        
        claimButton.disabled = true;
        claimButton.textContent = 'Verifying...';

        const { tipmnee_token } = await chrome.storage.local.get('tipmnee_token');
        
        const requestBody = {
            channel_id: autoChannelId,
            access_token: googleToken
        };
        console.log('TipMNEE: Calling /api/social/youtube/verify with payload:', requestBody);

        const verifyRes = await fetch(`${API_BASE_URL}/api/social/youtube/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tipmnee_token}`
          },
          body: JSON.stringify(requestBody)
        });

        if (verifyRes.ok) {
           const logResult = await verifyRes.json();
           console.log('TipMNEE: Verification backend success:', logResult);
           
           // Immediately update storage so Dashboard can reflect it without wait
           await chrome.storage.local.set({ 
               tipmnee_is_youtube_verified: true,
               tipmnee_youtube_channel_id: autoChannelId,
               tipmnee_youtube_channel_name: channelTitle
           });
           
           alert('Success! Your YouTube account is now linked.');
           showDashboard(); 
        } else {
          const errData = await verifyRes.json();
          console.error('TipMNEE: Verification backend error status:', verifyRes.status, errData);
          alert('Verification Failed: ' + (errData.error || errData.message || 'Unknown backend error'));
        }

      } catch (err) {
        console.error('TipMNEE: Claim failed:', err);
        alert('Claiming failed: ' + err.message);
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      chrome.storage.local.clear(() => {
          console.log('TipMNEE: Logged out, storage cleared.');
          showLogin();
      });
    });
  }

  if (withdrawButton) {
    withdrawButton.addEventListener('click', async () => {
      const { tipmnee_youtube_channel_id } = await chrome.storage.local.get('tipmnee_youtube_channel_id');
      
      if (!tipmnee_youtube_channel_id) {
          alert('You must link and verify your YouTube channel before withdrawing.');
          return;
      }

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      withdrawButton.disabled = true;
      withdrawButton.textContent = 'Processing...';

      chrome.tabs.sendMessage(tab.id, { 
        action: 'WITHDRAW_REQUEST', 
        channelId: tipmnee_youtube_channel_id 
      }, (response) => {
          if (chrome.runtime.lastError) {
              console.error('TipMNEE: Withdrawal message failed', chrome.runtime.lastError);
              alert('Connection failed. Please refresh the page.');
          }
          withdrawButton.disabled = false;
          withdrawButton.textContent = 'Withdraw Funds';
      });
    });
  }

  function formatCurrency(raw) {
    const val = parseFloat(raw || "0") / 1e18;
    return "$" + val.toLocaleString('en-US', { minimumFractionDigits: 2 });
  }

  async function showDashboard() {
    loginView.style.display = 'none';
    dashboardView.style.display = 'block';
    
    const { tipmnee_token } = await chrome.storage.local.get('tipmnee_token');
    if (!tipmnee_token) return showLogin();

    // UI elements
    const channelContainer = document.getElementById('connected-channel-container');
    const channelDisplay = document.getElementById('connected-channel-display');
    const totalDisplay = document.getElementById('total-earned-display');
    const pendingDisplay = document.getElementById('pending-display');
    const withdrawnDisplay = document.getElementById('withdrawn-display');

    // 0. Preliminary UI update from storage (vibrant feel)
    const { tipmnee_is_youtube_verified, tipmnee_youtube_channel_name } = await chrome.storage.local.get(['tipmnee_is_youtube_verified', 'tipmnee_youtube_channel_name']);
    if (tipmnee_is_youtube_verified && tipmnee_youtube_channel_name) {
        if (claimButton) claimButton.style.display = 'none';
        if (channelContainer) channelContainer.style.display = 'block';
        if (channelDisplay) channelDisplay.textContent = tipmnee_youtube_channel_name;
        if (withdrawButton) withdrawButton.disabled = false;
    }

    try {
        // Fetch profile and earnings to ensure we have the REAL state from the DB
        console.log('TipMNEE: Hydrating dashboard from backend...');
        const [meRes, earnRes] = await Promise.all([
            fetch(`${API_BASE_URL}/api/me`, { headers: { 'Authorization': `Bearer ${tipmnee_token}` } }),
            fetch(`${API_BASE_URL}/api/me/earnings`, { headers: { 'Authorization': `Bearer ${tipmnee_token}` } })
        ]);

        if (meRes.status === 401) return logoutButton.click();

        if (meRes.ok) {
            const userData = await meRes.json();
            console.log('TipMNEE: Hydrated user data:', userData);

            const socialLinks = userData.social_links || userData.SocialLinks || userData.socialLinks || [];
            const youtube = socialLinks.find(l => l.platform === 'youtube' || l.Platform === 'youtube');
            
            // Robust check: Verification is true if bool is true, or if verified_at exists and is valid
            const isVerified = youtube && (
                youtube.is_verified === true || 
                youtube.isVerified === true || 
                youtube.verified === true ||
                (youtube.verified_at && (youtube.verified_at.Valid || typeof youtube.verified_at === 'string')) ||
                (youtube.VerifiedAt && youtube.VerifiedAt.Valid)
            );

            console.log('TipMNEE: YouTube verified status:', isVerified, youtube);

            if (isVerified) {
                console.log('TipMNEE: Social account verified on backend:', youtube);
                
                // 2. Clear out the claim button and show the channel info
                if (claimButton) claimButton.style.display = 'none';
                if (channelContainer) channelContainer.style.display = 'block';
                if (withdrawButton) withdrawButton.disabled = false;
                
                // Try to find a human-readable name (title, handle, or payout_name)
                const displayName = youtube.metadata?.title || 
                                    youtube.metadata?.Title ||
                                    youtube.metadata?.customUrl || 
                                    youtube.metadata?.Handle ||
                                    youtube.payout_name || 
                                    youtube.PayoutName ||
                                    youtube.channel_id ||
                                    youtube.ChannelID ||
                                    'YouTube Channel';
                                    
                if (channelDisplay) {
                    channelDisplay.textContent = displayName;
                    channelDisplay.title = youtube.channel_id; // Show full ID on hover
                }

                // Sync storage so other parts of the extension know we are verified
                chrome.storage.local.set({ 
                    tipmnee_is_youtube_verified: true,
                    tipmnee_youtube_channel_id: youtube.channel_id,
                    tipmnee_youtube_channel_name: displayName
                });
            } else {
                const { tipmnee_is_youtube_verified } = await chrome.storage.local.get('tipmnee_is_youtube_verified');
                if (!tipmnee_is_youtube_verified) {
                    console.log('TipMNEE: No verified YouTube found on backend or storage.');
                    if (claimButton) claimButton.style.display = 'block';
                    if (channelContainer) channelContainer.style.display = 'none';
                    if (withdrawButton) withdrawButton.disabled = true;
                } else {
                    console.log('TipMNEE: Backend says unverified, but local storage says verified. Trusting local storage.');
                }
            }
        }

        if (earnRes.ok) {
            const data = await earnRes.json();
            totalDisplay.textContent = formatCurrency(data.earned_raw || data.EarnedRaw);
            pendingDisplay.textContent = formatCurrency(data.pending_raw || data.PendingRaw);
            withdrawnDisplay.textContent = formatCurrency(data.withdrawn_raw || data.WithdrawnRaw);
        }
    } catch (e) {
        console.error('TipMNEE: Failed to hydrate dashboard:', e);
    }
  }

  function showLogin() {
    loginView.style.display = 'block';
    dashboardView.style.display = 'none';
  }
});
