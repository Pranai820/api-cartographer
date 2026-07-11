import {
  Braces,
  CheckCircle2,
  Download,
  Filter,
  Globe2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatDuration, formatStatusCounts } from "../lib/format";
import { buildOpenApiDocument } from "../lib/openapi";
import { createCapturedRequestFromHarEntry } from "../lib/request-model";
import { groupRequests } from "../lib/request-model";
import { clearCapturedRequests, loadCapturedRequests, saveCapturedRequests } from "../lib/storage";
import type { CapturedRequest, EndpointGroup } from "../lib/types";

type DevtoolsRequest = chrome.devtools.network.Request;

const EMPTY_GROUPS: EndpointGroup[] = [];

export function App() {
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [isCapturing, setIsCapturing] = useState(true);
  const [filter, setFilter] = useState("");
  const [originFilter, setOriginFilter] = useState("all");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [lastExportStatus, setLastExportStatus] = useState<"idle" | "copied" | "downloaded">("idle");
  const listenerAttached = useRef(false);
  const isCapturingRef = useRef(isCapturing);

  useEffect(() => {
    isCapturingRef.current = isCapturing;
  }, [isCapturing]);

  useEffect(() => {
    loadCapturedRequests().then(setRequests);
  }, []);

  useEffect(() => {
    saveCapturedRequests(requests);
  }, [requests]);

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
        ].slice(-500));
      });
    });

    listenerAttached.current = true;
  }, []);

  const groups = useMemo(() => groupRequests(requests), [requests]);
  const origins = useMemo(() => Array.from(new Set(groups.map((group) => group.origin))).sort(), [groups]);
  const filteredGroups = useMemo(() => {
    if (!groups.length) {
      return EMPTY_GROUPS;
    }

    const normalizedFilter = filter.trim().toLowerCase();

    return groups.filter((group) => {
      const matchesOrigin = originFilter === "all" || group.origin === originFilter;
      const matchesSearch =
        !normalizedFilter ||
        `${group.method} ${group.origin}${group.pathTemplate}`.toLowerCase().includes(normalizedFilter);

      return matchesOrigin && matchesSearch;
    });
  }, [filter, groups, originFilter]);

  const selectedGroup = useMemo(() => {
    return filteredGroups.find((group) => group.id === selectedGroupId) ?? filteredGroups[0];
  }, [filteredGroups, selectedGroupId]);

  useEffect(() => {
    if (selectedGroup && selectedGroup.id !== selectedGroupId) {
      setSelectedGroupId(selectedGroup.id);
    }
  }, [selectedGroup, selectedGroupId]);

  const openApiJson = useMemo(() => {
    return JSON.stringify(buildOpenApiDocument(filteredGroups), null, 2);
  }, [filteredGroups]);

  async function copyOpenApi() {
    await navigator.clipboard.writeText(openApiJson);
    setLastExportStatus("copied");
  }

  function downloadOpenApi() {
    const blob = new Blob([openApiJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "api-cartographer-openapi.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setLastExportStatus("downloaded");
  }

  async function resetCapture() {
    setRequests([]);
    await clearCapturedRequests();
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

          <div className="export-block">
            <p className="block-title">
              <Braces size={15} />
              OpenAPI
            </p>
            <button className="button button-full" type="button" onClick={copyOpenApi}>
              <CheckCircle2 size={16} />
              Copy JSON
            </button>
            <button className="button button-full" type="button" onClick={downloadOpenApi}>
              <Download size={16} />
              Download
            </button>
            {lastExportStatus !== "idle" ? <p className="subtle">Last export {lastExportStatus}.</p> : null}
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
              {filteredGroups.map((group) => (
                <button
                  className={group.id === selectedGroup?.id ? "endpoint-row endpoint-row-selected" : "endpoint-row"}
                  key={group.id}
                  type="button"
                  onClick={() => setSelectedGroupId(group.id)}
                >
                  <span className={`method method-${group.method.toLowerCase()}`}>{group.method}</span>
                  <span className="endpoint-path">{group.pathTemplate}</span>
                  <span className="endpoint-origin">{group.origin}</span>
                  <span className="endpoint-count">{group.count}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <RefreshCw size={18} />
              <span>Open a page and use it while DevTools stays open.</span>
            </div>
          )}
        </section>

        <section className="detail-panel" aria-label="Endpoint details">
          {selectedGroup ? <EndpointDetail group={selectedGroup} /> : <div className="empty-state">No endpoint selected.</div>}
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

function EndpointDetail({ group }: { group: EndpointGroup }) {
  const sample = group.samples[0];

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

      <div className="sample-block">
        <h3>Request Headers</h3>
        <HeaderList headers={sample?.requestHeaders ?? []} />
      </div>

      <div className="sample-block">
        <h3>Response Sample</h3>
        <pre>{sample?.responseBody ? sample.responseBody.slice(0, 2400) : "No response body captured."}</pre>
      </div>
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