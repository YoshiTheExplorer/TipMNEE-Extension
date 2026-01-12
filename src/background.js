chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'login') {
    console.log('Login request received in background');
    sendResponse({ status: 'login_initiated' });
  }
  return true; // Keep the message channel open for asynchronous response
});
