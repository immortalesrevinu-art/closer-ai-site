// Closer AI members app: a read-only connection hub. Members' OWN AI (their key) analyzes public Polymarket data
// and their OWN connected accounts. Closer AI makes no picks, holds no funds, never places bets or trades.
const C = window.CLOSER_CONFIG;
const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ROOT = C.siteRoot ?? "../";
const GAMMA = "https://gamma-api.polymarket.com", CLOB = "https://clob.polymarket.com";
const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
const RUNS = { scan: ["Market scan", 1], digest: ["Digest", 3], deep: ["Deep research", 10] };
const AI = {
  xai:       { name: "xAI (Grok)", hint: "xai-…", console: "console.x.ai", models: ["grok-4.3", "grok-4.6", "grok-4.7"] },
  openai:    { name: "OpenAI", hint: "sk-…", console: "platform.openai.com", models: ["gpt-6-luna", "gpt-6.1-sol", "gpt-6-astra"] },
  anthropic: { name: "Anthropic (Claude)", hint: "sk-ant-…", console: "console.anthropic.com", models: ["claude-haiku-4-5", "claude-sonnet-5-5", "claude-opus-5-5"] },
  gemini:    { name: "Google Gemini", hint: "AIza…", console: "aistudio.google.com", models: ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.1-pro-preview"] },
  custom:    { name: "Other (OpenAI-compatible)", hint: "API key", console: "your provider", models: [] },
};
const provName = (p) => AI[p]?.name || p;
const ERR = {
  stripe_sandbox_not_configured: "Checkout isn't switched on yet (Stripe test mode is still being set up). Nothing was charged.",
  live_stripe_key_refused: "Payments are disabled: this backend only runs in Stripe test mode.",
  not_available_in_state: "Closer AI isn't available in your state.",
  active_plan_required: "This needs a paid plan.",
  ai_plan_required: "Connecting an AI is part of Connect AI ($15.99/mo) and Pro. The Free plan doesn't include AI.",
  connector_limit_reached: "You've reached your plan's AI connector limit. Remove one, or upgrade to Pro to connect more.",
  pro_plan_required: "Member bots are part of the Pro plan.", bot_limit_reached: "You've reached the Pro bot limit. Delete a bot to add another.",
  bot_not_found: "That bot wasn't found.", plan_change_needs_price_ids: "Switching plans isn't switched on yet. Try again later.",
  not_available: "That item is no longer offered.", unknown_item: "Pick a plan.",
  adult_and_terms_required: "Please confirm you're 18+ and accept the terms.",
  adult_confirmation_required: "Please confirm you're 18+.",
  already_subscribed: "You're already on this plan.",
  sign_in_required: "Please log in again.",
  ai_key_required: "Connect your own AI provider key on the Account page first.",
  ai_key_rejected: "Your AI provider rejected this API key. Check it in their console and save it again.",
  invalid_key_format: "That doesn't look like a valid API key for the selected provider.",
  invalid_model: "Enter a valid model ID.", unknown_provider: "Pick an AI provider.",
  provider_unreachable: "Couldn't reach your AI provider right now. Try again in a minute.",
  provider_redirect_refused: "Your endpoint tried to redirect; redirects aren't allowed. Use the final API URL.",
  ai_no_credits: "Your AI provider account is out of credits/quota. Top it up with them.",
  ai_rate_limited: "Your AI provider is rate-limiting your key. Wait a moment and try again.",
  ai_model_unavailable: "That model isn't available on your key. Pick another model on the Account page.",
  ai_request_failed: "The AI request failed. Try again.",
  invalid_base_url: "Enter a valid base URL, e.g. https://api.example.com/v1", base_url_must_be_https: "The base URL must start with https://",
  base_url_port_not_allowed: "Custom ports aren't allowed.", base_url_private_address: "That address is private or local and can't be used.",
  base_url_ip_literal_not_allowed: "Use a hostname, not an IP address.", base_url_unresolvable: "That hostname doesn't resolve.",
  rate_limited: "Too many runs this hour. Try again later.",
  market_data_unavailable: "Public market data is unavailable right now.", market_not_found: "That market wasn't found.",
  brokerage_not_configured: "Brokerage connections aren't switched on yet. Coming soon.", delete_failed: "Couldn't remove it. Try again.", save_failed: "Couldn't save. Try again.",
  brokerage_not_connected: "Connect a brokerage first.", brokerage_unavailable: "The brokerage connection service is unavailable. Try again later.",
};
const PLAN_CODES = new Set(["ai_plan_required", "connector_limit_reached", "pro_plan_required", "bot_limit_reached", "active_plan_required"]);
const PLANS = { // display defaults; live values come from public.plan_limits
  free: { label: "Free", price_cents: 0, ai_connectors: 0, runs_per_hour: 0, bots: 0 },
  connect: { label: "Connect AI", price_cents: 1599, ai_connectors: 1, runs_per_hour: 60, bots: 0 },
  pro: { label: "Pro", price_cents: 3999, ai_connectors: 5, runs_per_hour: 200, bots: 10 },
};
const usd = (c) => "$" + (c / 100).toFixed(2).replace(/\.00$/, "");
const HUB = `<div class="hub"><b>How Closer AI works:</b> it's only a connection hub. <b>Your own AI</b> (your key) analyzes <b>your own connected accounts</b> and public market data. Closer AI gives no picks or suggestions of its own. Your money never leaves your brokerage or market account; Closer AI holds no funds and has <b>read-only</b> access.</div>`;

// ---------- categories (built from Polymarket public tags) ----------
// Seed top-level slugs (all verified against gamma /events?tag_slug=). Leagues + trending topics are added at runtime.
const SEED = [["politics", "Politics"], ["sports", "Sports"], ["__leagues"], ["elections", "Elections"], ["pop-culture", "Culture"], ["crypto", "Crypto"],
  ["economy", "Economics"], ["finance", "Finance"], ["business", "Business"], ["tech", "Tech"], ["ai", "AI"], ["science", "Science"],
  ["weather", "Climate & Weather"], ["world", "World"], ["geopolitics", "Geopolitics"], ["mention-markets", "Mentions"], ["tweets-markets", "Tweets"], ["earnings", "Earnings"]];
const NOISE = new Set(["games", "recurring", "hide-from-new", "weekly", "monthly", "daily", "earn-4", "multi-strikes", "hit-price", "finance-updown", "pyth-finance", "main-election",
  "daily-temperature", "highest-temperature", "crypto-prices", "up-or-down", "featured", "breaking", "new", "all", "derivatives"]);
const isNoise = (s) => NOISE.has(s) || /^rewards|^earn-|updown|^pyth/.test(s);
const cache = new Map();
async function getJSON(url, ttl = 60000) {
  const hit = cache.get(url); if (hit && Date.now() - hit.t < ttl) return hit.v;
  const r = await fetch(url); if (!r.ok) throw new Error("http " + r.status);
  const v = await r.json(); cache.set(url, { t: Date.now(), v }); return v;
}
async function related(slug) {
  const key = "rel2:" + slug, ls = JSON.parse(localStorage.getItem(key) || "null");
  if (ls && Date.now() - ls.t < 30 * 60000) return ls.v;
  const d = await getJSON(`${GAMMA}/tags/slug/${encodeURIComponent(slug)}/related-tags/tags?status=active&omit_empty=true`, 30 * 60000).catch(() => []);
  const v = (Array.isArray(d) ? d : []).filter((t) => t.slug && !isNoise(t.slug)).map((t) => ({ slug: t.slug, label: String(t.label || t.slug).replace(/\s*\(All\)/i, ""), n: t.activeEventsCount || 0 })).sort((a, b) => b.n - a.n);
  localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); return v;
}
let CATS = SEED.filter((s) => s[1]).map(([slug, label]) => ({ slug, label })), TOPICS = [];
async function buildCats() {
  const leagues = (await related("sports")).filter((t) => t.n >= 20).slice(0, 10).map((t) => ({ slug: t.slug, label: t.label.replace(/\s*\(All\)/, ""), league: true }));
  const list = [];
  for (const s of SEED) { if (s[0] === "__leagues") list.push(...leagues); else list.push({ slug: s[0], label: s[1] }); }
  CATS = list; renderCats();
}
function topicsFrom(events) { // dynamic "trending topics": frequent tags in the current top events that aren't already categories
  const have = new Set(CATS.map((c) => c.slug)), cnt = new Map();
  events.forEach((e) => (e.tags || []).forEach((t) => { if (!have.has(t.slug) && !isNoise(t.slug)) cnt.set(t.slug, { label: t.label, n: (cnt.get(t.slug)?.n || 0) + 1 }); }));
  const v = [...cnt].filter(([s, x]) => x.n >= 2 && !/^(united-states|world-elections|global-elections|us-presidential-election)$/.test(s)).sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([slug, x]) => ({ slug, label: x.label.replace(/^\w/, (c) => c.toUpperCase()), topic: true }));
  if (v.length && JSON.stringify(v) !== JSON.stringify(TOPICS)) { TOPICS = v; renderCats(); }
}
const qs = () => new URLSearchParams(location.hash.split("?")[1] || "");
const route = () => (location.hash.slice(1).split("?")[0]) || "/markets";
function renderCats() {
  const r = route(), cat = qs().get("cat") || (r === "/markets" ? "trending" : ""), live = r === "/live";
  const a = (slug, label, cls = "") => `<a href="#/markets?cat=${encodeURIComponent(slug)}" class="${cls}${cat === slug ? " on" : ""}">${esc(label)}</a>`;
  $("#cats").innerHTML = a("trending", "Trending") + `<a href="#/live" class="live${live ? " on" : ""}">Live</a>` + a("new", "New") + `<span class="sep"></span>`
    + CATS.map((c) => a(c.slug, c.label)).join("") + (TOPICS.length ? `<span class="sep"></span>` + TOPICS.map((c) => a(c.slug, c.label)).join("") : "");
  const on = $("#cats a.on"); if (on && !renderCats.did) { on.scrollIntoView({ inline: "center", block: "nearest" }); }
}

