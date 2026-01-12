document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('actionButton');

  if (button) {
    button.addEventListener('click', () => {
      console.log('Login button clicked');
      
      // Example: Send message to background script
      chrome.runtime.sendMessage({ action: 'login' }, (response) => {
        console.log('Response from background:', response);
      });
    });
  }
});
