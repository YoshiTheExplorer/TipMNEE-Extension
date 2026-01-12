document.addEventListener('DOMContentLoaded', () => {
  console.log('TipMNEE Popup: Loaded');
  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');
  
  const authButton = document.getElementById('auth-button');
  const logoutButton = document.getElementById('logout-button');
  const claimButton = document.getElementById('claim-button');

  // ... (previous logic)

  // Claim Action
  if (claimButton) {
    claimButton.addEventListener('click', async () => {
      console.log('TipMNEE Popup: Claim Button Clicked');
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.id || !tab.url || !tab.url.includes('youtube.com')) {
        alert('Please go to your YouTube channel page to claim your account.');
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: 'CLAIM_REQUEST' }, (response) => {
        if (chrome.runtime.lastError) {
           console.warn('TipMNEE Popup Error:', chrome.runtime.lastError.message);
           alert('Could not connect to page. Please refresh the tab.');
           return;
        }
        console.log('TipMNEE Popup: Sent claim request');
      });
    });
  }

  // Check Login State
  chrome.storage.local.get(['tipmnee_is_logged_in', 'tipmnee_userid'], (result) => {
    console.log('TipMNEE Popup: Storage state', result);
    if (result.tipmnee_is_logged_in) {
      showDashboard(result.tipmnee_userid);
    } else {
      showLogin();
    }
  });

  // Login Action
  if (authButton) {
    authButton.addEventListener('click', async () => {
      console.log('TipMNEE Popup: Auth Button Clicked');
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
        alert('This extension cannot run on this type of page.');
        return;
      }

      const sendLoginRequest = () => {
        chrome.tabs.sendMessage(tab.id, { action: 'LOGIN_REQUEST' }, (response) => {
          if (chrome.runtime.lastError) {
             console.log('TipMNEE: Initial connection failed, attempting injection...');
             // Fallback: Inject the script manually if it's not there
             chrome.scripting.executeScript({
               target: { tabId: tab.id },
               files: ['src/content.js']
             }, () => {
                if (chrome.runtime.lastError) {
                    console.warn('Injection failed:', chrome.runtime.lastError.message);
                    alert('Could not connect to page. Please refresh the tab.');
                } else {
                    setTimeout(() => {
                        chrome.tabs.sendMessage(tab.id, { action: 'LOGIN_REQUEST' });
                    }, 500);
                }
             });
             return;
          }
          console.log('TipMNEE Popup: Sent request success');
        });
      };

      sendLoginRequest();
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

  // --- Helpers ---

  function formatCurrency(rawAmount) {
      if (!rawAmount || rawAmount === "0") return "$0.00";
      try {
          const val = parseFloat(rawAmount) / 1e18; 
          return "$" + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      } catch (e) {
          return "$0.00";
      }
  }

  async function showDashboard(userId) {
    loginView.style.display = 'none';
    dashboardView.style.display = 'block';
    
    try {
        const { tipmnee_token } = await chrome.storage.local.get('tipmnee_token');
        if (!tipmnee_token) return;

        const API_BASE_URL = 'http://localhost:8080';
        const res = await fetch(`${API_BASE_URL}/api/me/earnings`, {
            headers: { 'Authorization': `Bearer ${tipmnee_token}` }
        });
        
        if (res.ok) {
            const data = await res.json();
            const earned = data.EarnedRaw || data.earned_raw || "0";
            const withdrawn = data.WithdrawnRaw || data.withdrawn_raw || "0";
            const pending = data.PendingRaw || data.pending_raw || "0";

            document.getElementById('total-earned-display').textContent = formatCurrency(earned);
            document.getElementById('pending-display').textContent = formatCurrency(pending);
            document.getElementById('withdrawn-display').textContent = formatCurrency(withdrawn);
        }
    } catch (err) {
        console.error('Earnings fetch error:', err);
    }
  }

  function showLogin() {
    loginView.style.display = 'block';
    dashboardView.style.display = 'none';
  }
});