// ---------- market helpers ----------
const J = (x, d = []) => { try { return typeof x === "string" ? JSON.parse(x) : (x ?? d); } catch { return d; } };
const pct = (p) => p == null || isNaN(p) ? "–" : p < 0.01 && p > 0 ? "<1%" : p > 0.99 && p < 1 ? ">99%" : Math.round(p * 100) + "%";
const mult = (p) => !(p > 0) || p >= 1 ? "–" : p < 0.005 ? ">200x" : (1 / p).toFixed(p > 0.5 ? 2 : 1) + "x";
const money = (v) => { v = Number(v || 0); return v >= 1e9 ? "$" + (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? "$" + Math.round(v / 1e3) + "K" : "$" + Math.round(v); };
const COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];
function rows(e) { // outcome rows for an event: [{label, p, token}]
  const ms = (e.markets || []).filter((m) => m.active !== false && !m.closed);
  if (!ms.length) return [];
  const yesNo = (m) => { const o = J(m.outcomes); return o.length === 2 && /^yes$/i.test(o[0]); };
  const one = ms.find((m) => m.sportsMarketType === "moneyline") || (ms.length === 1 ? ms[0] : (!e.negRisk && !yesNo(ms[0]) ? ms[0] : null));
  if (one) {
    const o = J(one.outcomes), p = J(one.outcomePrices).map(Number), t = J(one.clobTokenIds);
    return o.map((label, i) => ({ label, p: p[i], token: t[i], yesno: yesNo(one), m: one }));
  }
  let r = ms.map((m) => ({ label: m.groupItemTitle || m.question, p: Number(J(m.outcomePrices)[0]), token: J(m.clobTokenIds)[0], m }));
  if (e.negRisk) r.sort((a, b) => (b.p || 0) - (a.p || 0));
  return r;
}
let ALERTS = null;
async function alerts() {
  if (!ALERTS) ALERTS = fetch(C.publicData + "alerts.json").then((r) => r.json()).then((d) => d.log || []).catch(() => []);
  return ALERTS;
}
const alertFor = (slug, al) => al.filter((a) => a.slug === slug);
const AIICON = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z"/></svg>`;
const aiBtn = (slug, cls = "sm") => `<button class="btn ai ${cls}" data-ask="${esc(slug)}">${AIICON}Ask your AI</button>`;
const alertBadge = (n) => n ? `<span class="badge" title="Public Polymarket activity: 2+ top traders on the same outcome. Information only, not a recommendation.">⚡ Smart-money alert${n > 1 ? " ×" + n : ""}</span>` : "";
const isLive = (e) => e.startTime && new Date(e.startTime) <= new Date() && new Date(e.endDate) > new Date(Date.now() - 6 * 3600e3);

function card(e, al) {
  const r = rows(e), shown = r.slice(0, 3), n = alertFor(e.slug, al).length;
  return `<article class="card mc"><a class="hd" href="#/market/${esc(e.slug)}"><img class="thumb sm" loading="lazy" src="${esc(e.icon || e.image || "")}" alt="" onerror="this.style.visibility='hidden'"><h3>${esc(e.title)}</h3></a>
    ${n || isLive(e) ? `<div>${isLive(e) ? `<span class="badge live">LIVE</span> ` : ""}${alertBadge(n)}</div>` : ""}
    <div class="rows">${shown.map((o) => `<div class="mr"><span class="l">${esc(o.label)}</span><span class="p">${pct(o.p)}</span><span class="pill${o.yesno && /^no$/i.test(o.label) ? " no" : ""}">${mult(o.p)}</span></div>`).join("")}
    ${r.length > 3 ? `<a class="mute" style="font-size:12.5px" href="#/market/${esc(e.slug)}">+${r.length - 3} more outcomes</a>` : ""}</div>
    <div class="ft"><span>${money(e.volume)} vol${e.volume24hr ? ` · ${money(e.volume24hr)} 24h` : ""}</span>${aiBtn(e.slug)}</div></article>`;
}

async function history(token, interval = "1w") {
  const fid = { "1d": 10, "1w": 60, "1m": 240, max: 1440 }[interval] || 60;
  const d = await getJSON(`${CLOB}/prices-history?market=${token}&interval=${interval}&fidelity=${fid}`, 120000).catch(() => ({ history: [] }));
  return (d.history || []).map((x) => [x.t, x.p]);
}
async function chartSVG(series, w = 640, h = 240) {
  const pts = series.flatMap((s) => s.h); if (pts.length < 2) return `<p class="mute" style="padding:30px 0;text-align:center">No price history yet.</p>`;
  const t0 = Math.min(...pts.map((p) => p[0])), t1 = Math.max(...pts.map((p) => p[0]));
  const L = 6, R = 40, T = 10, B = 22, X = (t) => L + (t - t0) / Math.max(1, t1 - t0) * (w - L - R), Y = (p) => T + (1 - p) * (h - T - B);
  const grid = [0, .25, .5, .75, 1].map((g) => `<line x1="${L}" x2="${w - R}" y1="${Y(g)}" y2="${Y(g)}" style="stroke:var(--grid)"/><text x="${w - R + 6}" y="${Y(g) + 4}">${g * 100}%</text>`).join("");
  const fmt = (t) => new Date(t * 1000).toLocaleDateString([], { month: "short", day: "numeric" });
  const lines = series.map((s, i) => s.h.length ? `<polyline fill="none" style="stroke:${COLORS[i % 6]}" stroke-width="2" stroke-linejoin="round" points="${s.h.map(([t, p]) => X(t).toFixed(1) + "," + Y(p).toFixed(1)).join(" ")}"/><circle cx="${X(s.h.at(-1)[0])}" cy="${Y(s.h.at(-1)[1])}" r="3.5" style="fill:${COLORS[i % 6]}"/>` : "").join("");
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Price history">${grid}${lines}<text x="${L}" y="${h - 5}">${fmt(t0)}</text><text x="${w - R}" y="${h - 5}" text-anchor="end">${fmt(t1)}</text></svg>`;
}
async function drawChart(el, e, n = 4, interval = "1w") {
  const r = rows(e).filter((o) => o.token && !(o.yesno && /^no$/i.test(o.label))).slice(0, n);
  const series = await Promise.all(r.map(async (o) => ({ o, h: await history(o.token, interval) })));
  if (!el.isConnected) return;
  el.innerHTML = `<div class="legend">${r.map((o, i) => `<span><i style="background:${COLORS[i]}"></i>${esc(o.label)} <b>${pct(o.p)}</b></span>`).join("")}</div>` + await chartSVG(series);
}

// ---------- auth context ----------
let ctx = { session: null, betaPlan: null, profile: null, sub: null, key: null, keys: [], plan: null, bots: [], brk: [] };
let keep = false;
function go(hash, msg, err = false) { keep = true; location.hash = hash; flash(msg, err); }
let lastErr = "";
function flash(msg, err = false) { $("#flash").innerHTML = msg ? `<div class="flash${err ? " err" : ""}">${esc(msg)}${err && PLAN_CODES.has(lastErr) ? ` <a href="#/pricing"><u>See plans</u></a>` : ""}</div>` : ""; lastErr = ""; }
const paid = () => ctx.sub && ctx.sub.status === "active" && new Date(ctx.sub.current_period_end) > new Date();
const planId = () => ctx.plan?.plan || "free";
const hasAI = () => planId() === "connect" || planId() === "pro";
const isPro = () => planId() === "pro";
const limits = (id = planId()) => PLANS[id] || PLANS.free;
async function fnError(error) { try { const j = await error.context.json(); lastErr = j.error || ""; return ERR[j.error] || j.message || j.error || error.message; } catch { lastErr = ""; return error.message; } }
const dbError = (e) => { const m = String(e?.message || ""); const c = ["pro_plan_required", "bot_limit_reached", "ai_plan_required", "connector_limit_reached"].find((k) => m.includes(k)) || (/row-level security/i.test(m) ? "pro_plan_required" : ""); lastErr = c; return ERR[c] || "Couldn't save. Try again."; };
let plansLoaded = false;
async function loadPlans() {
  if (plansLoaded) return; const { data } = await sb.from("plan_limits").select("*");
  (data || []).forEach((r) => { PLANS[r.plan] = { ...PLANS[r.plan], ...r }; }); plansLoaded = !!data;
}
async function loadCtx() {
  const { data: { session } } = await sb.auth.getSession();
  const [{ data: st }] = await Promise.all([sb.from("app_settings").select("value").eq("key", "beta_plan").maybeSingle(), loadPlans()]);
  ctx.betaPlan = typeof st?.value === "string" ? st.value : null; ctx.session = session;
  ctx.profile = ctx.sub = ctx.key = ctx.plan = null; ctx.keys = []; ctx.bots = []; ctx.brk = [];
  if (!session) return;
  const [p, s, k, b, pl] = await Promise.all([
    sb.from("profiles").select("*").maybeSingle(), sb.from("subscriptions").select("*").maybeSingle(),
    sb.from("user_ai_keys").select("id,provider,model,base_url,last4,status,tested_at,updated_at,is_default,created_at").order("is_default", { ascending: false }).order("created_at"), // key itself is never readable
    sb.from("brokerage_accounts").select("id,institution,name,number_mask,synced_at").order("institution"),
    sb.rpc("my_plan"),
  ]);
  ctx.profile = p.data; ctx.sub = s.data; ctx.keys = k.data || []; ctx.brk = b.data || [];
  ctx.plan = (pl.data || [])[0] || { plan: "free", ai_connectors: 0, bots: 0 };
  ctx.key = ctx.keys.find((x) => x.is_default) || ctx.keys[0] || null;
  if (isPro()) { const { data: bt } = await sb.from("member_bots").select("*").order("created_at"); ctx.bots = bt || []; }
}
const ICON = { markets: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2" stroke="currentColor" stroke-width="2" fill="none"/>', live: '<circle cx="12" cy="12" r="4" fill="currentColor"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/>',
  research: AIICON.match(/<path[^>]+>/)[0], alerts: '<path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor"/>', account: '<circle cx="12" cy="8" r="4" fill="currentColor"/><path d="M4 21c1-5 15-5 16 0" fill="currentColor"/>' };
