import type { CapturedRequest } from "./types";

const REQUESTS_KEY = "api-cartographer:requests";

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

export async function loadCapturedRequests(): Promise<CapturedRequest[]> {
  if (!hasChromeStorage()) {
    return [];
  }

  return new Promise((resolve) => {
    chrome.storage.local.get([REQUESTS_KEY], (result) => {
      const requests = result[REQUESTS_KEY];
      resolve(Array.isArray(requests) ? requests : []);
    });
  });
}

export async function saveCapturedRequests(requests: CapturedRequest[]): Promise<void> {
  if (!hasChromeStorage()) {
    return;
  }

  await chrome.storage.local.set({ [REQUESTS_KEY]: requests.slice(-500) });
}

export async function clearCapturedRequests(): Promise<void> {
  if (!hasChromeStorage()) {
    return;
  }

  await chrome.storage.local.remove([REQUESTS_KEY]);
}