import type { CapturedRequest } from "./types";

export type FrameworkCategory = "framework" | "platform" | "api-style";

export type FrameworkConfidence = "high" | "medium";

export interface FrameworkDetection {
  id: string;
  label: string;
  category: FrameworkCategory;
  confidence: FrameworkConfidence;
  /** Short, human-readable reasons, e.g. `x-powered-by: Express`. */
  evidence: string[];
  requestCount: number;
}

interface DetectionRule {
  id: string;
  label: string;
  category: FrameworkCategory;
  confidence: FrameworkConfidence;
  /** Returns the evidence string when the rule matches, otherwise null. */
  match: (request: CapturedRequest) => string | null;
}

const EVIDENCE_VALUE_LIMIT = 60;
const MAX_EVIDENCE_PER_DETECTION = 3;

const CATEGORY_ORDER: Record<FrameworkCategory, number> = {
  framework: 0,
  "api-style": 1,
  platform: 2
};

const CONFIDENCE_ORDER: Record<FrameworkConfidence, number> = {
  high: 0,
  medium: 1
};

function responseHeader(request: CapturedRequest, name: string) {
  const target = name.toLowerCase();

  return request.responseHeaders.find((header) => header.name.toLowerCase() === target);
}

function hasResponseHeaderPrefix(request: CapturedRequest, prefix: string): string | undefined {
  const target = prefix.toLowerCase();

  return request.responseHeaders.find((header) => header.name.toLowerCase().startsWith(target))?.name;
}

/**
 * Cookie names only — values are never used as evidence, since cookies carry
 * session material and detections are surfaced in the panel UI.
 */
function cookieNames(request: CapturedRequest): string[] {
  const setCookies = request.responseHeaders
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value);
  const requestCookies = request.requestHeaders
    .filter((header) => header.name.toLowerCase() === "cookie")
    .flatMap((header) => header.value.split(";"));

  return [...setCookies, ...requestCookies]
    .map((cookie) => cookie.split("=")[0]?.trim().toLowerCase() ?? "")
    .filter(Boolean);
}

function truncate(value: string): string {
  return value.length > EVIDENCE_VALUE_LIMIT ? `${value.slice(0, EVIDENCE_VALUE_LIMIT)}…` : value;
}

function headerEvidence(name: string, value: string): string {
  return `${name}: ${truncate(value.trim())}`;
}

function matchHeader(
  request: CapturedRequest,
  name: string,
  pattern: RegExp | null = null
): string | null {
  const header = responseHeader(request, name);

  if (!header || (pattern && !pattern.test(header.value))) {
    return null;
  }

  // Reports the header name as the server sent it, not the lookup casing.
  return headerEvidence(header.name, header.value);
}

function matchCookie(request: CapturedRequest, pattern: RegExp): string | null {
  const cookie = cookieNames(request).find((name) => pattern.test(name));

  return cookie ? `cookie: ${cookie}` : null;
}

function matchHeaderPrefix(request: CapturedRequest, prefix: string): string | null {
  const name = hasResponseHeaderPrefix(request, prefix);

  return name ? `header: ${name}` : null;
}

function matchPath(request: CapturedRequest, pattern: RegExp): string | null {
  return pattern.test(request.pathTemplate) ? `path: ${request.pathTemplate}` : null;
}

