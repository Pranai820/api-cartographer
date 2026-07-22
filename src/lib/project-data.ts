import { CAPTURED_REQUEST_LIMIT } from "./capture-status";
import { normalizeEndpointPreferences, type EndpointPreferences } from "./endpoint-preferences";
import { normalizeCaptureSessions, type CaptureSession } from "./sessions";
import type { CapturedRequest } from "./types";

export const PROJECT_DATA_FORMAT_VERSION = 1;

export interface ProjectDataSnapshot {
  requests: CapturedRequest[];
  sessions: CaptureSession[];
  endpointPreferences: EndpointPreferences;
}

export interface ProjectDataExport extends ProjectDataSnapshot {
  formatVersion: number;
  exportedAt: string;
}

function isCapturedRequestLike(value: unknown): value is CapturedRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const request = value as Record<string, unknown>;

  return (
    typeof request.id === "string" &&
    typeof request.url === "string" &&
    typeof request.origin === "string" &&
    typeof request.path === "string" &&
    typeof request.pathTemplate === "string" &&
    typeof request.method === "string" &&
    typeof request.status === "number" &&
    typeof request.startedDateTime === "string" &&
    Array.isArray(request.requestHeaders) &&
    Array.isArray(request.responseHeaders) &&
    Array.isArray(request.query)
  );
}

function normalizeCapturedRequests(value: unknown): CapturedRequest[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isCapturedRequestLike).slice(-CAPTURED_REQUEST_LIMIT);
}

export function buildProjectDataExport(snapshot: ProjectDataSnapshot, now = new Date()): ProjectDataExport {
  return {
    formatVersion: PROJECT_DATA_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    requests: normalizeCapturedRequests(snapshot.requests),
    sessions: normalizeCaptureSessions(snapshot.sessions),
    endpointPreferences: normalizeEndpointPreferences(snapshot.endpointPreferences)
  };
}

export function parseProjectDataImport(raw: unknown): ProjectDataSnapshot {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid project data file");
  }

  const value = raw as Partial<ProjectDataExport>;

  if (typeof value.formatVersion !== "number") {
    throw new Error("Project data file is missing a format version");
  }

  return {
    requests: normalizeCapturedRequests(value.requests),
    sessions: normalizeCaptureSessions(value.sessions),
    endpointPreferences: normalizeEndpointPreferences(value.endpointPreferences)
  };
}
