chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    "api-cartographer:installedAt": new Date().toISOString()
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "api-cartographer:get-status") {
    return false;
  }

  chrome.storage.local.get(["api-cartographer:requests", "api-cartographer:installedAt"], (result) => {
    const requests = Array.isArray(result["api-cartographer:requests"])
      ? result["api-cartographer:requests"]
      : [];

    sendResponse({
      installedAt: result["api-cartographer:installedAt"],
      capturedRequestCount: requests.length
    });
  });

  return true;
});