const RULES: DetectionRule[] = [
  {
    id: "express",
    label: "Express",
    category: "framework",
    confidence: "high",
    match: (request) => matchHeader(request, "x-powered-by", /express/i) ?? matchCookie(request, /^connect\.sid$/)
  },
  {
    id: "nextjs",
    label: "Next.js",
    category: "framework",
    confidence: "high",
    match: (request) =>
      matchHeader(request, "x-powered-by", /next\.js/i) ??
      matchHeaderPrefix(request, "x-nextjs-") ??
      matchPath(request, /^\/_next\//)
  },
  {
    id: "aspnet",
    label: "ASP.NET",
    category: "framework",
    confidence: "high",
    match: (request) =>
      matchHeader(request, "x-powered-by", /asp\.net/i) ??
      matchHeader(request, "x-aspnet-version") ??
      matchHeader(request, "server", /kestrel/i)
  },
  {
    id: "php",
    label: "PHP",
    category: "framework",
    confidence: "medium",
    match: (request) => matchHeader(request, "x-powered-by", /^php\//i) ?? matchCookie(request, /^phpsessid$/)
  },
  {
    id: "laravel",
    label: "Laravel",
    category: "framework",
    confidence: "high",
    match: (request) => matchCookie(request, /^laravel_session$/)
  },
  {
    id: "django",
    label: "Django",
    category: "framework",
    confidence: "high",
    match: (request) => matchCookie(request, /^csrftoken$/) ?? matchHeader(request, "server", /wsgiserver/i)
  },
  {
    id: "flask",
    label: "Flask / Werkzeug",
    category: "framework",
    confidence: "high",
    match: (request) => matchHeader(request, "server", /werkzeug/i)
  },
  {
    id: "fastapi",
    label: "FastAPI / Uvicorn",
    category: "framework",
    confidence: "high",
    match: (request) => matchHeader(request, "server", /uvicorn/i)
  },
  {
    id: "gunicorn",
    label: "Gunicorn (Python)",
    category: "framework",
    confidence: "medium",
    match: (request) => matchHeader(request, "server", /gunicorn/i)
  },
  {
    id: "rails",
    label: "Ruby on Rails",
    category: "framework",
    confidence: "medium",
    // Rails names its session cookie `_<app>_session`; the leading underscore
    // keeps this off framework-specific cookies like `laravel_session`.
    match: (request) => matchHeader(request, "x-runtime") ?? matchCookie(request, /^_[\w-]*_session$|^_session_id$/)
  },
  {
    id: "java",
    label: "Java (Servlet / Spring)",
    category: "framework",
    confidence: "medium",
    match: (request) => matchCookie(request, /^jsessionid$/) ?? matchHeader(request, "x-application-context")
  },
  {
    id: "wordpress",
    label: "WordPress",
    category: "framework",
    confidence: "high",
    match: (request) => matchPath(request, /^\/wp-json\//) ?? matchHeader(request, "x-wp-total")
  },
  {
    id: "graphql",
    label: "GraphQL",
    category: "api-style",
    confidence: "high",
    match: (request) => matchPath(request, /\/graphql\/?$/)
  },
  {
    id: "jsonapi",
    label: "JSON:API",
    category: "api-style",
    confidence: "high",
    match: (request) => matchHeader(request, "content-type", /application\/vnd\.api\+json/i)
  },
  {
    id: "odata",
    label: "OData",
    category: "api-style",
    confidence: "medium",
    match: (request) => matchHeader(request, "odata-version") ?? matchPath(request, /^\/odata\//i)
  },
  {
    id: "vercel",
    label: "Vercel",
    category: "platform",
    confidence: "high",
    match: (request) => matchHeader(request, "x-vercel-id")
  },
  {
    id: "cloudflare",
    label: "Cloudflare",
    category: "platform",
    confidence: "high",
    match: (request) => matchHeader(request, "cf-ray") ?? matchHeader(request, "server", /cloudflare/i)
  },
  {
    id: "aws-api-gateway",
    label: "AWS API Gateway",
    category: "platform",
    confidence: "high",
    match: (request) => matchHeader(request, "x-amzn-requestid") ?? matchHeader(request, "x-amz-apigw-id")
  },
  {
    id: "netlify",
    label: "Netlify",
    category: "platform",
    confidence: "high",
    match: (request) => matchHeader(request, "x-nf-request-id")
  },
  {
    id: "supabase",
    label: "Supabase",
    category: "platform",
    confidence: "medium",
    match: (request) => matchHeaderPrefix(request, "sb-") ?? matchPath(request, /^\/rest\/v1\//)
  },
  {
    id: "hasura",
    label: "Hasura",
    category: "platform",
    confidence: "high",
    match: (request) => matchHeaderPrefix(request, "x-hasura-")
  },
  {
    id: "shopify",
    label: "Shopify",
    category: "platform",
    confidence: "high",
    match: (request) => matchHeaderPrefix(request, "x-shopify-") ?? matchHeader(request, "x-shopid")
  }
];

/**
 * Detects likely backend frameworks, API styles, and hosting platforms from
 * captured traffic. Runs on unredacted requests, so results are for local
 * display only — do not fold evidence into shareable exports.
 */
export function detectFrameworks(requests: CapturedRequest[]): FrameworkDetection[] {
  const detections = new Map<string, FrameworkDetection>();

  for (const request of requests) {
    for (const rule of RULES) {
      const evidence = rule.match(request);

      if (!evidence) {
        continue;
      }

      const existing = detections.get(rule.id);

      if (!existing) {
        detections.set(rule.id, {
          id: rule.id,
          label: rule.label,
          category: rule.category,
          confidence: rule.confidence,
          evidence: [evidence],
          requestCount: 1
        });
        continue;
      }

      existing.requestCount += 1;

      if (!existing.evidence.includes(evidence) && existing.evidence.length < MAX_EVIDENCE_PER_DETECTION) {
        existing.evidence.push(evidence);
      }
    }
  }

  return Array.from(detections.values()).sort(
    (left, right) =>
      CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category] ||
      CONFIDENCE_ORDER[left.confidence] - CONFIDENCE_ORDER[right.confidence] ||
      right.requestCount - left.requestCount ||
      left.label.localeCompare(right.label)
  );
}

export function summarizeFrameworks(detections: FrameworkDetection[]): string {
  if (!detections.length) {
    return "No known frameworks detected";
  }

  return detections.map((detection) => detection.label).join(", ");
}
