import type { EndpointGroup } from "./types";

export interface EndpointPreferences {
  pinnedEndpointIds: string[];
  ignoredEndpointIds: string[];
  notes: Record<string, string>;
}

export const EMPTY_ENDPOINT_PREFERENCES: EndpointPreferences = {
  pinnedEndpointIds: [],
  ignoredEndpointIds: [],
  notes: {}
};

export const ENDPOINT_NOTE_LIMIT = 2000;

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

function normalizeNotes(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const notes: Record<string, string> = {};

  for (const [endpointId, note] of Object.entries(value as Record<string, unknown>)) {
    if (typeof note !== "string") {
      continue;
    }

    const trimmed = note.trim().slice(0, ENDPOINT_NOTE_LIMIT);

    if (trimmed) {
      notes[endpointId] = trimmed;
    }
  }

  return notes;
}

export function getEndpointNote(preferences: EndpointPreferences, endpointId: string): string {
  return preferences.notes?.[endpointId] ?? "";
}

export function setEndpointNote(
  preferences: EndpointPreferences,
  endpointId: string,
  note: string
): EndpointPreferences {
  return normalizeEndpointPreferences({
    ...preferences,
    notes: { ...preferences.notes, [endpointId]: note }
  });
}

export function normalizeEndpointPreferences(value: Partial<EndpointPreferences> | undefined): EndpointPreferences {
  return {
    pinnedEndpointIds: Array.isArray(value?.pinnedEndpointIds) ? Array.from(new Set(value.pinnedEndpointIds)) : [],
    ignoredEndpointIds: Array.isArray(value?.ignoredEndpointIds) ? Array.from(new Set(value.ignoredEndpointIds)) : [],
    notes: normalizeNotes(value?.notes)
  };
}

export function togglePinned(preferences: EndpointPreferences, endpointId: string): EndpointPreferences {
  const pinnedEndpointIds = isPinned(preferences, endpointId)
    ? without(preferences.pinnedEndpointIds, endpointId)
    : addUnique(preferences.pinnedEndpointIds, endpointId);

  return normalizeEndpointPreferences({
    ...preferences,
    pinnedEndpointIds,
    ignoredEndpointIds: without(preferences.ignoredEndpointIds, endpointId)
  });
}

export function toggleIgnored(preferences: EndpointPreferences, endpointId: string): EndpointPreferences {
  const ignoredEndpointIds = isIgnored(preferences, endpointId)
    ? without(preferences.ignoredEndpointIds, endpointId)
    : addUnique(preferences.ignoredEndpointIds, endpointId);

  return normalizeEndpointPreferences({
    ...preferences,
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
