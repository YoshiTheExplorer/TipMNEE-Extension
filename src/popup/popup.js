const API_BASE_URL = 'http://localhost:8080';

document.addEventListener('DOMContentLoaded', () => {
  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');
  const authButton = document.getElementById('auth-button');
  const logoutButton = document.getElementById('logout-button');
  const claimButton = document.getElementById('claim-button');

  chrome.storage.local.get(['tipmnee_is_logged_in', 'tipmnee_userid'], (result) => {
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

      // Restore robust messaging with auto-injection
      const sendLoginRequest = () => {
        chrome.tabs.sendMessage(tab.id, { action: 'LOGIN_REQUEST' }, (response) => {
          if (chrome.runtime.lastError) {
              console.log('TipMNEE: Content script missing, injecting...');
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['src/content.js']
              }, () => {
                  if (chrome.runtime.lastError) {
                      alert('Please refresh the page to connect your wallet.');
                  } else {
                      // Small delay for script initialization
                      setTimeout(() => {
                        chrome.tabs.sendMessage(tab.id, { action: 'LOGIN_REQUEST' });
                      }, 200);
                  }
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
        const channelHandle = ytData.items[0].snippet.customUrl || ''; // E.g. @username
        
        // CRITICAL CHECK: Ensure ID isn't empty
        if (!autoChannelId) {
            throw new Error('Discovered Channel ID is empty. Google API returned invalid data.');
        }

        console.log('TipMNEE: Sending verify request for ID:', autoChannelId);

        const { tipmnee_token } = await chrome.storage.local.get('tipmnee_token');
        const verifyRes = await fetch(`${API_BASE_URL}/api/social/youtube/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tipmnee_token}`
          },
          body: JSON.stringify({
            channel_id: autoChannelId,
            access_token: googleToken
          })
        });

        if (verifyRes.ok) {
          chrome.storage.local.set({ 
            tipmnee_is_youtube_verified: true,
            tipmnee_youtube_channel_id: autoChannelId,
            tipmnee_youtube_channel_name: channelTitle,
            tipmnee_youtube_handle: channelHandle
          }, () => {
            alert('Success! Your YouTube account (' + channelTitle + ') is now linked.');
            showDashboard(); // Refresh UI
          });
        } else {
          const errData = await verifyRes.json();
          console.error('TipMNEE: Verification backend error:', errData);
          alert('Verification Failed: ' + (errData.error || 'Unknown error'));
        }

      } catch (err) {
        console.error('Claim failed:', err);
        alert('Claiming failed: ' + err.message);
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      chrome.storage.local.remove(['tipmnee_is_logged_in', 'tipmnee_token', 'tipmnee_userid'], () => showLogin());
    });
  }

  function formatCurrency(raw) {
    const val = parseFloat(raw || "0") / 1e18;
    return "$" + val.toLocaleString('en-US', { minimumFractionDigits: 2 });
  }

  async function showDashboard() {
    loginView.style.display = 'none';
    dashboardView.style.display = 'block';
    
    const { 
        tipmnee_token, 
        tipmnee_is_youtube_verified, 
        tipmnee_youtube_channel_id,
        tipmnee_youtube_channel_name,
        tipmnee_youtube_handle
    } = await chrome.storage.local.get(['tipmnee_token', 'tipmnee_is_youtube_verified', 'tipmnee_youtube_channel_id', 'tipmnee_youtube_channel_name', 'tipmnee_youtube_handle']);
    
    // UI Updates for Verification State
    const channelContainer = document.getElementById('connected-channel-container');
    const channelDisplay = document.getElementById('connected-channel-display');

    if (tipmnee_is_youtube_verified) {
      if (claimButton) claimButton.style.display = 'none';
      if (channelContainer) channelContainer.style.display = 'block';
      
      let displayName = tipmnee_youtube_channel_name || 'Verified Channel';
      if (tipmnee_youtube_handle) displayName += ` (${tipmnee_youtube_handle})`;
      if (channelDisplay) channelDisplay.textContent = displayName;
    } else {
      if (claimButton) claimButton.style.display = 'block';
      if (channelContainer) channelContainer.style.display = 'none';
    }

    const res = await fetch(`${API_BASE_URL}/api/me/earnings`, {
      headers: { 'Authorization': `Bearer ${tipmnee_token}` }
    });
    if (res.ok) {
      const data = await res.json();
      document.getElementById('total-earned-display').textContent = formatCurrency(data.EarnedRaw || data.earned_raw);
      document.getElementById('pending-display').textContent = formatCurrency(data.PendingRaw || data.pending_raw);
      document.getElementById('withdrawn-display').textContent = formatCurrency(data.WithdrawnRaw || data.withdrawn_raw);
    }
  }

  function showLogin() {
    loginView.style.display = 'block';
    dashboardView.style.display = 'none';
  }
});
