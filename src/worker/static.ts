// Production static files from R2. The deployed Worker has no static-assets
// binding (the asset upload cannot run from the deploy container, see
// docs/build-plan.md "Deploy"); `npm run deploy` uploads the client build to
// the STATIC bucket instead, and every non-/api request lands here.
//
// Local dev, `vite preview` and the tests have no STATIC binding and keep
// using Workers Static Assets with public/_headers.
import headersFile from "../../public/_headers?raw";

/** Content types by extension. Anything else is served as application/octet-stream. */
const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  webmanifest: "application/manifest+json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
  wasm: "application/wasm",
};

const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "no-cache";
const INDEX = "index.html";

/** The `/*` block of public/_headers, so production sends what Static Assets would. */
export function parseHeadersFile(text: string): [string, string][] {
  const out: [string, string][] = [];
  let inBlock = false;
  for (const raw of text.split("\n")) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      inBlock = raw.trim() === "/*";
      continue;
    }
    if (!inBlock) continue;
    const colon = raw.indexOf(":");
    if (colon > 0) out.push([raw.slice(0, colon).trim(), raw.slice(colon + 1).trim()]);
  }
  return out;
}

export const SECURITY_HEADERS = parseHeadersFile(headersFile);

function extension(key: string): string | null {
  const last = key.slice(key.lastIndexOf("/") + 1);
  const dot = last.lastIndexOf(".");
  return dot > 0 ? last.slice(dot + 1).toLowerCase() : null;
}

export function contentTypeFor(key: string): string {
  const ext = extension(key);
  return (ext && CONTENT_TYPES[ext]) || "application/octet-stream";
}

/** The bucket key for a URL path, or null for a path that can never be a file. */
export function keyForPath(pathname: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  path = path.replace(/^\/+/, "");
  if (path === "") return INDEX;
  if (path.endsWith("/") || path.includes("\\") || path.includes("\0")) return null;
  if (path.split("/").some((seg) => seg === "" || seg === "." || seg === ".." || seg.startsWith("_"))) return null;
  return path;
}

/** Missing paths that are a real 404: hashed assets and anything that looks like a known file type. */
function isFilePath(pathname: string): boolean {
  if (pathname.startsWith("/assets/")) return true;
  const ext = extension(pathname);
  return ext !== null && ext in CONTENT_TYPES;
}

function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === "*") return true;
  const strip = (t: string) => t.trim().replace(/^W\//, "");
  return header.split(",").some((t) => strip(t) === strip(etag));
}

function baseHeaders(): Headers {
  const h = new Headers();
  for (const [name, value] of SECURITY_HEADERS) h.set(name, value);
  return h;
}

function notFound(head: boolean): Response {
  const h = baseHeaders();
  h.set("Content-Type", "text/plain; charset=utf-8");
  h.set("Cache-Control", REVALIDATE);
  return new Response(head ? null : "Not found", { status: 404, headers: h });
}

/** Serves a GET or HEAD for a non-/api path from the STATIC bucket. */
export async function serveStatic(request: Request, bucket: R2Bucket): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    const h = baseHeaders();
    h.set("Allow", "GET, HEAD");
    return new Response(null, { status: 405, headers: h });
  }
  const head = method === "HEAD";
  const url = new URL(request.url);
  const inm = request.headers.get("If-None-Match");

  // Metadata only when the body may not be needed (HEAD, revalidation).
  const lookup = (k: string): Promise<R2Object | R2ObjectBody | null> => (head || inm ? bucket.head(k) : bucket.get(k));

  const wanted = keyForPath(url.pathname);
  let key = wanted ?? INDEX;
  let obj = wanted ? await lookup(wanted) : null;
  if (!obj) {
    if (isFilePath(url.pathname)) return notFound(head);
    key = INDEX; // SPA route: the client router renders it
    obj = await lookup(INDEX);
    if (!obj) return notFound(head);
  }

  const h = baseHeaders();
  h.set("Content-Type", contentTypeFor(key));
  h.set("Cache-Control", key.startsWith("assets/") ? IMMUTABLE : REVALIDATE);
  h.set("ETag", obj.httpEtag);
  h.set("Last-Modified", obj.uploaded.toUTCString());

  if (etagMatches(inm, obj.httpEtag)) return new Response(null, { status: 304, headers: h });
  if (head) {
    h.set("Content-Length", String(obj.size));
    return new Response(null, { status: 200, headers: h });
  }
  if (!("body" in obj)) {
    obj = await bucket.get(key);
    if (!obj) return notFound(false); // deleted in between
    h.set("ETag", obj.httpEtag);
  }
  return new Response((obj as R2ObjectBody).body, { status: 200, headers: h });
}