function nav() {
  const r = route(), on = (h) => (r === h || (h === "/markets" && r.startsWith("/market"))) ? "on" : "";
  const items = [["/markets", "Markets"], ["/live", "Live"], ["/research", "Research"], ["/alerts", "Alerts"]];
  $("#nav").innerHTML = items.map(([h, l]) => `<a href="#${h}" class="${on(h)}">${l}</a>`).join("") + `<a href="${ROOT}bots.html">My bots</a><a href="#/account" class="${on("/account")}">Account</a>`;
  $("#authnav").innerHTML = ctx.session ? `<button class="btn ghost sm" id="logout">Log out</button>` : `<a class="btn ghost sm" href="#/login">Log in</a><a class="btn sm" href="#/signup">Sign up</a>`;
  const mm = $("#moremenu"); if (mm) mm.innerHTML = `<details class="more-menu"><summary aria-label="More pages"><span class="more-l">More</span><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></summary>
    <div class="more-pop"><a href="${ROOT}dashboard.html">Live dashboard <small>top traders</small></a><a href="${ROOT}results.html">Alert results</a><a href="${ROOT}bots.html">My bots</a><a href="#/research">Research</a><a href="#/alerts">Alerts</a><a href="#/pricing">Plans &amp; pricing <small>Free · $15.99 · $39.99</small></a><a href="${ROOT}about.html">About Closer AI</a></div></details>`;
  const lo = $("#logout"); if (lo) lo.onclick = async () => { await sb.auth.signOut(); location.hash = "#/markets"; };
  $("#mobnav").innerHTML = [["/markets", "Markets", "markets"], ["/live", "Live", "live"], ["/research", "Research", "research"], ["/alerts", "Alerts", "alerts"], ["/account", "Account", "account"]]
    .map(([h, l, i]) => `<a href="#${h}" class="${on(h)}"><svg viewBox="0 0 24 24">${ICON[i]}</svg>${l}</a>`).join("");
  const q = qs().get("q"); if (q != null && document.activeElement !== $("#q")) $("#q").value = q;
  renderCats();
}
const blockedBox = () => ctx.profile && ctx.profile.state_blocked
  ? `<div class="flash err">Closer AI isn't available in your state${ctx.profile.state ? ` (${esc(ctx.profile.state)})` : ""}. AI features and connections are disabled for this account.</div>` : "";
const upgradeBox = (title, text, inModal = false) => `<h2>${title}</h2><p class="mute" style="margin-top:8px">${text}</p><p style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><a class="btn" href="#/pricing" ${inModal ? "data-close" : ""}>See plans</a></p>`;
const CK = `<svg class="ck" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const NO = `<svg class="ck no" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const gate = (what = "this") => `<h1>Please log in</h1><p class="mute">Log in to use ${what}.</p><p style="display:flex;gap:8px"><a class="btn" href="#/login">Log in</a><a class="btn ghost" href="#/signup">Sign up</a></p>`;

