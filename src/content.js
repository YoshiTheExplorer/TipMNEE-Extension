if (window.tipmnee_content_loaded) {
    console.log('TipMNEE: Content script already loaded, skipping.');
} else {
    window.tipmnee_content_loaded = true;
    console.log('TipMNEE: Content script loaded');

    // 1. Inject inpage.js into the main world (Needed for Wallet access everywhere)
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('dist/inpage.bundle.js');
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);

    // 2. Messaging Bridge 
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'LOGIN_REQUEST') {
        window.dispatchEvent(new CustomEvent('TIPMNEE_LOGIN_REQUEST'));
        sendResponse({ status: 'initiated' });
      } else if (request.action === 'CLAIM_REQUEST') {
        const onIdFound = (e) => {
            window.removeEventListener('TIPMNEE_CHANNEL_ID_FOUND', onIdFound);
            sendResponse({ channelId: e.detail.channelId });
        };
        window.addEventListener('TIPMNEE_CHANNEL_ID_FOUND', onIdFound);
        window.dispatchEvent(new CustomEvent('TIPMNEE_CLAIM_REQUEST'));
        return true; 
      }
    });

    // 3. Listen for Success from Inpage
    window.addEventListener('TIPMNEE_LOGIN_SUCCESS', (event) => {
      console.log('TipMNEE Content: Login Success Payload:', event.detail);
      const data = event.detail;
      const token = data.AccessToken || data.accessToken || data.access_token || data.token;
      const userId = data.UserID || data.userID || data.userId || data.user_id || data.id;

      chrome.storage.local.set({ 
        tipmnee_token: token, 
        tipmnee_userid: userId,
        tipmnee_is_logged_in: !!token
      }, () => {
        console.log('TipMNEE: Auth data saved to storage. UserID:', userId);
      });
    });

    // --- YouTube Specific Logic (Only runs on youtube.com) ---
    const BUTTON_ID = 'tipmnee-tip-button';
    const MODAL_ID = 'tipmnee-modal-overlay';

    function isYouTube() {
        return window.location.hostname.includes('youtube.com');
    }

    if (isYouTube()) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('src/content.css');
        document.head.appendChild(link);

        function createModal() {
          if (document.getElementById(MODAL_ID)) return;
          const overlay = document.createElement('div');
          overlay.id = MODAL_ID;
          overlay.className = 'tipmnee-modal-overlay';
          overlay.innerHTML = `
            <div class="tipmnee-modal">
              <h2>Send a Tip</h2>
              <div class="tipmnee-field-group">
                <label for="tipmnee-amount">Amount</label>
                <input type="number" id="tipmnee-amount" class="tipmnee-input" placeholder="0.00">
              </div>
              <div class="tipmnee-field-group">
                <label for="tipmnee-message">Message</label>
                <textarea id="tipmnee-message" class="tipmnee-textarea" placeholder="Say something nice..."></textarea>
              </div>
              <div class="tipmnee-modal-actions">
                <button class="tipmnee-btn tipmnee-btn-cancel" id="tipmnee-cancel">Cancel</button>
                <button class="tipmnee-btn tipmnee-btn-confirm" id="tipmnee-confirm">Send Tip</button>
              </div>
            </div>
          `;
          document.body.appendChild(overlay);
          document.getElementById('tipmnee-cancel').addEventListener('click', closeModal);
          document.getElementById('tipmnee-confirm').addEventListener('click', () => {
            const amount = document.getElementById('tipmnee-amount').value;
            const message = document.getElementById('tipmnee-message').value;
            window.dispatchEvent(new CustomEvent('TIPMNEE_SEND_TIP', { detail: { amount, message } }));
            closeModal();
          });
          overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
        }

        function openModal() {
          createModal(); 
          const modal = document.getElementById(MODAL_ID);
          if (modal) modal.classList.add('open');
        }

        function closeModal() {
          const modal = document.getElementById(MODAL_ID);
          if (modal) {
            modal.classList.remove('open');
            document.getElementById('tipmnee-amount').value = '';
            document.getElementById('tipmnee-message').value = '';
          }
        }

        function injectTipButton() {
          if (document.getElementById(BUTTON_ID)) return;
          const buttonsContainer = document.querySelector('#top-level-buttons-computed');
          if (!buttonsContainer) return;
          const tipButton = document.createElement('button');
          tipButton.id = BUTTON_ID;
          tipButton.className = 'yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m';
          tipButton.textContent = 'Tip';
          tipButton.style.marginRight = '8px';
          tipButton.style.marginLeft = '8px';
          tipButton.style.fontWeight = '500';
          tipButton.style.cursor = 'pointer';
          tipButton.addEventListener('click', () => { openModal(); });
          buttonsContainer.insertBefore(tipButton, buttonsContainer.firstChild);
        }

        const observer = new MutationObserver(() => {
            if (!document.getElementById(BUTTON_ID)) injectTipButton();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        injectTipButton();

        document.addEventListener('yt-navigate-finish', () => {
           setTimeout(injectTipButton, 1000);
        });
    }
}
