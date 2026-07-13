import { EMPTY_ENDPOINT_PREFERENCES, normalizeEndpointPreferences, type EndpointPreferences } from "./endpoint-preferences";
import type { CapturedRequest } from "./types";

const REQUESTS_KEY = "api-cartographer:requests";
const ENDPOINT_PREFERENCES_KEY = "api-cartographer:endpoint-preferences";

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

export async function loadEndpointPreferences(): Promise<EndpointPreferences> {
  if (!hasChromeStorage()) {
    return EMPTY_ENDPOINT_PREFERENCES;
  }

  return new Promise((resolve) => {
    chrome.storage.local.get([ENDPOINT_PREFERENCES_KEY], (result) => {
      resolve(normalizeEndpointPreferences(result[ENDPOINT_PREFERENCES_KEY]));
    });
  });
}

export async function saveEndpointPreferences(preferences: EndpointPreferences): Promise<void> {
  if (!hasChromeStorage()) {
    return;
  }

  await chrome.storage.local.set({ [ENDPOINT_PREFERENCES_KEY]: normalizeEndpointPreferences(preferences) });
}