// ---------- views ----------
const PAGE = 24;
async function listEvents({ cat, sub, q, offset = 0, live }) {
  if (q) {
    const d = await getJSON(`${GAMMA}/public-search?q=${encodeURIComponent(q)}&events_status=active&limit_per_type=${PAGE}&page=${offset / PAGE + 1}`);
    return (d.events || []).filter((e) => e.active && !e.closed);
  }
  let u = `${GAMMA}/events?active=true&closed=false&archived=false&limit=${PAGE}&offset=${offset}`;
  if (live) { const n = new Date(); u += `&order=volume24hr&ascending=false&end_date_min=${new Date(n - 3 * 3600e3).toISOString()}&end_date_max=${new Date(+n + 24 * 3600e3).toISOString()}`; }
  else if (cat === "new") u += "&order=startDate&ascending=false";
  else u += "&order=volume24hr&ascending=false";
  const tag = sub || (!live && cat && cat !== "trending" && cat !== "new" ? cat : "");
  if (tag) u += `&tag_slug=${encodeURIComponent(tag)}`;
  return getJSON(u);
}
async function marketsView(live = false) {
  const p = qs(), cat = live ? "live" : (p.get("cat") || "trending"), sub = p.get("sub") || "", q = p.get("q") || "";
  const catObj = [...CATS, ...TOPICS].find((c) => c.slug === cat);
  const title = q ? `Results for “${q}”` : live ? "Live & ending soon" : cat === "trending" ? "Trending" : cat === "new" ? "New markets" : (catObj?.label || cat);
  let subs = [];
  if (!q && !live && cat !== "trending" && cat !== "new") subs = await related(cat);
  if (cat === "trending" || cat === "new" || live) subs = CATS.map((c) => ({ slug: c.slug, label: c.label, cat: true }));
  const href = (s) => s.cat ? `#/markets?cat=${encodeURIComponent(s.slug)}` : `#/markets?cat=${encodeURIComponent(cat)}&sub=${encodeURIComponent(s.slug)}`;
  const subOn = (s) => !s.cat && s.slug === sub;
  const allHref = live ? "#/live" : `#/markets?cat=${encodeURIComponent(cat)}`;
  const side = `<aside class="side"><h3>${subs[0]?.cat ? "Categories" : esc(title)}</h3><a href="${allHref}" class="${sub ? "" : "on"}">All</a>${subs.slice(0, 40).map((s) => `<a href="${href(s)}" class="${subOn(s) ? "on" : ""}"><span>${esc(s.label)}</span>${s.n ? `<small>${s.n}</small>` : ""}</a>`).join("")}</aside>`;
  const chips = subs.length ? `<div class="subchips"><a href="${allHref}" class="${sub ? "" : "on"}">All</a>${subs.slice(0, 40).map((s) => `<a href="${href(s)}" class="${subOn(s) ? "on" : ""}">${esc(s.label)}</a>`).join("")}</div>` : "";
  const subLabel = sub ? (subs.find((s) => s.slug === sub)?.label || sub) : "";
  setTimeout(() => fillMarkets({ cat, sub, q, live }));
  return `<div class="layout">${q ? "<div></div>" : side}<section>${chips}<h1>${esc(title)}${subLabel ? ` <span class="mute" style="font-weight:600">· ${esc(subLabel)}</span>` : ""}</h1>
    <div id="feat"><div class="skel" style="min-height:320px;margin-bottom:22px"></div></div><div class="grid" id="grid">${'<div class="skel"></div>'.repeat(6)}</div><div class="more" id="more"></div></section></div>`;
}
async function fillMarkets(opt) {
  const my = seq; let evs;
  try { evs = await listEvents(opt); } catch { if (my === seq) $("#grid").innerHTML = `<p class="mute">Couldn't load Polymarket data. Try again shortly.</p>`; return; }
  const al = await alerts(); if (my !== seq || !$("#grid")) return;
  evs = evs.filter((e) => rows(e).length);
  if (opt.cat === "trending" && !opt.sub && !opt.q) topicsFrom(evs);
  if (!evs.length) { $("#feat").innerHTML = ""; $("#grid").innerHTML = `<p class="mute">No open markets here right now.</p>`; return; }
  const f = evs[0], fr = rows(f), nA = alertFor(f.slug, al).length;
  $("#feat").innerHTML = `<article class="feat"><div><a class="hd" href="#/market/${esc(f.slug)}"><img class="thumb" src="${esc(f.image || f.icon || "")}" alt="" onerror="this.style.visibility='hidden'"><div><h2>${esc(f.title)}</h2>
      <div class="meta"><span>${money(f.volume)} vol</span>${f.endDate ? `<span>Ends ${new Date(f.endDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>` : ""}${isLive(f) ? `<span class="badge live">LIVE</span>` : ""}${alertBadge(nA)}</div></div></a>
      <div id="fchart"><div class="skel" style="min-height:220px;margin-top:10px"></div></div></div>
    <div>${fr.slice(0, 5).map((o, i) => `<div class="orow"><div class="nm"><i style="width:9px;height:9px;border-radius:50%;flex:none;background:${o.yesno && /^no$/i.test(o.label) ? "var(--red)" : COLORS[i % 6]}"></i><span>${esc(o.label)}</span></div><div class="pc">${pct(o.p)}</div><span class="pill${o.yesno && /^no$/i.test(o.label) ? " no" : ""}">${mult(o.p)} <small>payout</small></span></div>`).join("")}
      ${fr.length > 5 ? `<a class="mute" href="#/market/${esc(f.slug)}" style="display:block;padding:8px 0;font-size:13px">See all ${fr.length} outcomes →</a>` : ""}
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">${aiBtn(f.slug, "")}<a class="btn ghost" href="#/market/${esc(f.slug)}">Details</a></div>
      <p class="mute" style="font-size:11.5px;margin:10px 0 0">Payout = 1 ÷ price, e.g. 66% → 1.52x. Read-only data; Closer AI never places bets.</p></div></article>`;
  drawChart($("#fchart"), f, 4);
  $("#grid").innerHTML = evs.slice(1).map((e) => card(e, al)).join("");
  let off = PAGE;
  const more = () => { $("#more").innerHTML = evs.length >= PAGE - 1 ? `<button class="btn ghost" id="lm">Load more</button>` : ""; const b = $("#lm"); if (b) b.onclick = async () => {
    b.disabled = true; b.textContent = "Loading…"; let n = []; try { n = (await listEvents({ ...opt, offset: off })).filter((e) => rows(e).length); } catch { /* ignore */ }
    off += PAGE; $("#grid").insertAdjacentHTML("beforeend", n.map((e) => card(e, al)).join("")); evs = n.length ? n : []; more(); }; };
  more();
}
async function marketView(slug) {
  let e; try { e = (await getJSON(`${GAMMA}/events?slug=${encodeURIComponent(slug)}`))[0]; } catch { /* */ }
  if (!e) return `<h1>Market not found</h1><p><a class="btn ghost" href="#/markets">Back to markets</a></p>`;
  const al = alertFor(slug, await alerts()), r = rows(e), closed = e.closed || !r.length;
  const all = closed ? (e.markets || []).map((m) => ({ label: m.groupItemTitle || m.question, p: Number(J(m.outcomePrices)[0]) })) : r;
  setTimeout(() => {
    const el = $("#dchart"); if (!el) return; drawChart(el, e, 6);
    document.querySelectorAll("[data-int]").forEach((b) => b.onclick = () => { document.querySelectorAll("[data-int]").forEach((x) => x.classList.toggle("on", x === b)); el.innerHTML = '<div class="skel" style="min-height:220px"></div>'; drawChart(el, e, 6, b.dataset.int); });
  });
  const tagLinks = (e.tags || []).filter((t) => !isNoise(t.slug)).slice(0, 6).map((t) => `<a class="tag" href="#/markets?cat=${encodeURIComponent(t.slug)}">${esc(t.label)}</a>`).join("");
  return `<p style="margin:14px 0 4px"><a class="mute" href="javascript:history.back()">← Back</a></p>
    <article class="feat" style="grid-template-columns:1.4fr 1fr"><div><div class="hd"><img class="thumb" src="${esc(e.image || e.icon || "")}" alt="" onerror="this.style.visibility='hidden'"><div><h2>${esc(e.title)}</h2>
      <div class="meta"><span>${money(e.volume)} vol</span>${e.volume24hr ? `<span>${money(e.volume24hr)} 24h</span>` : ""}${e.endDate ? `<span>Ends ${new Date(e.endDate).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>` : ""}${closed ? `<span class="tag">Closed</span>` : ""}${isLive(e) ? `<span class="badge live">LIVE</span>` : ""}</div></div></div>
      <div style="margin:6px 0">${tagLinks}</div>
      <div style="display:flex;gap:8px;margin:10px 0 4px;flex-wrap:wrap">${closed ? "" : aiBtn(e.slug, "")}<a class="btn ghost" href="https://polymarket.com/event/${esc(e.slug)}" target="_blank" rel="noopener">Source: Polymarket ↗</a></div>
      ${closed ? "" : `<div class="tabs">${[["1d", "1D"], ["1w", "1W"], ["1m", "1M"], ["max", "All"]].map(([k, l]) => `<button data-int="${k}" class="${k === "1w" ? "on" : ""}">${l}</button>`).join("")}</div><div id="dchart"><div class="skel" style="min-height:220px;margin-top:10px"></div></div>`}
      ${al.length ? `<div class="card pad" style="margin-top:14px;background:var(--alertbg);border-color:var(--goldline)"><b>⚡ Smart-money activity (public data)</b>${al.map((a) => `<p class="mute" style="margin:6px 0 0;font-size:13px">${esc(a.n)} top traders on <b>${esc(a.outcome)}</b> (${esc(a.title)}) · their avg ${Math.round((a.their_avg || 0) * 100)}¢${a.result ? ` · result: ${esc(a.result)}` : ""}</p>`).join("")}<p class="mute" style="font-size:11.5px;margin:6px 0 0">Observed public wallet activity. Not a pick or recommendation from Closer AI.</p></div>` : ""}
      ${e.description ? `<details style="margin-top:14px"><summary class="mute">Rules / description</summary><p style="white-space:pre-wrap;font-size:13px">${esc(e.description)}</p></details>` : ""}</div>
    <div>${all.map((o, i) => `<div class="orow"><div class="nm"><i style="width:9px;height:9px;border-radius:50%;flex:none;background:${o.yesno && /^no$/i.test(o.label) ? "var(--red)" : i < 6 ? COLORS[i] : "var(--line)"}"></i><span>${esc(o.label)}</span></div><div class="pc">${pct(o.p)}</div><span class="pill${o.yesno && /^no$/i.test(o.label) ? " no" : ""}">${mult(o.p)}</span></div>`).join("")}
      <p class="mute" style="font-size:11.5px;margin:10px 0 0">Prices are public Polymarket prices. Payout multiple = 1 ÷ price. Read-only; Closer AI never places bets or trades.</p></div></article>`;
}

// ---------- Ask your AI ----------
function modal(html) { const m = $("#modal"); m.innerHTML = `<div class="mbox"><button class="x" aria-label="Close" data-close>×</button>${html}</div>`; m.hidden = false; }
function closeModal() { $("#modal").hidden = true; $("#modal").innerHTML = ""; }
async function ask(slug) {
  if (!ctx.session) return modal(`<h2>Ask your own AI</h2><p class="mute" style="margin-top:8px">Log in, connect your own AI key, and your AI will analyze this market's public data for you. Closer AI gives no picks of its own.</p><p style="display:flex;gap:8px;margin-top:12px"><a class="btn" href="#/login" data-close>Log in</a><a class="btn ghost" href="#/signup" data-close>Sign up</a></p>`);
  if (ctx.profile?.state_blocked) return modal(`<h2>Ask your AI</h2>${blockedBox()}`);
  if (!hasAI()) return modal(upgradeBox("Ask your AI", "Your plan is Free, which covers markets, dashboards and stats. Connecting your own AI to analyze markets and your connected accounts is part of <b>Connect AI</b> (1 AI connector) or <b>Pro</b> (several connectors plus your own research and alert bots).", true));
  if (!ctx.key) return modal(`<h2>Connect your AI first</h2><p class="mute" style="margin-top:8px">Pick a provider (Grok, OpenAI, Claude, Gemini or any OpenAI-compatible API) and paste your own key. Your provider bills you directly.</p><p style="margin-top:12px"><a class="btn" href="#/account" data-close>Connect your AI</a></p>`);
  if (ctx.key.status === "invalid") return modal(`<h2>Ask your AI</h2><div class="flash err">Your saved ${esc(provName(ctx.key.provider))} key was rejected by the provider.</div><p><a class="btn" href="#/account" data-close>Replace your key</a></p>`);
  const hasBrk = ctx.brk.length > 0, multi = isPro() && ctx.keys.length > 1;
  modal(`<h2>Ask your AI</h2><p class="mute" style="margin:6px 0 10px;font-size:13px">${multi ? `<select id="askprov" aria-label="AI connector" style="background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:4px 6px">${ctx.keys.filter((x) => x.status !== "invalid").map((x) => `<option value="${esc(x.provider)}" ${x.is_default ? "selected" : ""}>${esc(provName(x.provider))} · ${esc(x.model || "")}</option>`).join("")}</select>` : `${esc(provName(ctx.key.provider))} · <code>${esc(ctx.key.model || "")}</code>`} · billed to your provider account</p>
    ${hasBrk ? `<label class="mute" style="display:flex;gap:8px;font-size:13px;margin-bottom:10px"><input type="checkbox" id="inclH"> Include my brokerage holdings (read-only snapshot) as context</label>` : ""}
    <div id="askout"><div class="skel" style="min-height:120px"></div><p class="mute" style="font-size:12px">Your AI is reading the public market data…</p></div>`);
  const run = async (inc) => {
    const prov = $("#askprov")?.value;
    const { data, error } = await sb.functions.invoke("research-run", { body: { kind: "scan", event_slug: slug, include_holdings: !!inc, ...(prov ? { provider: prov } : {}) } });
    const out = $("#askout"); if (!out) return;
    if (error) { const msg = await fnError(error); out.innerHTML = `<div class="flash err">${esc(msg)}</div>${PLAN_CODES.has(lastErr) ? `<a class="btn sm" href="#/pricing" data-close>See plans</a>` : /key|model|provider/i.test(msg) ? `<a class="btn ghost sm" href="#/account" data-close>Open Account</a>` : ""}`; lastErr = ""; return; }
    out.innerHTML = `<div class="ans">${esc(data.result.summary)}</div><p class="mute" style="font-size:11.5px;margin-top:8px">${esc(data.result.disclaimer)}${data.result.usage?.total_tokens ? ` · ${data.result.usage.total_tokens} tokens` : ""}</p>`;
  };
  const cb = $("#inclH"); if (cb) cb.onchange = () => { $("#askout").innerHTML = '<div class="skel" style="min-height:120px"></div>'; run(cb.checked); };
  const ap = $("#askprov"); if (ap) ap.onchange = () => { $("#askout").innerHTML = '<div class="skel" style="min-height:120px"></div>'; run(cb?.checked); };
  run(false);
}
document.addEventListener("click", async (e) => {
  const a = e.target.closest("[data-ask]"); if (a) { e.preventDefault(); return ask(a.dataset.ask); }
  if (e.target.closest("[data-close]") || e.target.id === "modal") closeModal();
  const b = e.target.closest("[data-buy]"); if (!b) return;
  if (!ctx.session) { go("#/signup", "Create a free account first, then pick your plan."); return; }
  b.disabled = true; const { data, error } = await sb.functions.invoke("create-checkout", { body: { item: b.dataset.buy } }); b.disabled = false;
  if (error) return flash(await fnError(error), true); if (data?.url) location.href = data.url; else if (data?.switched) { flash(`Plan switched to ${limits(data.plan).label}.`); render(); }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
$("#srch").onsubmit = (e) => { e.preventDefault(); const v = $("#q").value.trim(); location.hash = v ? `#/markets?q=${encodeURIComponent(v)}` : "#/markets"; };

const views = {
  "/markets": () => marketsView(false),
  "/live": () => marketsView(true),
  "/alerts": async () => {
    const [al, bots] = await Promise.all([alerts(), fetch(C.publicData + "bots.json").then((r) => r.json()).catch(() => ({}))]);
    const t = bots.totals || {}, p = (x) => x == null ? "–" : (x > 0 ? "+" : "") + x.toFixed(1) + "%";
    const list = [...al].sort((a, b) => (b.at || 0) - (a.at || 0));
    return `<h1 style="margin-top:18px">Smart-money alerts</h1><p class="mute" style="margin-top:-8px">Public Polymarket activity: 2+ top sports traders on the same outcome. Observations, not picks: Closer AI makes no suggestions. Ask your own AI to analyze any market.</p>
      <section class="card tblwrap" style="margin:14px 0"><table><thead><tr><th>Market</th><th>Outcome</th><th class="num">Traders</th><th class="num">Their avg</th><th class="num">Now</th><th>Result</th><th></th></tr></thead><tbody>
      ${list.map((a) => `<tr><td><a href="#/market/${esc(a.slug)}"><b>${esc(a.title)}</b></a><br><span class="mute" style="font-size:12px">${a.at ? new Date(a.at * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : ""}</span></td><td>${esc(a.outcome)}</td><td class="num">${esc(a.n)}</td><td class="num">${Math.round((a.their_avg || 0) * 100)}¢</td><td class="num">${a.ask_now != null ? Math.round(a.ask_now * 100) + "¢" : "–"}</td><td>${esc(a.result || "open")}</td><td>${a.result ? "" : aiBtn(a.slug)}</td></tr>`).join("") || `<tr><td colspan=7 class=mute>No alerts yet.</td></tr>`}</tbody></table></section>
      <section class="card"><div class="card-h"><h2>Our bots (aggregated) <span class="sub">${t.settled || 0} settled · ${t.wins || 0}–${t.losses || 0} · ROI ${p(t.roi_pct)}</span></h2></div><div class="tblwrap"><table><thead><tr><th>Strategy</th><th class="num">Settled</th><th class="num">W–L</th><th class="num">ROI</th></tr></thead><tbody>
      ${(bots.strategies || []).map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${x.settled}</td><td class="num">${x.wins}–${x.losses}</td><td class="num">${p(x.roi_pct)}</td></tr>`).join("")}</tbody></table></div>
      <p class="mute" style="padding:0 16px 14px;font-size:12px">Totals from our own accounts. Not a promise of future results and not advice. <a href="${ROOT}bots.html">Full bot stats →</a></p></section>`;
  },
  "/pricing": () => {
    const cur = ctx.session ? planId() : null, P = PLANS;
    if (qs().get("checkout") === "cancel") setTimeout(() => flash("Checkout canceled. Nothing was charged."));
    const li = (t, ok = true) => `<li>${ok ? CK : NO}<span>${t}</span></li>`;
    const btn = (id) => {
      if (cur === id) return `<span class="btn ghost plan-cur" aria-disabled="true">Your current plan</span>`;
      if (id === "free") return ctx.session ? `<span class="btn ghost plan-cur" aria-disabled="true">Included with every account</span>` : `<a class="btn ghost" href="#/signup">Create free account</a>`;
      if (ctx.profile?.state_blocked) return `<span class="btn ghost plan-cur" aria-disabled="true">Not available in your state</span>`;
      return `<button class="btn${id === "pro" ? " ai" : ""}" data-buy="${id}">${cur && cur !== "free" ? "Switch to" : "Choose"} ${esc(P[id].label)}</button>`;
    };
    const card = (id, tag, blurb, items) => `<article class="card plan${cur === id ? " cur" : ""}${id === "connect" ? " hot" : ""}"><div class="plan-h"><h2>${esc(P[id].label)}</h2>${tag ? `<span class="tag">${tag}</span>` : ""}</div>
      <div class="price">${usd(P[id].price_cents)}<small>/month</small></div><p class="mute plan-blurb">${blurb}</p><ul class="pfeat">${items.join("")}</ul><div class="plan-cta">${btn(id)}</div></article>`;
    return `<div class="plans-hd"><h1>Plans</h1><p class="mute">Use the app for free. Add your own AI when you want it to analyze markets and your connected accounts.</p></div>
      ${ctx.betaPlan && P[ctx.betaPlan] ? `<div class="flash">Beta: every account currently gets ${esc(P[ctx.betaPlan].label)} features at no charge.</div>` : ""}
      <div class="plans3">
      ${card("free", "", "The app itself: browse and keep track of markets.", [li("Markets browser with live prices and charts"), li("Live dashboard, alert results and logged bot stats"), li("Public smart-money alerts (information only)"), li("Your account and connected-accounts page"), li("No AI connection", false)])}
      ${card("connect", "1 AI connector", "Connect one AI provider using your own key.", [li("Everything in Free"), li("Connect <b>1 AI provider</b>: Grok, OpenAI, Claude, Gemini or any OpenAI-compatible API"), li("Your AI analyzes markets and your read-only connected accounts"), li(`“Ask your AI” on any market, plus research runs (fair use: ${P.connect.runs_per_hour}/hour)`), li("Your AI provider bills its usage to your own account")])}
      ${card("pro", "Multiple connectors + bots", "For members who use several AIs and want their own bots.", [li("Everything in Connect AI"), li(`Connect <b>up to ${P.pro.ai_connectors} AI providers</b> and pick one per run`), li(`More AI runs (fair use: ${P.pro.runs_per_hour}/hour)`), li(`Your own <b>research &amp; alert bots</b> (up to ${P.pro.bots}). They research and alert; they never place bets or trades`)])}
      </div>
      <p class="mute plan-note">Prices in USD, billed monthly through Stripe. Checkout runs in <b>Stripe test mode</b> while payments are being set up, so no real card is charged yet. Your AI provider bills its own usage separately.</p>
      ${HUB}
      <p class="mute plan-note">Closer AI gives no picks, tips or advice of its own and makes no promises about results. AI output is your own AI's educational analysis, not financial or betting advice.</p>`;
  },
  "/signup": async () => {
    let blocked = ["UT"]; const { data } = await sb.from("blocked_states").select("state"); if (data && data.length) blocked = data.map((r) => r.state);
    setTimeout(() => {
      const f = $("#su"), st = f.state, msg = $("#stmsg");
      const check = () => { const b = blocked.includes(st.value); msg.innerHTML = b ? `<div class="flash err">Sorry, Closer AI isn't available in your state (${esc(st.value)}).</div>` : ""; f.querySelector("button").disabled = b || !st.value; };
      st.onchange = check; check();
      f.onsubmit = async (e) => {
        e.preventDefault(); if (blocked.includes(st.value)) return;
        if (!f.adult.checked || !f.terms.checked) return flash("Please confirm you're 18+ and accept the terms.", true);
        const { data, error } = await sb.auth.signUp({ email: f.email.value.trim(), password: f.password.value, options: { data: { state: st.value, adult: true, terms: true }, emailRedirectTo: C.appUrl || location.origin + location.pathname } });
        if (error) return flash(error.message, true);
        if (!data.session) go("#/login", "Check your email to confirm your account, then log in."); else location.hash = "#/account";
      };
    });
    return `<div style="max-width:420px;margin:24px auto"><h1>Create your account</h1>${HUB}<form class="f" id="su">
      <input name="email" type="email" placeholder="Email" required autocomplete="email"><input name="password" type="password" placeholder="Password (8+ characters)" minlength="8" required autocomplete="new-password">
      <select name="state" required><option value="">State you live in…</option>${STATES.map((s) => `<option>${s}</option>`).join("")}</select><div id="stmsg"></div>
      <label class="ck"><input type="checkbox" name="adult"> I am 18 or older.</label>
      <label class="ck"><input type="checkbox" name="terms"> I accept the terms. I understand Closer AI is a read-only connection hub: my own AI analyzes my own data, Closer AI gives no picks or advice, holds no funds, and never places bets or trades for me.</label>
      <button class="btn">Sign up</button><p class="mute" style="font-size:13px">Have an account? <a href="#/login"><b>Log in</b></a></p></form></div>`;
  },
  "/login": () => {
    setTimeout(() => { $("#li").onsubmit = async (e) => { e.preventDefault(); const f = e.target;
      const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
      if (error) return flash(error.message, true); flash(""); location.hash = "#/markets"; }; });
    return `<div style="max-width:420px;margin:24px auto"><h1>Log in</h1><form class="f" id="li"><input name="email" type="email" placeholder="Email" required autocomplete="email">
      <input name="password" type="password" placeholder="Password" required autocomplete="current-password"><button class="btn">Log in</button>
      <p class="mute" style="font-size:13px">New here? <a href="#/signup"><b>Sign up</b></a></p></form></div>`;
  },
  "/research": async () => {
    if (!ctx.session) return gate("research with your own AI");
    if (ctx.profile?.state_blocked) return `<h1 style="margin-top:18px">Research</h1>${blockedBox()}`;
    const hasKey = !!ctx.key && ctx.key.status !== "invalid", ok = hasAI() && hasKey, hasBrk = ctx.brk.length > 0, multi = isPro() && ctx.keys.length > 1;
    const { data: runs } = await sb.from("research_runs").select("id,kind,input,model,status,created_at").order("created_at", { ascending: false }).limit(20);
    setTimeout(() => document.querySelectorAll("form[data-kind]").forEach((f) => f.onsubmit = async (e) => {
      e.preventDefault(); const btn = f.querySelector("button"); btn.disabled = true; btn.textContent = "Your AI is working…";
      const { data, error } = await sb.functions.invoke("research-run", { body: { kind: f.dataset.kind, query: f.q.value, include_holdings: !!f.h?.checked, ...(f.prov?.value ? { provider: f.prov.value } : {}) } });
      if (error) { flash(await fnError(error), true); return render(); }
      flash(`Run #${data.run_id} done · billed to ${data.result.billed_to}.`); sessionStorage.setItem("lastRun", JSON.stringify(data)); render();
    }));
    const last = JSON.parse(sessionStorage.getItem("lastRun") || "null");
    const notice = !hasAI() ? `<div class="flash err">Research with your own AI is part of Connect AI and Pro. Your Free plan covers markets, dashboards and stats. <a class="btn sm" href="#/pricing">See plans</a></div>`
      : !ctx.key ? `<div class="flash err">Connect your own AI provider key to run research. <a class="btn sm" href="#/account">Connect your AI</a></div>`
      : ctx.key.status === "invalid" ? `<div class="flash err">Your saved ${esc(provName(ctx.key.provider))} key was rejected. <a class="btn sm" href="#/account">Replace key</a></div>` : "";
    return `<h1 style="margin-top:18px">Research with your AI</h1><p class="mute" style="margin-top:-8px">${ctx.key ? `Using <b>${esc(provName(ctx.key.provider))}</b> · ${esc(ctx.key.model || "")} (key …${esc(ctx.key.last4)}). Your provider bills your account. <a href="#/account">Change</a>` : "Runs use your own AI provider key."} Closer AI only connects the data; the analysis is your AI's.</p>${notice}
      <div class="g2">${Object.entries(RUNS).map(([k, [n]]) => `<form class="card pad f" data-kind="${k}" style="max-width:none"><h2>${n}</h2>
        <input name="q" placeholder="Topic (optional), e.g. NFL" maxlength="200">${multi ? `<select name="prov" aria-label="AI connector">${ctx.keys.filter((x) => x.status !== "invalid").map((x) => `<option value="${esc(x.provider)}" ${x.is_default ? "selected" : ""}>${esc(provName(x.provider))} · ${esc(x.model || "")}</option>`).join("")}</select>` : ""}${hasBrk ? `<label class="ck"><input type="checkbox" name="h"> Include my brokerage holdings</label>` : ""}<button class="btn ai" ${ok ? "" : "disabled"}>${AIICON}Run</button></form>`).join("")}</div>
      ${last ? `<div class="card pad" style="margin:12px 0"><h2>Latest result <span class="mute" style="font-weight:500;font-size:13px">(${esc(last.result.provider_name || "")} · ${esc(last.result.model)} · billed to ${esc(last.result.billed_to || "your provider")})</span></h2><div class="ans">${esc(last.result.summary)}</div>
        <details style="margin-top:8px"><summary class="mute">Data your AI used</summary><pre>${esc(JSON.stringify(last.result.markets, null, 1))}</pre></details><p class="mute" style="font-size:12px;margin-top:6px">${esc(last.result.disclaimer)}</p></div>` : ""}
      <section class="card tblwrap"><div class="card-h"><h2>Your runs</h2></div><table><thead><tr><th>#</th><th>Type</th><th>Topic</th><th>Model</th><th>Status</th><th>When</th></tr></thead><tbody>
      ${(runs || []).map((r) => `<tr><td>${r.id}</td><td>${esc(RUNS[r.kind]?.[0] || (r.kind === "bot" ? "Bot run" : r.kind))}</td><td>${esc(r.input)}</td><td>${esc(r.model || "–")}</td><td>${esc(r.status)}</td><td>${new Date(r.created_at).toLocaleString()}</td></tr>`).join("") || `<tr><td colspan=6 class=mute>No runs yet.</td></tr>`}</tbody></table></section>`;
  },
  "/account": async () => {
    if (!ctx.session) return gate("your account");
    const q = qs(); if (q.get("checkout") === "success") setTimeout(() => flash("Checkout complete (test mode). Your plan switches on once Stripe confirms."));
    const p = ctx.profile || {}, k = ctx.key, lim = ctx.plan?.ai_connectors ?? 0, have = ctx.keys.map((x) => x.provider);
    let brkCfg = null, hold = [];
    if (!p.state_blocked) {
      const [st, h] = await Promise.all([sb.functions.invoke("brokerage", { body: { action: "status" } }).catch(() => ({})),
        ctx.brk.length ? sb.from("brokerage_holdings").select("account_id,symbol,description,units,price,market_value,currency").order("market_value", { ascending: false }).limit(50) : { data: [] }]);
      brkCfg = st?.data || null; hold = h.data || [];
    }
    setTimeout(() => accountWire(q));
    const keyForm = (hidden) => `<form class="f" id="keyform" style="margin-top:10px;${hidden ? "display:none" : ""}" autocomplete="off">
        <label class="mute" style="font-size:12px">AI provider</label><select name="provider">${Object.entries(AI).map(([id, c]) => `<option value="${id}" ${have.includes(id) ? "data-have" : ""}>${c.name}</option>`).join("")}</select>
        <div id="basewrap" style="display:none;gap:6px"><input name="base_url" type="url" placeholder="https://api.example.com/v1" spellcheck="false"><span class="mute" style="font-size:11px">https only; private/local addresses are blocked.</span></div>
        <input name="key" type="password" autocomplete="off" spellcheck="false" required><label class="mute" style="font-size:12px">Model</label>
        <select name="model"></select><input id="modelother" placeholder="model ID" style="display:none" spellcheck="false">
        <button class="btn" type="submit">Save key</button><p class="mute" style="font-size:12px" id="keyhelp"></p></form>`;
    const ST = { valid: '<span class="tag ok">verified</span>', invalid: '<span class="tag" style="color:var(--red)">rejected</span>', untested: '<span class="tag">not tested</span>', unverified: '<span class="tag">saved, not confirmed</span>' };
    const modelForm = (x) => { const models = AI[x.provider]?.models || [], inList = models.includes(x.model);
      return `<details class="mdl"><summary class="mute">Change model</summary><form class="f mform" data-prov="${esc(x.provider)}" style="grid-template-columns:minmax(0,1fr) auto;max-width:460px;margin-top:6px">
        ${models.length ? `<select name="m">${models.map((m) => `<option ${m === x.model ? "selected" : ""}>${m}</option>`).join("")}<option value="__other" ${inList ? "" : "selected"}>Other model ID…</option></select>` : `<input type="hidden" name="m" value="__other">`}
        <button class="btn ghost sm">Save model</button><input name="o" value="${inList ? "" : esc(x.model || "")}" placeholder="model ID" spellcheck="false" style="grid-column:1/-1;${inList && models.length ? "display:none" : ""}"></form></details>`; };
    const keyRow = (x) => `<div class="aik"><div class="aik-i"><b>${esc(provName(x.provider))}</b>${isPro() && ctx.keys.length > 1 && x.is_default ? '<span class="tag ok">default</span>' : ""}${ST[x.status] || ""}
        <p class="mute" style="font-size:12.5px">model <code>${esc(x.model || "")}</code> · key <code>••••${esc(x.last4)}</code>${x.base_url ? ` · ${esc(x.base_url)}` : ""}${x.tested_at ? ` · checked ${new Date(x.tested_at).toLocaleDateString()}` : ""}</p>${modelForm(x)}</div>
        <div class="aik-act" data-prov="${esc(x.provider)}"><button class="btn ghost sm" data-k="test">Test</button>${isPro() && !x.is_default ? '<button class="btn ghost sm" data-k="default">Make default</button>' : ""}<button class="btn ghost sm" data-k="replace">Replace key</button><button class="btn ghost sm" data-k="delete">Remove</button></div></div>`;
    const aiCard = !hasAI()
      ? `<div class="conn" id="aicard" style="grid-column:1/-1"><div class="ic" style="background:var(--green);color:var(--greenink)">${AIICON}</div><div style="flex:1;min-width:0"><h3>Your AI provider <span class="tag">Connect AI or Pro</span></h3>
        <p class="mute" style="font-size:13px">Your Free plan doesn't include an AI connection. With <b>Connect AI</b> you connect one AI provider (your own key) to analyze markets and your connected accounts; <b>Pro</b> lets you connect several and run your own research and alert bots.</p>
        <p style="margin-top:10px"><a class="btn" href="#/pricing">See plans</a></p></div></div>`
      : `<div class="conn" id="aicard" style="grid-column:1/-1"><div class="ic" style="background:var(--green);color:var(--greenink)">${AIICON}</div><div style="flex:1;min-width:0"><h3>Your AI connectors <span class="tag${ctx.keys.length ? " ok" : ""}">${ctx.keys.length} of ${lim} used</span></h3>
        ${ctx.keys.length ? ctx.keys.map(keyRow).join("") : `<p class="mute" style="font-size:13px">Pick any provider and use your own API key; runs bill to your account with that provider.</p>`}
        ${ctx.keys.length > lim ? `<div class="flash err" style="margin-top:10px">Your plan includes ${lim} AI connector${lim === 1 ? "" : "s"}. Only your default connector is used until you remove extras or upgrade.</div>` : ""}
        ${ctx.keys.length < lim ? (ctx.keys.length ? `<p style="margin-top:10px"><button class="btn sm" id="keyadd">Add another AI</button></p>` : "")
          : planId() === "connect" ? `<p class="mute" style="font-size:12.5px;margin-top:10px">Connect AI includes 1 AI connector. To use a different provider, remove this one first, or <a href="#/pricing"><b>upgrade to Pro</b></a> to connect several at once.</p>`
          : `<p class="mute" style="font-size:12.5px;margin-top:10px">You've connected the Pro maximum of ${lim} AI providers.</p>`}
        ${keyForm(ctx.keys.length > 0)}</div></div>`;
    const botsCard = `<section class="card pad" id="bots" style="margin-top:14px"><h2>Your bots <span class="tag">Pro</span></h2>
      <p class="mute" style="font-size:13px;margin-top:6px">Bots use your own AI connector to research a topic or flag notable market changes for you. They research and alert only: they never place bets or trades, and Closer AI adds no advice of its own.</p>
      ${!isPro() ? `<p style="margin-top:10px"><a class="btn" href="#/pricing">Upgrade to Pro</a></p>`
        : `${ctx.bots.map((b) => `<div class="aik"><div class="aik-i"><b>${esc(b.name)}</b><span class="tag">${b.kind === "alert" ? "alert bot" : "research bot"}</span>${b.active ? "" : '<span class="tag">paused</span>'}
            <p class="mute" style="font-size:12.5px">${esc(b.topic || "Top markets by 24h volume")} · ${b.provider ? esc(provName(b.provider)) : "default AI"}${b.last_run_at ? ` · last run ${new Date(b.last_run_at).toLocaleString()}` : ""}</p>
            ${b.last_result?.text ? `<details class="mdl"><summary class="mute">Latest output</summary><div class="ans">${esc(b.last_result.text)}</div></details>` : ""}</div>
            <div class="aik-act" data-bot="${b.id}"><button class="btn ai sm" data-b="run" ${b.active && ctx.keys.length ? "" : "disabled"}>${AIICON}Run now</button><button class="btn ghost sm" data-b="toggle">${b.active ? "Pause" : "Resume"}</button><button class="btn ghost sm" data-b="del">Delete</button></div></div>`).join("")}
          ${ctx.bots.length < (ctx.plan?.bots ?? 0) ? `<form class="f" id="botform" style="max-width:none;grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));margin-top:12px">
            <input name="name" placeholder="Bot name, e.g. NFL watcher" maxlength="60" required><select name="kind"><option value="research">Research bot</option><option value="alert">Alert bot</option></select>
            <input name="topic" placeholder="Topic, e.g. NFL or Fed rates" maxlength="200"><select name="provider"><option value="">Default AI</option>${ctx.keys.map((x) => `<option value="${esc(x.provider)}">${esc(provName(x.provider))}</option>`).join("")}</select>
            <button class="btn">Create bot</button></form>` : `<p class="mute" style="font-size:12.5px;margin-top:10px">You've reached the Pro limit of ${ctx.plan?.bots ?? 0} bots.</p>`}
          <p class="mute" style="font-size:11.5px;margin-top:8px">Bots run when you press “Run now” (scheduled runs are coming soon). Each run uses your own AI provider and counts toward your hourly fair-use limit.${ctx.keys.length ? "" : " Connect an AI above first."}</p>`}</section>`;
    const byAcct = (id) => hold.filter((h) => h.account_id === id);
    const brkCard = `<div class="conn" style="grid-column:1/-1"><div class="ic" style="background:var(--ai);color:var(--aiink)">$</div><div style="flex:1;min-width:0">
        <h3>Brokerage <span class="tag">read-only</span>${ctx.brk.length ? '<span class="tag ok">connected</span>' : brkCfg?.configured ? "" : '<span class="tag">coming soon</span>'}</h3>
        <p class="mute" style="font-size:13px">Connect Robinhood, Schwab, Fidelity, E*TRADE, Webull, Vanguard and more through SnapTrade with <b>read-only</b> permission. Your own AI can then see your holdings for context. No order placement, no transfers: your money never leaves your brokerage.</p>
        ${ctx.brk.length ? ctx.brk.map((a) => `<div class="card" style="margin-top:10px;padding:10px 12px"><b>${esc(a.institution)}</b> · ${esc(a.name || "Account")} ${a.number_mask ? `…${esc(a.number_mask)}` : ""} <span class="mute" style="font-size:12px">${a.synced_at ? "synced " + new Date(a.synced_at).toLocaleString() : ""}</span>
            <div class="tblwrap"><table style="margin-top:6px"><thead><tr><th>Symbol</th><th class="num">Units</th><th class="num">Price</th><th class="num">Value</th></tr></thead><tbody>${byAcct(a.id).map((h) => `<tr><td><b>${esc(h.symbol)}</b> <span class="mute">${esc((h.description || "").slice(0, 40))}</span></td><td class="num">${Number(h.units || 0).toLocaleString()}</td><td class="num">${h.price != null ? Number(h.price).toLocaleString(undefined, { style: "currency", currency: h.currency || "USD" }) : "–"}</td><td class="num">${h.market_value != null ? Number(h.market_value).toLocaleString(undefined, { style: "currency", currency: h.currency || "USD" }) : "–"}</td></tr>`).join("") || `<tr><td colspan=4 class=mute>No positions.</td></tr>`}</tbody></table></div></div>`).join("")
          + `<p style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class="btn ghost sm" id="brksync">Refresh holdings</button><button class="btn ghost sm" id="brkadd">Connect another</button><button class="btn ghost sm" id="brkdel">Disconnect all</button></p>`
          : !hasAI() ? `<p class="mute" style="font-size:12.5px;margin-top:10px">Linking a brokerage for your AI to analyze is part of Connect AI and Pro. <a href="#/pricing"><b>See plans</b></a></p>`
          : `<p style="margin-top:10px"><button class="btn" id="brkadd" ${brkCfg?.configured ? "" : "disabled"}>Connect brokerage</button> ${brkCfg?.configured ? "" : `<span class="mute" style="font-size:12px">Coming soon, activates once enabled.</span>`}</p>`}
        <p class="mute" style="font-size:11.5px;margin-top:8px">Holdings are shown only to you (row-level security) and sent only to your own AI when you tick "include holdings". AI output is educational, not personalized financial advice.</p></div></div>`;
    return `<h1 style="margin-top:18px">Account</h1>${blockedBox()}
      <div class="g2"><div class="card pad"><h2>Profile</h2><p class="mute" style="margin-top:6px">${esc(ctx.session.user.email)}<br>State: ${esc(p.state || "–")} · 18+: ${p.adult_confirmed ? "yes" : "no"}</p></div>
      <div class="card pad"><h2>Plan</h2><p style="margin-top:6px"><b>${esc(limits().label)}</b> <span class="mute">${usd(limits().price_cents)}/month</span></p>
        <p class="mute" style="font-size:13px;margin-top:4px">${p.plan_override ? "Set on your account by Closer AI." : paid() ? `Renews ${new Date(ctx.sub.current_period_end).toLocaleDateString()} (Stripe test mode).` : ctx.betaPlan && planId() === ctx.betaPlan ? "Beta access, no charge." : planId() === "free" ? "Markets, dashboards and stats. No AI connection." : ""}
        ${hasAI() ? `<br>AI connectors: ${ctx.keys.length} of ${lim}${isPro() ? ` · Bots: ${ctx.bots.length} of ${ctx.plan?.bots ?? 0}` : ""}` : ""}</p>
        ${p.state_blocked ? "" : `<p style="margin-top:10px"><a class="btn${isPro() ? " ghost" : ""} sm" href="#/pricing">${planId() === "free" ? "Upgrade" : planId() === "connect" ? "Upgrade to Pro" : "View plans"}</a></p>`}</div></div>
      ${p.state_blocked ? "" : `<section class="card pad" id="connected"><h2>Connected accounts</h2>
        <p style="margin:8px 0 12px;font-size:13.5px">Closer AI is only a connection hub. <b>Your own AI</b> (your key) analyzes <b>your own connected accounts</b>. Closer AI gives no suggestions of its own and no shared picks. Your money never leaves your brokerage or market account: Closer AI holds <b>no funds</b> and has <b>read-only</b> access. Nothing here can place bets, trades, or transfers.</p>
        <div class="g2" style="margin:0;grid-template-columns:minmax(0,1fr)">
        ${aiCard}
        ${brkCard}
        <div class="g2" style="grid-column:1/-1;margin:0;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))"><div class="conn"><div class="ic" style="background:#2563eb">P</div><div><h3>Polymarket <span class="tag">view-only · coming soon</span></h3><p class="mute" style="font-size:13px">See your own positions read-only so your AI can analyze them. Public market data already works without connecting.</p></div></div>
        <div class="conn"><div class="ic" style="background:#6b7280">K</div><div><h3>Kalshi <span class="tag">view-only · coming soon</span></h3><p class="mute" style="font-size:13px">Read-only view of your own positions. No trading, no transfers.</p></div></div></div>
        </div></section>${botsCard}`}`;
  },
};
function accountWire(q) {
  const keyCall = async (body, okMsg) => { const { data, error } = await sb.functions.invoke("ai-key", { body }); if (error) { flash(await fnError(error), true); return render(); } flash(typeof okMsg === "function" ? okMsg(data) : okMsg); render(); };
  const form = $("#keyform");
  if (form) {
    const sync = () => { const pv = form.provider.value, cat = AI[pv]; form.key.placeholder = cat.hint;
      form.model.innerHTML = cat.models.map((m, i) => `<option value="${m}">${m}${i === 0 ? " (lower cost)" : ""}</option>`).join("") + `<option value="__other">Other model ID…</option>`;
      $("#basewrap").style.display = pv === "custom" ? "grid" : "none"; form.base_url.required = pv === "custom";
      if (pv === "custom") form.model.value = "__other";
      $("#modelother").style.display = pv === "custom" || form.model.value === "__other" ? "block" : "none"; form.model.style.display = pv === "custom" ? "none" : "block";
      $("#keyhelp").textContent = `Get a key at ${cat.console}. It's encrypted at rest and never shown again; only the last 4 characters are displayed. Your provider bills your runs to your own account.`; };
    const open = (lock) => { // lock = replace that provider's key; otherwise add a new provider
      [...form.provider.options].forEach((o) => { o.hidden = lock ? o.value !== lock : o.hasAttribute("data-have"); o.disabled = o.hidden; });
      form.provider.value = lock || ([...form.provider.options].find((o) => !o.hidden)?.value ?? "xai");
      form.querySelector("button[type=submit]").textContent = lock ? `Save new ${provName(lock)} key` : "Save key";
      form.style.display = "grid"; sync(); form.key.focus(); };
    form.provider.onchange = sync; form.model.onchange = () => { $("#modelother").style.display = form.model.value === "__other" ? "block" : "none"; };
    if (form.style.display !== "none") open(null); else sync();
    const ka = $("#keyadd"); if (ka) ka.onclick = () => { ka.style.display = "none"; open(null); };
    document.querySelectorAll(".aik-act[data-prov] button").forEach((b) => b.onclick = () => {
      const pv = b.parentElement.dataset.prov, k = b.dataset.k;
      if (k === "replace") return open(pv);
      if (k === "test") { b.disabled = true; b.textContent = "Testing…"; return keyCall({ action: "test", provider: pv }, (d) => d.status === "valid" ? `${provName(pv)} accepted the key.` : "Couldn't confirm the key right now."); }
      if (k === "default") return keyCall({ action: "default", provider: pv }, `${provName(pv)} is now your default AI.`);
      if (k === "delete" && confirm(`Remove your ${provName(pv)} key from Closer AI?`)) keyCall({ action: "delete", provider: pv }, `${provName(pv)} key removed.`);
    });
    form.onsubmit = async (e) => { e.preventDefault(); const v = form.key.value.trim(); form.key.value = "";
      const model = form.model.value === "__other" || form.provider.value === "custom" ? $("#modelother").value.trim() : form.model.value;
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Checking with provider…";
      await keyCall({ action: "save", provider: form.provider.value, key: v, model, base_url: form.base_url.value.trim() }, (d) => `${provName(d.provider)} key saved (…${d.last4})${d.status === "valid" ? " and verified." : ". Saved, but the provider couldn't confirm it yet."}`); };
  }
  document.querySelectorAll("form.mform").forEach((f) => {
    if (f.m.tagName === "SELECT") f.m.onchange = () => { f.o.style.display = f.m.value === "__other" ? "block" : "none"; };
    f.onsubmit = (e) => { e.preventDefault(); const v = f.m.value === "__other" ? f.o.value.trim() : f.m.value; keyCall({ action: "model", provider: f.dataset.prov, model: v }, `Model set to ${v}.`); };
  });
  const bf = $("#botform");
  if (bf) bf.onsubmit = async (e) => { e.preventDefault(); bf.querySelector("button").disabled = true;
    const { error } = await sb.from("member_bots").insert({ name: bf.name.value.trim(), kind: bf.kind.value, topic: bf.topic.value.trim(), provider: bf.provider.value || null, cadence: "manual" });
    if (error) { flash(dbError(error), true); return render(); } flash("Bot created. Press “Run now” to run it with your AI."); render(); };
  document.querySelectorAll(".aik-act[data-bot] button").forEach((b) => b.onclick = async () => {
    const id = Number(b.parentElement.dataset.bot), bot = ctx.bots.find((x) => x.id === id), k = b.dataset.b; if (!bot) return;
    if (k === "run") { b.disabled = true; b.textContent = "Your AI is working…";
      const { error } = await sb.functions.invoke("research-run", { body: { bot_id: id } });
      if (error) { flash(await fnError(error), true); return render(); } flash(`“${bot.name}” finished. Output saved below.`); return render(); }
    if (k === "toggle") { const { error } = await sb.from("member_bots").update({ active: !bot.active }).eq("id", id); if (error) flash(dbError(error), true); return render(); }
    if (k === "del" && confirm(`Delete the bot “${bot.name}”?`)) { const { error } = await sb.from("member_bots").delete().eq("id", id); if (error) flash(dbError(error), true); else flash("Bot deleted."); render(); }
  });
  const brk = async (action, okMsg) => { const { data, error } = await sb.functions.invoke("brokerage", { body: { action } }); if (error) { flash(await fnError(error), true); return null; } if (okMsg) { flash(okMsg); render(); } return data; };
  const add = $("#brkadd"); if (add) add.onclick = async () => { add.disabled = true; const dt = await brk("connect"); add.disabled = false; if (dt?.url) location.href = dt.url; };
  const sy = $("#brksync"); if (sy) sy.onclick = () => { sy.disabled = true; sy.textContent = "Refreshing…"; brk("sync", "Holdings refreshed (read-only)."); };
  const dl = $("#brkdel"); if (dl) dl.onclick = () => { if (confirm("Disconnect all brokerage accounts and delete stored holdings?")) brk("disconnect", "Brokerage disconnected and holdings deleted."); };
  if (q.get("brokerage") === "connected" && !accountWire.synced) { accountWire.synced = true; brk("sync", "Brokerage connected (read-only). Holdings loaded."); }
}

let seq = 0;
async function render() {
  const my = ++seq; await loadCtx(); if (my !== seq) return; nav();
  const r = route(); let html;
  if (r.startsWith("/market/")) html = await marketView(decodeURIComponent(r.slice(8)));
  else if (r === "/members" || r === "/") { location.replace("#/markets"); return; }
  else html = await (views[r] || views["/markets"])();
  if (my !== seq) return; $("#view").innerHTML = html; window.scrollTo(0, 0);
}
window.addEventListener("hashchange", () => { if (!keep) flash(""); keep = false; closeModal(); render(); });
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" || ev === "SIGNED_OUT") render(); });
render(); buildCats();
