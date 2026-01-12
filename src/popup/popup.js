document.addEventListener('DOMContentLoaded', () => {
  console.log('TipMNEE Popup: Loaded');
  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');
  const userIdDisplay = document.getElementById('user-id-display');
  
  const authButton = document.getElementById('auth-button');
  const logoutButton = document.getElementById('logout-button');

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
      
      if (!tab || !tab.id) {
        alert('Please open this extension on a YouTube page.');
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: 'LOGIN_REQUEST' }, (response) => {
        if (chrome.runtime.lastError) {
           console.warn('TipMNEE Popup Error:', chrome.runtime.lastError.message);
           alert('Could not connect to page. Refresh the YouTube tab and try again.');
           return;
        }
        console.log('TipMNEE Popup: Sent request, response:', response);
        // window.close(); // Keep open for debugging
      });
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

  function showDashboard(userId) {
    loginView.style.display = 'none';
    dashboardView.style.display = 'block';
    if (userId) {
        // Truncate if long
        userIdDisplay.textContent = userId.length > 20 ? userId.substring(0, 6) + '...' + userId.substring(userId.length - 4) : userId;
    }
  }

  function showLogin() {
    loginView.style.display = 'block';
    dashboardView.style.display = 'none';
  }
});

