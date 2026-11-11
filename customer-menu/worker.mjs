const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
const heading = {
  "Fruit milk tea": "Milk tea",
  "Fresh fruit tea": "Fruit tea",
  "Ice cream series": "Ice cream & desserts",
  "Smoothie series": "Smoothies",
  Toppings: "Toppings",
};
const price = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});
const objectKey = "surulere-menu.json";
const maxBytes = 192 * 1024;
const security = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};
const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { ...security, "cache-control": "no-store" },
  });

export function validateMenu(body) {
  if (!body || !Array.isArray(body.items) || body.items.length > 250)
    return null;
  const valid = (s, max, required = false) =>
    typeof s === "string" && s.length <= max && (!required || !!s.trim());
  const items = [];
  for (const item of body.items) {
    if (
      !item ||
      !valid(item.code, 30, true) ||
      !valid(item.name, 120, true) ||
      !valid(item.category, 80, true) ||
      !valid(item.size, 40) ||
      !Number.isSafeInteger(item.price) ||
      item.price < 0 ||
      item.price > 100000000
    )
      return null;
    const { code, name, category, size, price } = item;
    items.push({ code, name, category, size, price });
  }
  return { items, publishedAt: new Date().toISOString() };
}

async function authorized(request, expected) {
  const supplied = request.headers.get("authorization") || "";
  if (
    !/^[a-f0-9]{64}$/.test(expected || "") ||
    !/^Bearer [a-f0-9]{64}$/.test(supplied)
  )
    return false;
  const digest = (value) =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [a, b] = await Promise.all([
    digest(supplied.slice(7)),
    digest(expected),
  ]);
  if (typeof crypto.subtle.timingSafeEqual === "function")
    return crypto.subtle.timingSafeEqual(a, b);
  return (
    new Uint8Array(a).reduce(
      (diff, byte, i) => diff | (byte ^ new Uint8Array(b)[i]),
      0,
    ) === 0
  );
}

async function readPayload(request) {
  if (
    !request.headers.get("content-type")?.startsWith("application/json") ||
    !request.body
  )
    return null;
  if (Number(request.headers.get("content-length")) > maxBytes) return null;
  const reader = request.body.getReader(),
    decoder = new TextDecoder();
  let text = "",
    bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  try {
    return validateMenu(JSON.parse(text + decoder.decode()));
  } catch {
    return null;
  }
}

function page(menu, catalog) {
  const groups = new Map();
  for (const item of menu.items) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  }
  const tabs = [...groups.keys()]
    .map(
      (name, i) =>
        `<a href="#section-${i}">${esc(Object.hasOwn(heading, name) ? heading[name] : name)}</a>`,
    )
    .join("");
  const sections = [...groups]
    .map(
      ([name, items], i) =>
        `<section id="section-${i}" class="menu-section"><header><h2>${esc(Object.hasOwn(heading, name) ? heading[name] : name)}</h2><span>${items.length} on the menu</span></header><div class="grid">${items
          .map((item) => {
            const asset = Object.hasOwn(catalog.photos, item.code)
              ? catalog.photos[item.code]
              : Object.hasOwn(catalog.fallbacks, item.category)
                ? catalog.fallbacks[item.category]
                : catalog.defaultPhoto;
            return `<article class="card" data-item data-search="${esc(`${item.name} ${item.category}`.toLowerCase())}">
        <div class="photo"><img src="/photo/${asset}" alt="" loading="lazy" decoding="async" width="360" height="360"></div>
        <div class="details"><h3>${esc(item.name)}</h3><div><span>${esc(item.size)}</span><strong>${esc(price.format(item.price / 100))}</strong></div></div></article>`;
          })
          .join("")}</div></section>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#fffdf8"><meta name="description" content="Explore milk teas, fruit teas, smoothies, ice cream and toppings at Bing Chun Surulere."><title>Menu · Bing Chun Surulere</title><link rel="stylesheet" href="/menu.css"><link rel="icon" href="/photo/${catalog.logo}"><script defer src="/menu.js"></script></head><body>
  <header class="brandbar"><div class="wrap"><span class="wordmark">BING CHUN<span>.</span></span><span class="branch">SURULERE, LAGOS</span></div></header>
  <main id="main" class="wrap">
    <div class="hero"><div class="hero-copy"><p class="eyebrow">THE SURULERE MENU</p><h1>A little joy<br>in every cup<span>.</span></h1><p>Milk teas, fruit teas and sweet treats, made to order.</p></div><img src="/photo/${catalog.logo}" alt="Bing Chun mascot" width="165" height="200"></div>
    ${sections ? `<div class="browse"><label for="search">Find something delicious</label><input id="search" type="search" placeholder="Search the menu…" autocomplete="off"><nav aria-label="Menu categories">${tabs}</nav></div><p id="no-results" role="status" hidden>No items match your search.</p>${sections}` : '<p class="empty">The menu is being updated. Please ask at the counter.</p>'}
  </main>
  <footer><div class="wrap"><b>Bing Chun Surulere</b><span>75A Bode Thomas Street, Surulere, Lagos</span></div></footer>
  </body></html>`;
}

