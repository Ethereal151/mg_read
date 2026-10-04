import { createRequire as __mgreadCreateRequire } from 'node:module'; const require = __mgreadCreateRequire(import.meta.url);

// src/index.mts
var bootstrapBase = "https://feza.uuss.uk";
var categories = Object.freeze([["recent", "Recently Updated", "/"], ["popular", "Popular", "/popular/"], ["cosplay", "Cosplay", "/cosplay/"], ["ai", "AI Enhanced", "/tag/ai-enhanced/"], ["aigirl", "AIGirl", "/tag/aigirl/"], ["coser", "Coser", "/tag/coser/"], ["rosi", "Rosi", "/tag/rosi/"], ["youxi", "Youxi", "/tag/youxi/"]]);
var context;
var base = bootstrapBase;
var originPromise;
async function activate(next) {
  context = next;
  base = bootstrapBase;
  originPromise = void 0;
  next.log.info("source_activated");
}
async function search(request) {
  const query = request.query.trim();
  if (query === "") return frozen({ items: [], nextCursor: null, totalCount: 0 });
  await ensureBase();
  const page = cursorPage(request.cursor, "search"), size = clamp(request.pageSize);
  let values = [];
  for (const candidate of searchCandidates(query)) {
    const url = `${base}/search/${encodeURIComponent(candidate)}/${page > 1 ? `page/${page}/` : ""}`;
    try {
      values = parseList(await fetchText(url));
    } catch {
      values = [];
    }
    if (values.length === 0) values = await fetchPosts(page, size, candidate);
    if (values.length > 0) break;
  }
  values = values.slice(0, size);
  return frozen({ items: values, nextCursor: values.length >= size ? `search:${page + 1}` : null, totalCount: null });
}
function searchCandidates(query) {
  const values = /* @__PURE__ */ new Set([query]);
  const unwrapped = query.replace(/^[《「『【](.*)[》」』】]$/u, "$1");
  if (unwrapped !== query) values.add(unwrapped);
  const prefix = query.split(/[：:（(]/u, 1)[0]?.trim();
  if (prefix !== void 0 && prefix.length >= 2) values.add(prefix);
  return [...values].filter((value) => value.length >= 2).slice(0, 3);
}
async function searchSuggestions(_request) {
  return frozen({ items: [], nextCursor: null });
}
async function discover(request) {
  if (request.target === null) {
    if (request.cursor !== null || request.collectionId !== null) throw new Error("Initial discovery request is invalid.");
    return frozen({ kind: "document", document: { components: [{ type: "section", id: "photo-categories", title: "4KHD", subtitle: "写真与图集分类", icon: "manga", children: [{ type: "categoryCollection", id: "photo-category-list", layout: "chips", categories: categories.map(([id, title]) => ({ id, title, target: `category:${id}`, count: null, url: null, icon: "manga" })) }] }] } });
  }
  await ensureBase();
  const category = categories.find(([id]) => request.target === `category:${id}`);
  if (category === void 0) throw new Error("Discovery target is invalid.");
  const page = cursorPage(request.cursor, request.target), size = clamp(request.pageSize), pagePath = page === 1 ? category[2] : category[2] === "/" ? `/page/${page}/` : `${category[2]}page/${page}/`, html = await fetchText(`${base}${pagePath}`), parsed = parseList(html), values = parsed.length > 0 ? parsed.slice(0, size) : (await fetchPosts(page, size, "")).slice(0, size), collectionId = `manga:${category[0]}`, items = values.map((content) => frozen({ content, rank: null, metric: null, recommendation: null })), continuation = values.length >= size ? frozen({ target: request.target, cursor: `${request.target}:${page + 1}` }) : null;
  if (request.collectionId !== null) {
    if (request.collectionId !== collectionId) throw new Error("Discovery collection is invalid.");
    return frozen({ kind: "append", collectionId, items, continuation });
  }
  return frozen({ kind: "document", document: { components: [{ type: "section", id: `${collectionId}:section`, title: category[1], subtitle: null, icon: "manga", children: [{ type: "contentCollection", id: collectionId, layout: "coverGrid", items, continuation }] }] } });
}
async function getDetail(request) {
  await ensureBase();
  const path = contentPath(request.id), url = `${base}${path}`, html = await fetchText(url), title = decode(strip(firstCapture(html, /<title[^>]*>([^<]+)<\/title>/iu)).replace(/\s*-\s*4KHD\s*$/iu, "").trim()) || "Photo", cover = firstCapture(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/iu) || firstCapture(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/iu) || firstCapture(html, /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/iu), description = decode(firstCapture(html, /<meta[^>]+(?:property=["']og:description["']|name=["']description["'])[^>]+content=["']([^"']+)["']/iu)), item = summary(path, title, cover);
  return frozen({ ...item, description: description || null, aliases: [], catalogUrl: url });
}
async function getChapters(request) {
  const path = contentPath(request.id), chapter = frozen({ id: `manga:${encodeKey(path)}:main`, title: "Full Album", order: 0, url: null, volumeTitle: "Album", wordCount: null, updatedAt: null, isLocked: null, attributes: [] });
  return frozen({ items: [chapter], groups: [frozen({ id: `group:manga:${encodeKey(path)}`, title: "Album", order: 0, episodes: [chapter] })] });
}
async function getContent(request) {
  await ensureBase();
  const path = contentPath(request.id);
  if (request.chapterId !== `manga:${encodeKey(path)}:main`) throw new Error("Chapter ID is invalid.");
  const seenPages = /* @__PURE__ */ new Set(), seenImages = /* @__PURE__ */ new Set(), images = [];
  let current = `${base}${path}`;
  for (let page = 0; page < 40 && current !== "" && !seenPages.has(current); page += 1) {
    seenPages.add(current);
    const html = await fetchText(current);
    for (const image of extractImages(html)) if (!seenImages.has(image)) {
      seenImages.add(image);
      images.push(image);
    }
    const next = firstCapture(html, /<link[^>]+rel=["']next["'][^>]+href=["']([^"']+)["']/iu) || firstCapture(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']next["']/iu);
    current = next === "" ? "" : new URL(next, current).toString();
  }
  if (images.length === 0) throw new Error("Album images are unavailable.");
  const pages = images.map((upstream, index) => frozen({ id: `page:${index + 1}`, index, url: requireContext().resource.proxy({ kind: "image", url: upstream, headers: { Referer: `${base}${path}` } }), mimeType: imageMime(upstream), width: null, height: null }));
  return frozen({ chapterId: request.chapterId, contentKind: "manga", title: null, updatedAt: null, text: null, pages: Object.freeze(pages) });
}
async function fetchPosts(page, size, query) {
  const url = new URL(`${base}/wp-json/wp/v2/posts`);
  url.searchParams.set("per_page", String(size));
  url.searchParams.set("page", String(page));
  if (query !== "") url.searchParams.set("search", query);
  const response = await requireContext().http.fetch(url, { headers: requestHeaders(base) });
  if (!response.ok) return [];
  let value;
  try {
    value = await response.json();
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value.filter(isObject).map((post) => {
    const path = normalizePath(text(post.link));
    if (path === null) return null;
    const title = decode(strip(text(object(post.title).rendered))) || `Photo ${text(post.id)}`, cover = text(post.jetpack_featured_media_url);
    return summary(path, title, cover);
  }).filter(notNull);
}
async function ensureBase() {
  originPromise ??= resolveBase();
  base = await originPromise;
}
async function resolveBase() {
  const probePath = "/wp-json/wp/v2/posts?per_page=1&page=1", bootstrap = await requireContext().http.fetch(`${bootstrapBase}${probePath}`, { headers: requestHeaders(bootstrapBase) });
  if (!bootstrap.ok) throw new Error("Source origin request failed.");
  const body = await bootstrap.text();
  if (isPosts(body)) return bootstrapBase;
  const sites = firstCapture(body, /\bconst\s+sites\s*=\s*\[([\s\S]*?)\]/u), candidates = [...sites.matchAll(/["'](https:\/\/[a-z0-9.-]+)["']/giu)].map((match) => match[1] ?? "").slice(0, 8), seen = /* @__PURE__ */ new Set();
  for (const candidate of candidates) {
    let origin;
    try {
      origin = new URL(candidate).origin;
    } catch {
      continue;
    }
    if (seen.has(origin)) continue;
    seen.add(origin);
    try {
      const response = await requireContext().http.fetch(`${origin}${probePath}`, { headers: requestHeaders(origin) });
      if (response.ok && isPosts(await response.text())) return origin;
    } catch {
    }
  }
  throw new Error("Source origin is unavailable.");
}
function isPosts(value) {
  try {
    return Array.isArray(JSON.parse(value));
  } catch {
    return false;
  }
}
function requestHeaders(origin) {
  return { Accept: "text/html,application/xhtml+xml,application/json,*/*", "Accept-Language": "zh-CN,zh;q=0.9", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36", Referer: `${origin}/` };
}
async function fetchText(url) {
  const response = await requireContext().http.fetch(url, { headers: requestHeaders(base) });
  if (!response.ok) throw new Error("Source request failed.");
  return response.text();
}
function parseList(html) {
  const values = /* @__PURE__ */ new Map();
  for (const row of html.matchAll(/<li\b[^>]*class=["'][^"']*\bpost-\d+\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/giu)) {
    const body = row[1] ?? "", path = normalizePath(firstCapture(body, /<a\b[^>]*href=["']([^"']*\/(?:content|album|pic)\/[^"']+)["']/iu));
    if (path === null || values.has(path)) continue;
    const image = /<img\b[^>]*>/iu.exec(body)?.[0] ?? "", title = strip(firstCapture(body, /<h2[^>]*>([\s\S]*?)<\/h2>/iu));
    if (title === "") continue;
    values.set(path, summary(path, decode(title), attribute(image, "src") || attribute(image, "data-src") || attribute(image, "data-lazy-src")));
  }
  for (const match of html.matchAll(/<a\b([^>]*)href=["']([^"']*\/(?:content|album|pic)\/[^"']+)["']([^>]*)>([\s\S]*?)<\/a>/giu)) {
    const path = normalizePath(match[2] ?? "");
    if (path === null || values.has(path)) continue;
    const body = match[4] ?? "", image = /<img\b[^>]*>/iu.exec(body)?.[0] ?? "", title = strip(firstCapture(body, /<h2[^>]*>([\s\S]*?)<\/h2>/iu)) || attribute(`${match[1] ?? ""} ${match[3] ?? ""}`, "title") || strip(body);
    if (title === "") continue;
    values.set(path, summary(path, decode(title), attribute(image, "src") || attribute(image, "data-src") || attribute(image, "data-lazy-src")));
  }
  return [...values.values()];
}
function extractImages(html) {
  const end = html.indexOf('id="basicE"'), start = html.indexOf('<p><a href="https://i'), gallery = start >= 0 ? html.slice(start, end >= 0 ? end : void 0) : html, values = [];
  for (const match of gallery.matchAll(/<a[^>]+href=["'](https:\/\/i\d+\.wp\.com\/pic\.4khd\.com\/[^?"'\s]+)["'][^>]*>\s*<img/giu)) if (match[1]) values.push(match[1]);
  if (values.length === 0) {
    for (const match of gallery.matchAll(/<img[^>]+src=["'](https:\/\/i\d+\.wp\.com\/pic\.4khd\.com\/[^?"'\s]+)/giu)) if (match[1]) values.push(match[1]);
  }
  return values;
}
function summary(path, title, cover) {
  return frozen({ id: `manga:${encodeKey(path)}`, title, contentKind: "manga", coverOrientation: "portrait", author: null, url: `${base}${path}`, coverUrl: proxyImage(cover), description: null, language: null, status: "completed", access: "free", wordCount: null, chapterCount: 1, publishedAt: null, updatedAt: null, latestChapter: { id: `manga:${encodeKey(path)}:main`, title: "Full Album", url: null, updatedAt: null }, categories: ["Photo"], tags: [], attributes: [] });
}
function normalizePath(value) {
  if (value === "") return null;
  try {
    const url = new URL(value, base);
    if (!["/content/", "/album/", "/pic/"].some((prefix) => url.pathname.startsWith(prefix))) return null;
    return url.pathname;
  } catch {
    return null;
  }
}
function contentPath(id) {
  const encoded = /^manga:([A-Za-z0-9_-]+)$/u.exec(id)?.[1];
  if (encoded === void 0) throw new Error("Content ID is invalid.");
  const path = decodeKey(encoded);
  if (normalizePath(path) !== path) throw new Error("Content ID is invalid.");
  return path;
}
function encodeKey(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}
function decodeKey(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("Source key is invalid.");
  return Buffer.from(value, "base64url").toString("utf8");
}
function proxyImage(value) {
  if (value === "") return null;
  let url;
  try {
    url = new URL(value, base).toString();
  } catch {
    return null;
  }
  return requireContext().resource.proxy({ kind: "image", url, headers: { Referer: `${base}/` } });
}
function imageMime(url) {
  const path = new URL(url).pathname.toLowerCase();
  return path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : "image/jpeg";
}
function attribute(value, name) {
  return new RegExp(`${name}=["']([^"']+)["']`, "iu").exec(value)?.[1] ?? "";
}
function firstCapture(value, pattern) {
  return pattern.exec(value)?.[1] ?? "";
}
function strip(value) {
  return value.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
}
function decode(value) {
  return value.replace(/&#8211;/gu, "–").replace(/&#038;|&amp;/gu, "&").replace(/&quot;/gu, '"').replace(/&#39;/gu, "'");
}
function cursorPage(cursor, target) {
  if (cursor === null) return 1;
  const raw = cursor.startsWith(`${target}:`) ? cursor.slice(target.length + 1) : "", page = Number(raw);
  if (!Number.isSafeInteger(page) || page < 2 || page > 1e3) throw new Error("Cursor is invalid.");
  return page;
}
function object(value) {
  return isObject(value) ? value : {};
}
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value) {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}
function notNull(value) {
  return value !== null;
}
function clamp(value) {
  return Math.max(1, Math.min(50, Math.floor(value)));
}
function frozen(value) {
  return Object.freeze(value);
}
function requireContext() {
  if (context === void 0) throw new Error("Source is not activated.");
  return context;
}
export {
  activate,
  discover,
  getChapters,
  getContent,
  getDetail,
  search,
  searchSuggestions
};
