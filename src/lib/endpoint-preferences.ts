import type { EndpointGroup } from "./types";

export interface EndpointPreferences {
  pinnedEndpointIds: string[];
  ignoredEndpointIds: string[];
}

export const EMPTY_ENDPOINT_PREFERENCES: EndpointPreferences = {
  pinnedEndpointIds: [],
  ignoredEndpointIds: []
};

function without(values: string[], value: string): string[] {
  return values.filter((item) => item !== value);
}

function addUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}

export function isPinned(preferences: EndpointPreferences, endpointId: string): boolean {
  return preferences.pinnedEndpointIds.includes(endpointId);
}

export function isIgnored(preferences: EndpointPreferences, endpointId: string): boolean {
  return preferences.ignoredEndpointIds.includes(endpointId);
}

export function normalizeEndpointPreferences(value: Partial<EndpointPreferences> | undefined): EndpointPreferences {
  return {
    pinnedEndpointIds: Array.isArray(value?.pinnedEndpointIds) ? Array.from(new Set(value.pinnedEndpointIds)) : [],
    ignoredEndpointIds: Array.isArray(value?.ignoredEndpointIds) ? Array.from(new Set(value.ignoredEndpointIds)) : []
  };
}

export function togglePinned(preferences: EndpointPreferences, endpointId: string): EndpointPreferences {
  const pinnedEndpointIds = isPinned(preferences, endpointId)
    ? without(preferences.pinnedEndpointIds, endpointId)
    : addUnique(preferences.pinnedEndpointIds, endpointId);

  return normalizeEndpointPreferences({
    pinnedEndpointIds,
    ignoredEndpointIds: without(preferences.ignoredEndpointIds, endpointId)
  });
}

export function toggleIgnored(preferences: EndpointPreferences, endpointId: string): EndpointPreferences {
  const ignoredEndpointIds = isIgnored(preferences, endpointId)
    ? without(preferences.ignoredEndpointIds, endpointId)
    : addUnique(preferences.ignoredEndpointIds, endpointId);

  return normalizeEndpointPreferences({
    pinnedEndpointIds: without(preferences.pinnedEndpointIds, endpointId),
    ignoredEndpointIds
  });
}

export function applyEndpointPreferences(
  groups: EndpointGroup[],
  preferences: EndpointPreferences,
  showIgnored: boolean
): EndpointGroup[] {
  return groups
    .filter((group) => showIgnored || !isIgnored(preferences, group.id))
    .sort((left, right) => {
      const leftPinned = isPinned(preferences, left.id);
      const rightPinned = isPinned(preferences, right.id);

      if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
      }

      return left.origin.localeCompare(right.origin) || left.pathTemplate.localeCompare(right.pathTemplate) || left.method.localeCompare(right.method);
    });
}
