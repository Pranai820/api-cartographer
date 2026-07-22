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
  PauseCircle,
  Pin,
  PinOff,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Upload
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  applyEndpointPreferences,
  EMPTY_ENDPOINT_PREFERENCES,
  isIgnored,
  isPinned,
  toggleIgnored,
  togglePinned,
  type EndpointPreferences
} from "../lib/endpoint-preferences";
import { CAPTURED_REQUEST_LIMIT, isAtCaptureLimit, resolveEmptyStateReason } from "../lib/capture-status";
import { buildEndpointOperation, extractRequestSchema, extractResponseSchemas } from "../lib/endpoint-detail";
import { filterEndpointGroups, listContentTypes, listMethods, listStatusCodes } from "../lib/filters";
import { formatDuration, formatStatusCounts } from "../lib/format";
import { buildMarkdownReport } from "../lib/markdown-report";
import { buildOpenApiDocument } from "../lib/openapi";
import { buildProjectDataExport, parseProjectDataImport } from "../lib/project-data";
import { createCapturedRequestFromHarEntry, parseHarLog } from "../lib/request-model";
import { redactCapturedRequest, redactEndpointGroups } from "../lib/redaction";
import { groupRequests } from "../lib/request-model";
import { createCaptureSession, deleteCaptureSession, upsertCaptureSession, type CaptureSession } from "../lib/sessions";
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
  const [openApiTitle, setOpenApiTitle] = useState("Captured API");
  const [openApiVersion, setOpenApiVersion] = useState("0.1.0");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [lastExportStatus, setLastExportStatus] = useState<string>("idle");
  const listenerAttached = useRef(false);
  const harInputRef = useRef<HTMLInputElement>(null);
  const projectDataInputRef = useRef<HTMLInputElement>(null);
  const isCapturingRef = useRef(isCapturing);

  useEffect(() => {
    isCapturingRef.current = isCapturing;
  }, [isCapturing]);

  useEffect(() => {
    loadCapturedRequests().then(setRequests);
    loadEndpointPreferences().then(setEndpointPreferences);
    loadCaptureSessions().then(setSessions);
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

  const selectedGroup = useMemo(() => {
    return filteredGroups.find((group) => group.id === selectedGroupId) ?? filteredGroups[0];
  }, [filteredGroups, selectedGroupId]);

  useEffect(() => {
    if (selectedGroup && selectedGroup.id !== selectedGroupId) {
      setSelectedGroupId(selectedGroup.id);
    }
  }, [selectedGroup, selectedGroupId]);

  const redactedFilteredGroups = useMemo(() => redactEndpointGroups(filteredGroups), [filteredGroups]);
  const openApiJson = useMemo(() => {
    return JSON.stringify(buildOpenApiDocument(redactedFilteredGroups, openApiTitle, openApiVersion), null, 2);
  }, [redactedFilteredGroups, openApiTitle, openApiVersion]);
  const markdownReport = useMemo(() => buildMarkdownReport(redactedFilteredGroups), [redactedFilteredGroups]);

  async function copyOpenApi() {
    await navigator.clipboard.writeText(openApiJson);
    setLastExportStatus("OpenAPI copied");
  }

  function downloadOpenApi() {
    const blob = new Blob([openApiJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "api-cartographer-openapi.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setLastExportStatus("OpenAPI downloaded");
  }

  async function copyMarkdownReport() {
    await navigator.clipboard.writeText(markdownReport);
    setLastExportStatus("Markdown copied");
  }

  function downloadMarkdownReport() {
    const blob = new Blob([markdownReport], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "api-cartographer-report.md";
    anchor.click();
    URL.revokeObjectURL(url);
    setLastExportStatus("Markdown downloaded");
  }

  function toggleEndpointPin(endpointId: string) {
    setEndpointPreferences((current) => togglePinned(current, endpointId));
  }

  function toggleEndpointIgnore(endpointId: string) {
    setEndpointPreferences((current) => toggleIgnored(current, endpointId));
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

  function exportProjectData() {
    const projectData = buildProjectDataExport({ requests, sessions, endpointPreferences });
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "api-cartographer-project.json";
    anchor.click();
    URL.revokeObjectURL(url);
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

      <section className="workspace">
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
            {lastExportStatus !== "idle" ? <p className="subtle">Last export: {lastExportStatus}.</p> : null}
          </div>
        </aside>

        <section className="endpoint-list" aria-label="Endpoint groups">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Observed</p>
              <h2>Endpoints</h2>
            </div>
            <Filter size={18} />
          </div>

          {filteredGroups.length ? (
            <div className="endpoint-table">
              {filteredGroups.map((group) => {
                const pinned = isPinned(endpointPreferences, group.id);
                const ignored = isIgnored(endpointPreferences, group.id);

                return (
                  <div
                    className={`endpoint-row${group.id === selectedGroup?.id ? " endpoint-row-selected" : ""}${
                      pinned ? " endpoint-row-pinned" : ""
                    }${ignored ? " endpoint-row-ignored" : ""}`}
                    key={group.id}
                  >
                    <button className="endpoint-row-main" type="button" onClick={() => setSelectedGroupId(group.id)}>
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
          ) : (
            <div className="empty-state">
              <RefreshCw size={18} />
              <span>Open a page and use it while DevTools stays open.</span>
            </div>
          )}
        </section>

        <section className="detail-panel" aria-label="Endpoint details">
          {selectedGroup ? (
            <EndpointDetail group={selectedGroup} openApiTitle={openApiTitle} openApiVersion={openApiVersion} />
          ) : (
            <div className="empty-state">No endpoint selected.</div>
          )}
        </section>
      </section>
    </main>
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

type DetailTab = "samples" | "schema" | "export";

const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "samples", label: "Samples" },
  { id: "schema", label: "Schema" },
  { id: "export", label: "Export Preview" }
];

function EndpointDetail({
  group,
  openApiTitle,
  openApiVersion
}: {
  group: EndpointGroup;
  openApiTitle: string;
  openApiVersion: string;
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>("samples");
  const sample = group.samples[0] ? redactCapturedRequest(group.samples[0]) : undefined;
  const operation = useMemo(
    () => buildEndpointOperation(group, openApiTitle, openApiVersion),
    [group, openApiTitle, openApiVersion]
  );
  const requestSchema = useMemo(() => extractRequestSchema(operation), [operation]);
  const responseSchemas = useMemo(() => extractResponseSchemas(operation), [operation]);

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