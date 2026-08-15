import { groupRequests } from "./request-model";
import type { CapturedRequest, EndpointGroup, HttpMethod } from "./types";

export type EndpointDiffStatus = "added" | "removed" | "changed" | "unchanged";

export interface EndpointDiffEntry {
  id: string;
  origin: string;
  method: HttpMethod;
  pathTemplate: string;
  status: EndpointDiffStatus;
  baseCount: number;
  compareCount: number;
  countDelta: number;
  addedStatusCodes: string[];
  removedStatusCodes: string[];
}

export interface SessionDiffSummary {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
}

export interface SessionDiff {
  entries: EndpointDiffEntry[];
  summary: SessionDiffSummary;
}

const STATUS_RANK: Record<EndpointDiffStatus, number> = {
  added: 0,
  removed: 1,
  changed: 2,
  unchanged: 3
};

function statusCodesOf(group: EndpointGroup | undefined): string[] {
  return group ? Object.keys(group.statusCounts).sort((left, right) => Number(left) - Number(right)) : [];
}

function missingFrom(values: string[], other: string[]): string[] {
  return values.filter((value) => !other.includes(value));
}

function byId(groups: EndpointGroup[]): Map<string, EndpointGroup> {
  return new Map(groups.map((group) => [group.id, group]));
}

function resolveStatus(
  base: EndpointGroup | undefined,
  compare: EndpointGroup | undefined,
  countDelta: number,
  statusCodeChanges: number
): EndpointDiffStatus {
  if (!base) {
    return "added";
  }

  if (!compare) {
    return "removed";
  }

  return countDelta !== 0 || statusCodeChanges > 0 ? "changed" : "unchanged";
}

/**
 * Compares two grouped captures endpoint-by-endpoint.
 * `base` is the earlier capture and `compare` the later one, so an endpoint
 * only present in `compare` reads as "added".
 */
export function diffEndpointGroups(base: EndpointGroup[], compare: EndpointGroup[]): SessionDiff {
  const baseGroups = byId(base);
  const compareGroups = byId(compare);
  const ids = Array.from(new Set([...baseGroups.keys(), ...compareGroups.keys()]));

  const entries = ids
    .map((id) => {
      const baseGroup = baseGroups.get(id);
      const compareGroup = compareGroups.get(id);
      const reference = compareGroup ?? baseGroup;

      if (!reference) {
        return undefined;
      }

      const baseStatusCodes = statusCodesOf(baseGroup);
      const compareStatusCodes = statusCodesOf(compareGroup);
      const addedStatusCodes = missingFrom(compareStatusCodes, baseStatusCodes);
      const removedStatusCodes = missingFrom(baseStatusCodes, compareStatusCodes);
      const baseCount = baseGroup?.count ?? 0;
      const compareCount = compareGroup?.count ?? 0;
      const countDelta = compareCount - baseCount;

      return {
        id,
        origin: reference.origin,
        method: reference.method,
        pathTemplate: reference.pathTemplate,
        status: resolveStatus(baseGroup, compareGroup, countDelta, addedStatusCodes.length + removedStatusCodes.length),
        baseCount,
        compareCount,
        countDelta,
        addedStatusCodes,
        removedStatusCodes
      } satisfies EndpointDiffEntry;
    })
    .filter((entry): entry is EndpointDiffEntry => Boolean(entry))
    .sort(
      (left, right) =>
        STATUS_RANK[left.status] - STATUS_RANK[right.status] ||
        left.origin.localeCompare(right.origin) ||
        left.pathTemplate.localeCompare(right.pathTemplate) ||
        left.method.localeCompare(right.method)
    );

  const summary: SessionDiffSummary = { added: 0, removed: 0, changed: 0, unchanged: 0 };

  for (const entry of entries) {
    summary[entry.status] += 1;
  }

  return { entries, summary };
}

/** Groups both request sets before diffing, for callers holding raw captures. */
export function diffCapturedRequests(base: CapturedRequest[], compare: CapturedRequest[]): SessionDiff {
  return diffEndpointGroups(groupRequests(base), groupRequests(compare));
}

/** Drops endpoints that look identical in both captures. */
export function onlyChangedEntries(diff: SessionDiff): EndpointDiffEntry[] {
  return diff.entries.filter((entry) => entry.status !== "unchanged");
}

export function formatCountDelta(countDelta: number): string {
  if (countDelta === 0) {
    return "0";
  }

  return countDelta > 0 ? `+${countDelta}` : String(countDelta);
}

export function describeSessionDiff(summary: SessionDiffSummary): string {
  return `${summary.added} added, ${summary.removed} removed, ${summary.changed} changed, ${summary.unchanged} unchanged`;
}
