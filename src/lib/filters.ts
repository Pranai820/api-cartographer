import type { EndpointGroup } from "./types";

export interface EndpointFilters {
  search: string;
  origin: string;
  method: string;
  status: string;
  contentType: string;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

export function listMethods(groups: EndpointGroup[]): string[] {
  return uniqueSorted(groups.map((group) => group.method.toUpperCase()));
}

export function listStatusCodes(groups: EndpointGroup[]): string[] {
  return uniqueSorted(groups.flatMap((group) => Object.keys(group.statusCounts))).sort((left, right) => Number(left) - Number(right));
}

export function listContentTypes(groups: EndpointGroup[]): string[] {
  return uniqueSorted(groups.flatMap((group) => group.samples.map((sample) => sample.mimeType ?? "")));
}

export function filterEndpointGroups(groups: EndpointGroup[], filters: EndpointFilters): EndpointGroup[] {
  const normalizedSearch = filters.search.trim().toLowerCase();

  return groups.filter((group) => {
    const matchesSearch =
      !normalizedSearch ||
      `${group.method} ${group.origin}${group.pathTemplate}`.toLowerCase().includes(normalizedSearch);
    const matchesOrigin = filters.origin === "all" || group.origin === filters.origin;
    const matchesMethod = filters.method === "all" || group.method.toUpperCase() === filters.method;
    const matchesStatus = filters.status === "all" || Boolean(group.statusCounts[filters.status]);
    const matchesContentType =
      filters.contentType === "all" || group.samples.some((sample) => sample.mimeType === filters.contentType);

    return matchesSearch && matchesOrigin && matchesMethod && matchesStatus && matchesContentType;
  });
}
