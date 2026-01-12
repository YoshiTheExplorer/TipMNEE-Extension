console.log('TipMNEE: Content script loaded for YouTube');

// Inject inpage.js into the main world
const script = document.createElement('script');
script.src = chrome.runtime.getURL('src/inpage.js');
script.onload = function() {
  this.remove(); // Clean up script tag after loading
};
(document.head || document.documentElement).appendChild(script);


// Config
const BUTTON_ID = 'tipmnee-tip-button';
const MODAL_ID = 'tipmnee-modal-overlay';

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

  // Event Listeners
  document.getElementById('tipmnee-cancel').addEventListener('click', closeModal);
  document.getElementById('tipmnee-confirm').addEventListener('click', () => {
    const amount = document.getElementById('tipmnee-amount').value;
    const message = document.getElementById('tipmnee-message').value;
    
    // Dispatch event to inpage.js
    window.dispatchEvent(new CustomEvent('TIPMNEE_SEND_TIP', {
      detail: { amount, message }
    }));
    
    closeModal();
  });
  
  // Close on click outside
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
}

function openModal() {
  createModal(); // Ensure it exists
  const modal = document.getElementById(MODAL_ID);
  if (modal) modal.classList.add('open');
}

function closeModal() {
  const modal = document.getElementById(MODAL_ID);
  if (modal) {
    modal.classList.remove('open');
    // Reset fields
    document.getElementById('tipmnee-amount').value = '';
    document.getElementById('tipmnee-message').value = '';
  }
}

function injectTipButton() {
  if (document.getElementById(BUTTON_ID)) return; // Already injected

  // Find the container where the buttons are
  const buttonsContainer = document.querySelector('#top-level-buttons-computed');
  
  if (!buttonsContainer) return;

  console.log('TipMNEE: Found button container, injecting button...');

  // Create the button element
  const tipButton = document.createElement('button');
  tipButton.id = BUTTON_ID;
  tipButton.className = 'yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m';
  tipButton.textContent = 'Tip';
  
  // Styling
  tipButton.style.marginRight = '8px';
  tipButton.style.marginLeft = '8px';
  tipButton.style.fontWeight = '500';
  tipButton.style.cursor = 'pointer';

  // Add click handler
  tipButton.addEventListener('click', () => {
    console.log('TipMNEE: Opening modal...');
    openModal();
  });

  // Insert it as the first item
  buttonsContainer.insertBefore(tipButton, buttonsContainer.firstChild);
}

// Observer to handle dynamic loading (SPA)
const observer = new MutationObserver((mutations) => {
  if (!document.getElementById(BUTTON_ID)) {
    injectTipButton();
  }
});

// Start observing the body for changes
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Initial check
injectTipButton();

// Listen for navigation events (optional, but Observer usually covers it)
document.addEventListener('yt-navigate-finish', () => {
   console.log('TipMNEE: Navigation detected');
   // Give it a moment for the DOM to settle
   setTimeout(injectTipButton, 1000);
});