export function createMenuWorker(catalog) {
  return {
    async fetch(request, env) {
      const path = new URL(request.url).pathname;
      if (path === "/publish") {
        if (request.method !== "POST")
          return json({ error: "Method not allowed." }, 405);
        if (!(await authorized(request, env.MENU_PUBLISH_KEY)))
          return json({ error: "Publishing is not authorized." }, 403);
        const snapshot = await readPayload(request);
        if (!snapshot)
          return json(
            { error: "The menu snapshot is invalid or too large." },
            400,
          );
        if (!env.BUCKET)
          return json({ error: "Menu storage is unavailable." }, 503);
        try {
          await env.BUCKET.put(objectKey, JSON.stringify(snapshot), {
            httpMetadata: { contentType: "application/json" },
          });
          return json({
            publishedAt: snapshot.publishedAt,
            count: snapshot.items.length,
          });
        } catch {
          return json({ error: "Menu storage is unavailable." }, 503);
        }
      }
      if (request.method !== "GET" && request.method !== "HEAD")
        return json({ error: "Method not allowed." }, 405);
      const send = (body, contentType, cache = "no-store", headers = {}) =>
        new Response(request.method === "HEAD" ? null : body, {
          headers: {
            ...security,
            "content-type": contentType,
            "cache-control": cache,
            ...headers,
          },
        });
      if (path === "/menu.css")
        return send(
          catalog.css,
          "text/css; charset=utf-8",
          "public, max-age=300",
        );
      if (path === "/menu.js")
        return send(
          catalog.script,
          "text/javascript; charset=utf-8",
          "public, max-age=300",
        );
      if (path.startsWith("/photo/")) {
        const name = path.slice(7);
        if (!Object.hasOwn(catalog.assets, name))
          return json({ error: "Photo not found." }, 404);
        return send(
          Uint8Array.from(atob(catalog.assets[name]), (c) => c.charCodeAt(0)),
          "image/webp",
          "public, max-age=31536000, immutable",
        );
      }
      if (path !== "/" && path !== "/status")
        return json({ error: "Page not found." }, 404);
      try {
        if (!env.BUCKET)
          return json({ error: "Menu storage is unavailable." }, 503);
        const object = await env.BUCKET.get(objectKey);
        const menu = object
          ? await object.json()
          : { items: [], publishedAt: null };
        if (path === "/status")
          return json({
            publishedAt: menu.publishedAt,
            count: menu.items.length,
          });
        return send(
          page(menu, catalog),
          "text/html; charset=utf-8",
          "no-cache",
          {
            "content-security-policy":
              "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'",
          },
        );
      } catch {
        return json(
          { error: "The menu is temporarily unavailable. Please try again." },
          503,
        );
      }
    },
  };
}
