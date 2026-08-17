import {
  Braces,
  CheckCircle2,
  Database,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  FileText,
  Filter,
  Globe2,
  Layers,
  PauseCircle,
  Pin,
  PinOff,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  StickyNote,
  Trash2,
  Upload
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import {
  applyEndpointPreferences,
  EMPTY_ENDPOINT_PREFERENCES,
  ENDPOINT_NOTE_LIMIT,
  getEndpointNote,
  isIgnored,
  isPinned,
  setEndpointNote,
  toggleIgnored,
  togglePinned,
  type EndpointPreferences
} from "../lib/endpoint-preferences";
import { CAPTURED_REQUEST_LIMIT, isAtCaptureLimit, resolveEmptyStateReason } from "../lib/capture-status";
import { buildEndpointOperation, extractRequestSchema, extractResponseSchemas } from "../lib/endpoint-detail";
import { filterEndpointGroups, listContentTypes, listMethods, listStatusCodes } from "../lib/filters";
import { detectFrameworks } from "../lib/framework-detection";
import { formatDuration, formatStatusCounts } from "../lib/format";
import { buildMarkdownReport } from "../lib/markdown-report";
import { buildOpenApiDocument } from "../lib/openapi";
import { buildPostmanCollection } from "../lib/postman-collection";
import { buildProjectDataExport, parseProjectDataImport } from "../lib/project-data";
import { createCapturedRequestFromHarEntry, parseHarLog } from "../lib/request-model";
import { redactCapturedRequest, redactEndpointGroups, type RedactionProfile } from "../lib/redaction";
import { groupRequests } from "../lib/request-model";
import { buildSdkHints } from "../lib/sdk-hints";
import {
  describeSessionDiff,
  diffCapturedRequests,
  formatCountDelta,
  onlyChangedEntries,
  type EndpointDiffEntry,
  type SessionDiff
} from "../lib/session-diff";
import { createCaptureSession, deleteCaptureSession, upsertCaptureSession, type CaptureSession } from "../lib/sessions";
import { resolveNextRowId } from "../lib/table-navigation";
import {
  clearCapturedRequests,
  loadCapturedRequests,
  loadCaptureSessions,
  loadEndpointPreferences,
  saveCapturedRequests,
  saveCaptureSessions,
  saveEndpointPreferences
} from "../lib/storage";
import type { CapturedRequest, EndpointGroup } from "../lib/types";

type DevtoolsRequest = chrome.devtools.network.Request;

const EMPTY_GROUPS: EndpointGroup[] = [];

function downloadTextFile(contents: string, fileName: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [isCapturing, setIsCapturing] = useState(true);
  const [filter, setFilter] = useState("");
  const [originFilter, setOriginFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [contentTypeFilter, setContentTypeFilter] = useState("all");
  const [showIgnored, setShowIgnored] = useState(false);
  const [endpointPreferences, setEndpointPreferences] = useState<EndpointPreferences>(EMPTY_ENDPOINT_PREFERENCES);
  const [sessionName, setSessionName] = useState("Untitled capture");
  const [sessions, setSessions] = useState<CaptureSession[]>([]);
  const [diffBaselineId, setDiffBaselineId] = useState<string | null>(null);
  const [openApiTitle, setOpenApiTitle] = useState("Captured API");
  const [openApiVersion, setOpenApiVersion] = useState("0.1.0");
  const [redactionProfile, setRedactionProfile] = useState<RedactionProfile>("standard");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [lastExportStatus, setLastExportStatus] = useState<string>("idle");
  const [isHydrating, setIsHydrating] = useState(true);
  const listenerAttached = useRef(false);
  const harInputRef = useRef<HTMLInputElement>(null);
  const projectDataInputRef = useRef<HTMLInputElement>(null);
  const isCapturingRef = useRef(isCapturing);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    isCapturingRef.current = isCapturing;
  }, [isCapturing]);

  useEffect(() => {
    Promise.all([
      loadCapturedRequests().then(setRequests),
      loadEndpointPreferences().then(setEndpointPreferences),
      loadCaptureSessions().then(setSessions)
    ]).finally(() => setIsHydrating(false));
  }, []);

  useEffect(() => {
    saveCapturedRequests(requests);
  }, [requests]);

  useEffect(() => {
    saveEndpointPreferences(endpointPreferences);
  }, [endpointPreferences]);

  useEffect(() => {
    saveCaptureSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    if (listenerAttached.current || typeof chrome === "undefined" || !chrome.devtools?.network) {
      return;
    }

    chrome.devtools.network.onRequestFinished.addListener((request: DevtoolsRequest) => {
      if (!isCapturingRef.current) {
        return;
      }

      request.getContent((content, encoding) => {
        setRequests((current) => [
          ...current,
          createCapturedRequestFromHarEntry(request, content ?? undefined, encoding ?? undefined)
        ].slice(-CAPTURED_REQUEST_LIMIT));
      });
    });

    listenerAttached.current = true;
  }, []);

  const groups = useMemo(() => groupRequests(requests), [requests]);
  const origins = useMemo(() => Array.from(new Set(groups.map((group) => group.origin))).sort(), [groups]);
  const methods = useMemo(() => listMethods(groups), [groups]);
  const statusCodes = useMemo(() => listStatusCodes(groups), [groups]);
  const contentTypes = useMemo(() => listContentTypes(groups), [groups]);
  const matchedGroups = useMemo(() => {
    if (!groups.length) {
      return EMPTY_GROUPS;
    }

    return filterEndpointGroups(groups, {
      search: filter,
      origin: originFilter,
      method: methodFilter,
      status: statusFilter,
      contentType: contentTypeFilter
    });
  }, [contentTypeFilter, filter, groups, methodFilter, originFilter, statusFilter]);
  const filteredGroups = useMemo(
    () => applyEndpointPreferences(matchedGroups, endpointPreferences, showIgnored),
    [endpointPreferences, matchedGroups, showIgnored]
  );
  const hiddenIgnoredCount = matchedGroups.length - filteredGroups.length;
  const emptyStateReason = resolveEmptyStateReason(requests.length, filteredGroups.length);
  const atCaptureLimit = isAtCaptureLimit(requests.length);

  const detectedFrameworks = useMemo(() => detectFrameworks(requests), [requests]);
  const diffBaseline = useMemo(
    () => sessions.find((session) => session.id === diffBaselineId) ?? null,
    [diffBaselineId, sessions]
  );
  const sessionDiff = useMemo(
    () => (diffBaseline ? diffCapturedRequests(diffBaseline.requests, requests) : null),
    [diffBaseline, requests]
  );

  const selectedGroup = useMemo(() => {
    return filteredGroups.find((group) => group.id === selectedGroupId) ?? filteredGroups[0];
  }, [filteredGroups, selectedGroupId]);

  useEffect(() => {
    if (selectedGroup && selectedGroup.id !== selectedGroupId) {
      setSelectedGroupId(selectedGroup.id);
    }
  }, [selectedGroup, selectedGroupId]);

  const redactedFilteredGroups = useMemo(
    () => redactEndpointGroups(filteredGroups, redactionProfile),
    [filteredGroups, redactionProfile]
  );
  const openApiJson = useMemo(() => {
    return JSON.stringify(buildOpenApiDocument(redactedFilteredGroups, openApiTitle, openApiVersion), null, 2);
  }, [redactedFilteredGroups, openApiTitle, openApiVersion]);
  const markdownReport = useMemo(() => buildMarkdownReport(redactedFilteredGroups), [redactedFilteredGroups]);
  const postmanCollectionJson = useMemo(() => {
    return JSON.stringify(buildPostmanCollection(redactedFilteredGroups, openApiTitle), null, 2);
  }, [redactedFilteredGroups, openApiTitle]);

  async function copyOpenApi() {
    await navigator.clipboard.writeText(openApiJson);
    setLastExportStatus("OpenAPI copied");
  }

  function downloadOpenApi() {
    downloadTextFile(openApiJson, "api-cartographer-openapi.json", "application/json");
    setLastExportStatus("OpenAPI downloaded");
  }

  async function copyMarkdownReport() {
    await navigator.clipboard.writeText(markdownReport);
    setLastExportStatus("Markdown copied");
  }

  function downloadMarkdownReport() {
    downloadTextFile(markdownReport, "api-cartographer-report.md", "text/markdown");
    setLastExportStatus("Markdown downloaded");
  }

  async function copyPostmanCollection() {
    await navigator.clipboard.writeText(postmanCollectionJson);
    setLastExportStatus("Postman collection copied");
  }

  function downloadPostmanCollection() {
    downloadTextFile(postmanCollectionJson, "api-cartographer.postman_collection.json", "application/json");
    setLastExportStatus("Postman collection downloaded");
  }

  function registerRowRef(endpointId: string, element: HTMLButtonElement | null) {
    if (element) {
      rowRefs.current.set(endpointId, element);
    } else {
      rowRefs.current.delete(endpointId);
    }
  }

  function moveSelection(event: KeyboardEvent<HTMLDivElement>) {
    const nextId = resolveNextRowId(
      event.key,
      filteredGroups.map((group) => group.id),
      selectedGroup?.id ?? null
    );

    if (!nextId) {
      return;
    }

    event.preventDefault();
    setSelectedGroupId(nextId);
    rowRefs.current.get(nextId)?.focus();
  }

  function toggleEndpointPin(endpointId: string) {
    setEndpointPreferences((current) => togglePinned(current, endpointId));
  }

  function toggleEndpointIgnore(endpointId: string) {
    setEndpointPreferences((current) => toggleIgnored(current, endpointId));
  }

  function updateEndpointNote(endpointId: string, note: string) {
    setEndpointPreferences((current) => setEndpointNote(current, endpointId, note));
  }

  function saveCurrentSession() {
    const nextSession = createCaptureSession(sessionName, requests);
    setSessions((current) => upsertCaptureSession(current, nextSession));
    setSessionName(nextSession.name);
    setLastExportStatus("Session saved: " + nextSession.name);
  }

  function restoreSession(session: CaptureSession) {
    setRequests(session.requests);
    setSessionName(session.name);
    setLastExportStatus("Session restored: " + session.name);
  }

  function removeSession(sessionId: string) {
    setSessions((current) => deleteCaptureSession(current, sessionId));
  }

  async function importHarFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const imported = parseHarLog(JSON.parse(await file.text()));

      if (!imported.length) {
        setLastExportStatus("HAR import found no entries");
        return;
      }

      setRequests((current) => [...current, ...imported].slice(-CAPTURED_REQUEST_LIMIT));
      setLastExportStatus(`HAR imported: ${imported.length} request(s)`);
    } catch {
      setLastExportStatus("HAR import failed: invalid file");
    }
  }

  async function resetCapture() {
    setRequests([]);
    await clearCapturedRequests();
  }

  function clearFilters() {
    setFilter("");
    setOriginFilter("all");
    setMethodFilter("all");
    setStatusFilter("all");
    setContentTypeFilter("all");
    setShowIgnored(false);
  }

  function exportProjectData() {
    const projectData = buildProjectDataExport({ requests, sessions, endpointPreferences });
    downloadTextFile(JSON.stringify(projectData, null, 2), "api-cartographer-project.json", "application/json");
    setLastExportStatus("Project data exported");
  }

  async function importProjectDataFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const snapshot = parseProjectDataImport(JSON.parse(await file.text()));
      setRequests(snapshot.requests);
      setSessions(snapshot.sessions);
      setEndpointPreferences(snapshot.endpointPreferences);
      setLastExportStatus(`Project data imported: ${snapshot.requests.length} request(s), ${snapshot.sessions.length} session(s)`);
    } catch {
      setLastExportStatus("Project data import failed: invalid file");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">API Cartographer</p>
          <h1>Network Map</h1>
        </div>
        <div className="topbar-actions">
          <button
            className={isCapturing ? "button button-live" : "button"}
            type="button"
            onClick={() => setIsCapturing((value) => !value)}
            title={isCapturing ? "Pause capture" : "Start capture"}
          >
            {isCapturing ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
            {isCapturing ? "Capturing" : "Paused"}
          </button>
          <button className="icon-button" type="button" onClick={resetCapture} title="Clear captured traffic">
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      <section className="metrics-bar" aria-label="Capture metrics">
        <Metric label="Requests" value={requests.length.toString()} />
        <Metric label="Endpoints" value={groups.length.toString()} />
        <Metric label="Origins" value={origins.length.toString()} />
        <Metric label="Visible" value={filteredGroups.length.toString()} />
        <Metric label="Hidden" value={hiddenIgnoredCount.toString()} />
      </section>

      {atCaptureLimit ? (
        <p className="capture-limit-banner">
          At the {CAPTURED_REQUEST_LIMIT}-request storage limit — oldest requests are dropped as new ones arrive.
        </p>
      ) : null}

      <section className="workspace">
        {isHydrating ? (
          <div className="empty-state workspace-loading">
            <RefreshCw size={18} className="spin-icon" />
            <span>Loading captured data…</span>
          </div>
        ) : (
          <>
          <aside className="filters-panel">
            <div className="control-block">
              <label htmlFor="endpoint-search">
                <Search size={15} />
                Search
              </label>
              <input
                id="endpoint-search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="method, origin, path"
              />
            </div>
  
            <div className="control-block">
              <label htmlFor="origin-filter">
                <Globe2 size={15} />
                Origin
              </label>
              <select id="origin-filter" value={originFilter} onChange={(event) => setOriginFilter(event.target.value)}>
                <option value="all">All origins</option>
                {origins.map((origin) => (
                  <option key={origin} value={origin}>
                    {origin}
                  </option>
                ))}
              </select>
            </div>
            <div className="control-block">
              <label htmlFor="method-filter">
                <Filter size={15} />
                Method
              </label>
              <select id="method-filter" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}>
                <option value="all">All methods</option>
                {methods.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </div>
  
            <div className="control-block">
              <label htmlFor="status-filter">
                <CheckCircle2 size={15} />
                Status
              </label>
              <select id="status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                {statusCodes.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
  
            <div className="control-block">
              <label htmlFor="content-type-filter">
                <FileText size={15} />
                Content Type
              </label>
              <select
                id="content-type-filter"
                value={contentTypeFilter}
                onChange={(event) => setContentTypeFilter(event.target.value)}
              >
                <option value="all">All content types</option>
                {contentTypes.map((contentType) => (
                  <option key={contentType} value={contentType}>
                    {contentType}
                  </option>
                ))}
              </select>
            </div>
            <button className="button button-full" type="button" onClick={() => setShowIgnored((value) => !value)}>
              {showIgnored ? <EyeOff size={16} /> : <Eye size={16} />}
              {showIgnored ? "Hide Ignored" : "Show Ignored"}
            </button>
  
            {detectedFrameworks.length ? (
              <div className="stack-block">
                <p className="block-title">
                  <Layers size={15} />
                  Detected Stack
                </p>
                <div className="stack-chips">
                  {detectedFrameworks.map((detection) => (
                    <span
                      className={`stack-chip stack-chip-${detection.confidence}`}
                      key={detection.id}
                      title={`${detection.confidence} confidence, ${detection.requestCount} request(s)\n${detection.evidence.join("\n")}`}
                    >
                      {detection.label}
                    </span>
                  ))}
                </div>
                <p className="subtle">Inferred locally from response headers, cookie names, and paths. Not included in exports.</p>
              </div>
            ) : null}

            <div className="session-block">
              <p className="block-title">
                <FolderOpen size={15} />
                Sessions
              </p>
              <input
                id="session-name"
                value={sessionName}
                onChange={(event) => setSessionName(event.target.value)}
                placeholder="Capture name"
              />
              <button className="button button-full" type="button" onClick={saveCurrentSession} disabled={!requests.length}>
                <Save size={16} />
                Save Session
              </button>
              {sessions.length ? (
                <>
                  <label htmlFor="diff-baseline" className="subtle">
                    Compare current capture with
                  </label>
                  <select
                    id="diff-baseline"
                    value={diffBaselineId ?? "none"}
                    onChange={(event) => setDiffBaselineId(event.target.value === "none" ? null : event.target.value)}
                  >
                    <option value="none">No comparison</option>
                    {sessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              {sessions.length ? (
                <div className="session-list">
                  {sessions.slice(0, 4).map((session) => (
                    <div className="session-row" key={session.id}>
                      <button className="session-restore" type="button" onClick={() => restoreSession(session)} title="Restore session">
                        <RotateCcw size={14} />
                        <span>{session.name}</span>
                      </button>
                      <button className="endpoint-action" type="button" onClick={() => removeSession(session.id)} title="Delete session">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="export-block">
              <p className="block-title">
                <Upload size={15} />
                Import
              </p>
              <input
                ref={harInputRef}
                type="file"
                accept=".har,application/json"
                hidden
                onChange={importHarFile}
              />
              <button className="button button-full" type="button" onClick={() => harInputRef.current?.click()}>
                <Upload size={16} />
                Import HAR File
              </button>
            </div>
            <div className="export-block">
              <p className="block-title">
                <Database size={15} />
                Project Data
              </p>
              <input
                ref={projectDataInputRef}
                type="file"
                accept="application/json"
                hidden
                onChange={importProjectDataFile}
              />
              <button className="button button-full" type="button" onClick={exportProjectData} disabled={!requests.length && !sessions.length}>
                <Download size={16} />
                Export Project Data
              </button>
              <button className="button button-full" type="button" onClick={() => projectDataInputRef.current?.click()}>
                <Upload size={16} />
                Import Project Data
              </button>
              <p className="subtle">Backup/restore only: replaces current requests, sessions, and preferences with unredacted data from the file.</p>
            </div>
            <div className="export-block">
              <p className="block-title">
                <Braces size={15} />
                OpenAPI
              </p>
              <input
                id="openapi-title"
                value={openApiTitle}
                onChange={(event) => setOpenApiTitle(event.target.value)}
                placeholder="API title"
              />
              <input
                id="openapi-version"
                value={openApiVersion}
                onChange={(event) => setOpenApiVersion(event.target.value)}
                placeholder="Version"
              />
              <label htmlFor="redaction-profile" className="subtle">
                Redaction
              </label>
              <select
                id="redaction-profile"
                value={redactionProfile}
                onChange={(event) => setRedactionProfile(event.target.value as RedactionProfile)}
              >
                <option value="standard">Standard</option>
                <option value="strict">Strict (sharing-safe)</option>
              </select>
              <button className="button button-full" type="button" onClick={copyOpenApi}>
                <CheckCircle2 size={16} />
                Copy JSON
              </button>
              <button className="button button-full" type="button" onClick={downloadOpenApi}>
                <Download size={16} />
                Download JSON
              </button>
              <button className="button button-full" type="button" onClick={copyMarkdownReport}>
                <FileText size={16} />
                Copy Markdown
              </button>
              <button className="button button-full" type="button" onClick={downloadMarkdownReport}>
                <Download size={16} />
                Download MD
              </button>
              <button className="button button-full" type="button" onClick={copyPostmanCollection}>
                <Send size={16} />
                Copy Postman
              </button>
              <button className="button button-full" type="button" onClick={downloadPostmanCollection}>
                <Download size={16} />
                Download Postman
              </button>
              <p className="subtle">
                Postman export uses the API title above as the collection name, with each origin as a {"{{baseUrl}}"} variable.
              </p>
              {lastExportStatus !== "idle" ? <p className="subtle">Last export: {lastExportStatus}.</p> : null}
            </div>
          </aside>
  
          <section className="endpoint-list" aria-label={sessionDiff ? "Session diff" : "Endpoint groups"}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">{diffBaseline ? `vs ${diffBaseline.name}` : "Observed"}</p>
                <h2>{sessionDiff ? "Changes" : "Endpoints"}</h2>
              </div>
              {sessionDiff ? (
                <button className="button" type="button" onClick={() => setDiffBaselineId(null)} title="Exit diff view">
                  <RotateCcw size={16} />
                  Exit Diff
                </button>
              ) : (
                <Filter size={18} />
              )}
            </div>

            {sessionDiff ? (
              <SessionDiffView diff={sessionDiff} />
            ) : filteredGroups.length ? (
              <div className="endpoint-table" role="group" aria-label="Captured endpoints" onKeyDown={moveSelection}>
                {filteredGroups.map((group) => {
                  const pinned = isPinned(endpointPreferences, group.id);
                  const ignored = isIgnored(endpointPreferences, group.id);
                  const selected = group.id === selectedGroup?.id;

                  return (
                    <div
                      className={`endpoint-row${selected ? " endpoint-row-selected" : ""}${
                        pinned ? " endpoint-row-pinned" : ""
                      }${ignored ? " endpoint-row-ignored" : ""}`}
                      key={group.id}
                    >
                      <button
                        className="endpoint-row-main"
                        type="button"
                        aria-current={selected}
                        tabIndex={selected ? 0 : -1}
                        ref={(element) => registerRowRef(group.id, element)}
                        onClick={() => setSelectedGroupId(group.id)}
                      >
                        <span className={`method method-${group.method.toLowerCase()}`}>{group.method}</span>
                        <span className="endpoint-path">{group.pathTemplate}</span>
                        <span className="endpoint-origin">{group.origin}</span>
                        <span className="endpoint-count">{group.count}</span>
                      </button>
                      <div className="endpoint-actions">
                        <button
                          className="endpoint-action"
                          type="button"
                          onClick={() => toggleEndpointPin(group.id)}
                          title={pinned ? "Unpin endpoint" : "Pin endpoint"}
                        >
                          {pinned ? <PinOff size={15} /> : <Pin size={15} />}
                        </button>
                        <button
                          className="endpoint-action"
                          type="button"
                          onClick={() => toggleEndpointIgnore(group.id)}
                          title={ignored ? "Restore endpoint" : "Ignore endpoint"}
                        >
                          {ignored ? <Eye size={15} /> : <EyeOff size={15} />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : emptyStateReason === "filtered-out" ? (
              <div className="empty-state">
                <Filter size={18} />
                <span>No endpoints match the current filters.</span>
                <button className="button" type="button" onClick={clearFilters}>
                  <RotateCcw size={16} />
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="empty-state">
                <RefreshCw size={18} />
                <span>Open a page and use it while DevTools stays open.</span>
              </div>
            )}
          </section>
  
          <section className="detail-panel" aria-label="Endpoint details">
            {selectedGroup ? (
              <EndpointDetail
                group={selectedGroup}
                openApiTitle={openApiTitle}
                openApiVersion={openApiVersion}
                note={getEndpointNote(endpointPreferences, selectedGroup.id)}
                onNoteChange={(note) => updateEndpointNote(selectedGroup.id, note)}
              />
            ) : (
              <div className="empty-state">No endpoint selected.</div>
            )}
          </section>
          </>
        )}
      </section>
    </main>
  );
}

const DIFF_STATUS_LABELS: Record<EndpointDiffEntry["status"], string> = {
  added: "New",
  removed: "Gone",
  changed: "Changed",
  unchanged: "Same"
};

function SessionDiffView({ diff }: { diff: SessionDiff }) {
  const entries = onlyChangedEntries(diff);

  return (
    <>
      <p className="subtle diff-summary">{describeSessionDiff(diff.summary)}</p>

      {entries.length ? (
        <div className="endpoint-table">
          {entries.map((entry) => (
            <div className={`endpoint-row diff-row diff-row-${entry.status}`} key={entry.id}>
              <div className="endpoint-row-main diff-row-main">
                <span className={`diff-status diff-status-${entry.status}`}>{DIFF_STATUS_LABELS[entry.status]}</span>
                <span className={`method method-${entry.method.toLowerCase()}`}>{entry.method}</span>
                <span className="endpoint-path">{entry.pathTemplate}</span>
                <span className="endpoint-origin">{entry.origin}</span>
                <span className="endpoint-count">{formatCountDelta(entry.countDelta)}</span>
              </div>
              {entry.addedStatusCodes.length || entry.removedStatusCodes.length ? (
                <p className="subtle diff-status-codes">
                  {entry.addedStatusCodes.length ? `New statuses: ${entry.addedStatusCodes.join(", ")}. ` : ""}
                  {entry.removedStatusCodes.length ? `Gone: ${entry.removedStatusCodes.join(", ")}.` : ""}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <CheckCircle2 size={18} />
          <span>No endpoint differences against this session.</span>
        </div>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type DetailTab = "samples" | "schema" | "export" | "sdk";

const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "samples", label: "Samples" },
  { id: "schema", label: "Schema" },
  { id: "export", label: "Export Preview" },
  { id: "sdk", label: "SDK Hints" }
];

function EndpointDetail({
  group,
  openApiTitle,
  openApiVersion,
  note,
  onNoteChange
}: {
  group: EndpointGroup;
  openApiTitle: string;
  openApiVersion: string;
  note: string;
  onNoteChange: (note: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>("samples");
  const [draftNote, setDraftNote] = useState(note);
  const sample = group.samples[0] ? redactCapturedRequest(group.samples[0]) : undefined;

  // Notes are trimmed when stored, so the textarea keeps its own draft and
  // only re-seeds from storage when a different endpoint is selected.
  useEffect(() => {
    setDraftNote(note);
  }, [group.id]);

  function handleNoteChange(value: string) {
    setDraftNote(value);
    onNoteChange(value);
  }
  const operation = useMemo(
    () => buildEndpointOperation(group, openApiTitle, openApiVersion),
    [group, openApiTitle, openApiVersion]
  );
  const requestSchema = useMemo(() => extractRequestSchema(operation), [operation]);
  const responseSchemas = useMemo(() => extractResponseSchemas(operation), [operation]);
  const sdkHints = useMemo(() => buildSdkHints(group), [group]);

  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{group.method}</p>
          <h2>{group.pathTemplate}</h2>
        </div>
        <span className="status-pill">{formatStatusCounts(group.statusCounts)}</span>
      </div>

      <dl className="detail-grid">
        <div>
          <dt>Origin</dt>
          <dd>{group.origin}</dd>
        </div>
        <div>
          <dt>Average</dt>
          <dd>{formatDuration(group.averageDurationMs)}</dd>
        </div>
        <div>
          <dt>Last seen</dt>
          <dd>{new Date(group.lastSeen).toLocaleTimeString()}</dd>
        </div>
        <div>
          <dt>Samples</dt>
          <dd>{group.samples.length}</dd>
        </div>
      </dl>

      <div className="note-block">
        <label htmlFor="endpoint-note">
          <StickyNote size={15} />
          Notes
        </label>
        <textarea
          id="endpoint-note"
          className="note-input"
          value={draftNote}
          maxLength={ENDPOINT_NOTE_LIMIT}
          rows={3}
          placeholder="Auth requirements, gotchas, owning team…"
          onChange={(event) => handleNoteChange(event.target.value)}
        />
      </div>

      <div className="detail-tabs" role="tablist" aria-label="Endpoint detail views">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "detail-tab detail-tab-active" : "detail-tab"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "samples" ? (
        <>
          <div className="sample-block">
            <h3>Request Headers</h3>
            <HeaderList headers={sample?.requestHeaders ?? []} />
          </div>

          <div className="sample-block">
            <h3>Response Sample</h3>
            <pre>{sample?.responseBody ? sample.responseBody.slice(0, 2400) : "No response body captured."}</pre>
          </div>
        </>
      ) : null}

      {activeTab === "schema" ? (
        <>
          <div className="sample-block">
            <h3>Request Schema</h3>
            <pre>{requestSchema ? JSON.stringify(requestSchema, null, 2) : "No request schema inferred."}</pre>
          </div>

          <div className="sample-block">
            <h3>Response Schemas</h3>
            {responseSchemas.length ? (
              responseSchemas.map((entry) => (
                <div key={entry.status}>
                  <p className="subtle">Status {entry.status}</p>
                  <pre>{JSON.stringify(entry.schema, null, 2)}</pre>
                </div>
              ))
            ) : (
              <pre>No response schema inferred.</pre>
            )}
          </div>
        </>
      ) : null}

      {activeTab === "export" ? (
        <div className="sample-block">
          <h3>OpenAPI Operation</h3>
          <pre>{operation ? JSON.stringify(operation, null, 2) : "No operation generated."}</pre>
        </div>
      ) : null}

      {activeTab === "sdk" ? (
        <>
          {sdkHints.map((hint) => (
            <div className="sample-block" key={hint.id}>
              <h3>{hint.label}</h3>
              <pre>{hint.code}</pre>
            </div>
          ))}
        </>
      ) : null}
    </>
  );
}

function HeaderList({ headers }: { headers: Array<{ name: string; value: string }> }) {
  if (!headers.length) {
    return <p className="subtle">No headers captured.</p>;
  }

  return (
    <div className="header-list">
      {headers.slice(0, 12).map((header) => (
        <div key={`${header.name}:${header.value}`}>
          <span>{header.name}</span>
          <code>{header.value}</code>
        </div>
      ))}
    </div>
  );
}