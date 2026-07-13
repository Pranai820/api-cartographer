import type { CapturedRequest } from "./types";

export interface CaptureSession {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  requests: CapturedRequest[];
}

function sessionName(name: string, fallbackDate: Date): string {
  const trimmed = name.trim();
  return trimmed || `Capture ${fallbackDate.toLocaleString()}`;
}

export function createCaptureSession(name: string, requests: CapturedRequest[], now = new Date()): CaptureSession {
  const timestamp = now.toISOString();

  return {
    id: crypto.randomUUID(),
    name: sessionName(name, now),
    createdAt: timestamp,
    updatedAt: timestamp,
    requests: [...requests]
  };
}

export function normalizeCaptureSessions(value: unknown): CaptureSession[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((session): session is CaptureSession => {
      return (
        session &&
        typeof session === "object" &&
        typeof session.id === "string" &&
        typeof session.name === "string" &&
        typeof session.createdAt === "string" &&
        typeof session.updatedAt === "string" &&
        Array.isArray(session.requests)
      );
    })
    .map((session) => ({
      ...session,
      requests: session.requests.slice(-500)
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function upsertCaptureSession(sessions: CaptureSession[], nextSession: CaptureSession): CaptureSession[] {
  return normalizeCaptureSessions([nextSession, ...sessions.filter((session) => session.id !== nextSession.id)]).slice(0, 20);
}

export function deleteCaptureSession(sessions: CaptureSession[], sessionId: string): CaptureSession[] {
  return sessions.filter((session) => session.id !== sessionId);
}
