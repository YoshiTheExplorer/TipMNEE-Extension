const API_BASE_URL = 'http://localhost:8080';

document.addEventListener('DOMContentLoaded', () => {
  console.log('TipMNEE Popup: Loaded');
  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');
  
  const authButton = document.getElementById('auth-button');
  const logoutButton = document.getElementById('logout-button');
  const claimButton = document.getElementById('claim-button');

  // Check Login State
  chrome.storage.local.get(['tipmnee_is_logged_in', 'tipmnee_userid'], (result) => {
    if (result.tipmnee_is_logged_in) {
      showDashboard(result.tipmnee_userid);
    } else {
      showLogin();
    }
  });

  // Login Action (Blockchain)
  if (authButton) {
    authButton.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id || !tab.url || tab.url.startsWith('chrome://')) {
        alert('Cannot run on this page.'); return;
      }
      chrome.tabs.sendMessage(tab.id, { action: 'LOGIN_REQUEST' });
    });
  }

  // Claim YouTube Action (Global/OAuth)
  if (claimButton) {
    claimButton.addEventListener('click', async () => {
      try {
        console.log('TipMNEE: Starting global claim flow...');
        
        // 1. Get Google OAuth Token
        const googleToken = await new Promise((resolve, reject) => {
          chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(token);
          });
        });

        // 2. Automatically find the Channel ID using the token
        console.log('TipMNEE: Discovering your YouTube channel...');
        const ytResp = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true', {
            headers: { 'Authorization': `Bearer ${googleToken}` }
        });
        
        const ytData = await ytResp.json();
        
        if (!ytData.items || ytData.items.length === 0) {
            throw new Error('No YouTube channel found for this Google account.');
        }

        const autoChannelId = ytData.items[0].id;
        console.log('TipMNEE: Found Channel ID:', autoChannelId);

        // 3. Call your Backend Verify endpoint
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
          alert('Success! Your YouTube account (' + autoChannelId + ') is now linked.');
        } else {
          const err = await verifyRes.json();
          alert('Verification Failed: ' + (err.error || 'Unknown error'));
        }

      } catch (err) {
        console.error('Claim failed:', err);
        alert('Claiming failed: ' + err.message);
      }
    });
  }

  // Logout Action
  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      chrome.storage.local.remove(['tipmnee_is_logged_in', 'tipmnee_token', 'tipmnee_userid'], () => {
        showLogin();
      });
    });
  }

  // Helpers
  function formatCurrency(raw) {
    const val = parseFloat(raw || "0") / 1e18;
    return "$" + val.toLocaleString('en-US', { minimumFractionDigits: 2 });
  }

  async function showDashboard() {
    loginView.style.display = 'none';
    dashboardView.style.display = 'block';
    const { tipmnee_token } = await chrome.storage.local.get('tipmnee_token');
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
