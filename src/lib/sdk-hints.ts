import type { CapturedRequest, EndpointGroup, HeaderEntry } from "./types";

export interface SdkHint {
  id: string;
  label: string;
  language: "shell" | "javascript" | "python";
  code: string;
}

const SKIPPED_HEADER_NAMES = new Set(["host", "content-length", "connection", "accept-encoding"]);

function notableHeaders(sample: CapturedRequest | undefined): HeaderEntry[] {
  if (!sample) {
    return [];
  }

  return sample.requestHeaders.filter((header) => !SKIPPED_HEADER_NAMES.has(header.name.trim().toLowerCase()));
}

function buildUrl(group: EndpointGroup, sample: CapturedRequest | undefined): string {
  const origin = group.origin.replace(/\/$/, "");
  const base = `${origin}${group.pathTemplate}`;
  const query = sample?.query ?? [];

  if (!query.length) {
    return base;
  }

  const search = query.map((entry) => `${encodeURIComponent(entry.name)}=${encodeURIComponent(entry.value)}`).join("&");
  return `${base}?${search}`;
}

function formatJsonBody(body: string | undefined): string | undefined {
  if (!body) {
    return undefined;
  }

  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return undefined;
  }
}

function toPythonLiteral(jsonText: string): string {
  return jsonText
    .replace(/: true(?=[,\n}])/g, ": True")
    .replace(/: false(?=[,\n}])/g, ": False")
    .replace(/: null(?=[,\n}])/g, ": None");
}

function buildCurlSnippet(group: EndpointGroup, sample: CapturedRequest | undefined): string {
  const method = group.method.toUpperCase();
  const url = buildUrl(group, sample);
  const body = formatJsonBody(sample?.requestBody);
  const lines = [`curl -X ${method} "${url}"`];

  for (const header of notableHeaders(sample)) {
    lines.push(`  -H "${header.name}: ${header.value}"`);
  }

  if (body) {
    lines.push(`  -d '${body.replace(/'/g, "'\\''")}'`);
  }

  return lines.join(" \\\n");
}

function buildFetchSnippet(group: EndpointGroup, sample: CapturedRequest | undefined): string {
  const method = group.method.toUpperCase();
  const url = buildUrl(group, sample);
  const headers = notableHeaders(sample);
  const body = formatJsonBody(sample?.requestBody);
  const optionLines = [`  method: "${method}"`];

  if (headers.length) {
    const headerBody = headers.map((header) => `    "${header.name}": "${header.value}"`).join(",\n");
    optionLines.push(`  headers: {\n${headerBody}\n  }`);
  }

  if (body) {
    optionLines.push(`  body: JSON.stringify(${body})`);
  }

  return [`const response = await fetch("${url}", {`, optionLines.join(",\n"), `});`, `const data = await response.json();`].join(
    "\n"
  );
}

function buildPythonSnippet(group: EndpointGroup, sample: CapturedRequest | undefined): string {
  const method = group.method.toLowerCase();
  const url = buildUrl(group, sample);
  const headers = notableHeaders(sample);
  const body = formatJsonBody(sample?.requestBody);
  const lines = ["import requests", ""];

  if (headers.length) {
    lines.push("headers = {");
    for (const header of headers) {
      lines.push(`    "${header.name}": "${header.value}",`);
    }
    lines.push("}");
    lines.push("");
  }

  if (body) {
    lines.push(`json_body = ${toPythonLiteral(body)}`);
    lines.push("");
  }

  const args = [`"${url}"`];
  if (headers.length) {
    args.push("headers=headers");
  }
  if (body) {
    args.push("json=json_body");
  }

  lines.push(`response = requests.${method}(${args.join(", ")})`);
  lines.push("data = response.json()");

  return lines.join("\n");
}

export function buildSdkHints(group: EndpointGroup): SdkHint[] {
  const sample = group.samples[0];

  return [
    { id: "curl", label: "cURL", language: "shell", code: buildCurlSnippet(group, sample) },
    { id: "javascript", label: "JavaScript (fetch)", language: "javascript", code: buildFetchSnippet(group, sample) },
    { id: "python", label: "Python (requests)", language: "python", code: buildPythonSnippet(group, sample) }
  ];
}
