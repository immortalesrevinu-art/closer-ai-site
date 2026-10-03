// Closer AI test frontend wired to Supabase Auth + RLS-protected tables + Edge Functions.
const C = window.CLOSER_CONFIG;
const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
const SHOW_CREDITS = false; // BYOK model: runs don't use Closer AI credits; credit/top-up UI kept in code but hidden
const RUNS = { scan: ["Market scan", 1], digest: ["Digest", 3], deep: ["Deep research", 10] };
// Bring-your-own AI provider catalog (mirrors supabase/functions/_shared/providers.ts). First model = lower-cost default.
const AI = {
  xai:       { name: "xAI (Grok)", hint: "xai-…", console: "console.x.ai", models: ["grok-4.3", "grok-4.6", "grok-4.7"] },
  openai:    { name: "OpenAI", hint: "sk-…", console: "platform.openai.com", models: ["gpt-6-luna", "gpt-6.1-sol", "gpt-6-astra"] },
  anthropic: { name: "Anthropic (Claude)", hint: "sk-ant-…", console: "console.anthropic.com", models: ["claude-haiku-4-5", "claude-sonnet-5-5", "claude-opus-5-5"] },
  gemini:    { name: "Google Gemini", hint: "AIza…", console: "aistudio.google.com", models: ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.1-pro-preview"] },
  custom:    { name: "Other (OpenAI-compatible)", hint: "API key", console: "your provider", models: [] },
};
const provName = (p) => AI[p]?.name || p;
const PACKS = [["pack_100", 100, 10], ["pack_500", 500, 40], ["pack_1500", 1500, 100]];
const ERR = {
  stripe_sandbox_not_configured: "Payments aren't switched on yet. Closer AI is free during the beta.",
  live_stripe_key_refused: "Payments are disabled: this backend only runs in Stripe test mode.",
  not_available_in_state: "Closer AI isn't available in your state.",
  active_plan_required: "You need an active Member plan first.",
  insufficient_credits: "Not enough credits for this run.",
  adult_and_terms_required: "Please confirm you're 18+ and accept the terms.",
  adult_confirmation_required: "Please confirm you're 18+.",
  already_subscribed: "You already have an active plan.",
  not_available: "Top-up packs aren't offered. Closer AI is subscription-only.",
  sign_in_required: "Please log in again.",
  run_failed_refunded: "The run failed; your credits were refunded.",
  ai_key_required: "Connect your AI provider key on the Account page to run research.",
  ai_key_rejected: "Your AI provider rejected this API key. Check it in their console and save it again.",
  invalid_key_format: "That doesn't look like a valid API key for the selected provider.",
  invalid_model: "Enter a valid model ID.",
  unknown_provider: "Pick an AI provider.",
  provider_unreachable: "Couldn't reach your AI provider right now. Try again in a minute.",
  provider_redirect_refused: "Your endpoint tried to redirect; redirects aren't allowed. Use the final API URL.",
  ai_no_credits: "Your AI provider account is out of credits/quota or hit its spending limit. Top it up with them.",
  ai_rate_limited: "Your AI provider is rate-limiting your key. Wait a moment and try again.",
  ai_model_unavailable: "That model isn't available on your key. Pick another model on the Account page.",
  ai_request_failed: "The AI request failed. Try again.",
  invalid_base_url: "Enter a valid base URL, e.g. https://api.example.com/v1",
  base_url_must_be_https: "The base URL must start with https://",
  base_url_port_not_allowed: "Custom ports aren't allowed; use the standard https port.",
  base_url_private_address: "That address is private or local and can't be used.",
  base_url_ip_literal_not_allowed: "Use a hostname, not an IP address.",
  base_url_unresolvable: "That hostname doesn't resolve.",
  rate_limited: "Too many runs this hour. Try again later.",
  market_data_unavailable: "Public market data is unavailable right now.",
};
let ctx = { session: null, beta: false, profile: null, sub: null, key: null, bal: { plan_credits: 0, pack_credits: 0 } };

let keep = false;
function go(hash, msg, err = false) { keep = true; location.hash = hash; flash(msg, err); }
function flash(msg, err = false) { $("#flash").innerHTML = msg ? `<div class="flash${err ? " err" : ""}">${esc(msg)}</div>` : ""; }
const paid = () => ctx.sub && ctx.sub.status === "active" && new Date(ctx.sub.current_period_end) > new Date();
const active = () => ctx.beta || paid(); // free beta: full access without a paid plan
async function fnError(error) {
  try { const j = await error.context.json(); return ERR[j.error] || j.error || error.message; } catch { return error.message; }
}

async function loadCtx() {
  const { data: { session } } = await sb.auth.getSession();
  const { data: st } = await sb.from("app_settings").select("value").eq("key", "free_beta").maybeSingle();
  ctx.beta = st?.value === true;
  ctx.session = session; ctx.profile = ctx.sub = ctx.key = null; ctx.bal = { plan_credits: 0, pack_credits: 0 };
  if (!session) return;
  const [p, s, b, k] = await Promise.all([
    sb.from("profiles").select("*").maybeSingle(),
    sb.from("subscriptions").select("*").maybeSingle(),
    sb.rpc("my_credit_balance"),
    sb.from("user_ai_keys").select("provider,model,base_url,last4,status,tested_at,updated_at").maybeSingle(), // key itself is never readable
  ]);
  ctx.profile = p.data; ctx.sub = s.data; ctx.key = k.data; ctx.bal = (b.data && b.data[0]) || ctx.bal;
}

function nav() {
  $("#nav").innerHTML = ctx.session
    ? `<a href="../">Stats</a><a href="#/members">Members</a><a href="#/research">Research</a><a href="#/account">Account</a><a href="#/pricing">Pricing</a><button class="btn ghost sm" id="logout" style="margin-left:auto">Log out</button>`
    : `<a href="../">Stats</a><a href="#/pricing">Pricing</a><a href="#/login">Log in</a><a class="btn sm" href="#/signup">Sign up</a>`;
  const lo = $("#logout"); if (lo) lo.onclick = async () => { await sb.auth.signOut(); location.hash = "#/"; };
  const cur = location.hash.split("?")[0]; document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === cur));
}

const blockedBox = () => ctx.profile && ctx.profile.state_blocked
  ? `<div class="flash err">Closer AI isn't available in your state${ctx.profile.state ? ` (${esc(ctx.profile.state)})` : ""}. Paid features are disabled for this account.</div>` : "";

const views = {
  "/": () => `<h1>Closer AI</h1><p class="mute">AI research and smart-money alerts for prediction markets, built on public data. Research only.</p>
    <p style="margin-top:14px"><a class="btn" href="#/${ctx.session ? "members" : "signup"}">${ctx.session ? "Go to members" : "Create an account"}</a></p>`,

  "/pricing": () => `<h1>Pricing</h1>${ctx.beta ? `<div class="flash">Free beta: everything is free right now. No card needed.</div>` : ""}<div class="grid"><div class="card pad" style="border-color:var(--green)"><h2>Member</h2>
    <div class="big">$19<span class="mute" style="font-size:14px">/month</span></div><p class="mute">Platform access: smart-money alerts, aggregated bot results, and unlimited* AI research runs with <b>the AI you choose</b> (Grok, OpenAI, Claude, Gemini or any OpenAI-compatible API) using your own API key. AI usage is billed by that provider to your account, not by Closer AI.</p>
    ${ctx.beta ? `<p style="margin-top:10px"><span class="btn" style="cursor:default">Free during beta</span></p><p class="mute" style="font-size:12px;margin-top:6px">No payment needed while we're in beta. Paid plans start later; you'll be told before anything is charged.</p>` : `<p style="margin-top:10px"><button class="btn" data-buy="member" ${ctx.session ? "" : "disabled"}>Subscribe</button></p>`}</div>
    ${SHOW_CREDITS ? PACKS.map(([id, cr, usd]) => `<div class="card pad"><h2>${cr} credits</h2><div class="big">$${usd}</div><p class="mute">${(usd / cr * 100).toFixed(1)}¢ per credit · valid 12 months · needs an active plan</p>
    <p style="margin-top:10px"><button class="btn ghost" data-buy="${id}" ${ctx.session ? "" : "disabled"}>Buy (test)</button></p></div>`).join("") : ""}
    <div class="card pad"><h2>Your AI, your key</h2><p class="mute">Pick a provider and paste its API key on your Account page. We store it encrypted and only ever show the last 4 characters. A typical run on a lower-cost model is a few cents, paid to your provider.</p></div></div>
    <p class="mute" style="font-size:12px">*Fair-use limit of 60 runs per hour.</p>
    ${ctx.session ? "" : `<p class="mute" style="margin-top:10px"><a href="#/signup">Sign up</a> to subscribe.</p>`}`,

  "/signup": async () => {
    let blocked = ["UT"];
    const { data } = await sb.from("blocked_states").select("state"); if (data && data.length) blocked = data.map((r) => r.state);
    setTimeout(() => {
      const f = $("#su"), st = f.state, msg = $("#stmsg");
      const check = () => { const b = blocked.includes(st.value); msg.innerHTML = b ? `<div class="flash err">Sorry, Closer AI isn't available in your state.</div>` : ""; f.querySelector("button").disabled = b || !st.value; };
      st.onchange = check; check();
      f.onsubmit = async (e) => {
        e.preventDefault(); if (blocked.includes(st.value)) return;
        if (!f.adult.checked || !f.terms.checked) return flash("Please confirm you're 18+ and accept the terms.", true);
        const { data, error } = await sb.auth.signUp({ email: f.email.value.trim(), password: f.password.value,
          options: { data: { state: st.value, adult: true, terms: true }, emailRedirectTo: location.origin + location.pathname } });
        if (error) return flash(error.message, true);
        if (!data.session) go("#/login", "Check your email to confirm your account, then log in.");
        else location.hash = "#/members";
      };
    });
    return `<h1>Create your account</h1><form class="f" id="su" style="margin-top:12px">
      <input name="email" type="email" placeholder="Email" required autocomplete="email">
      <input name="password" type="password" placeholder="Password (8+ characters)" minlength="8" required autocomplete="new-password">
      <select name="state" required><option value="">State you live in…</option>${STATES.map((s) => `<option>${s}</option>`).join("")}</select><div id="stmsg"></div>
      <label class="ck"><input type="checkbox" name="adult"> I am 18 or older.</label>
      <label class="ck"><input type="checkbox" name="terms"> I accept the terms. I understand Closer AI is research only, not betting or financial advice, and never places bets or trades for me.</label>
      <button class="btn">Sign up</button><p class="mute" style="font-size:13px">Have an account? <a href="#/login">Log in</a></p></form>`;
  },

  "/login": () => {
    setTimeout(() => {
      $("#li").onsubmit = async (e) => {
        e.preventDefault(); const f = e.target;
        const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
        if (error) return flash(error.message, true);
        flash(""); location.hash = "#/members";
      };
    });
    return `<h1>Log in</h1><form class="f" id="li" style="margin-top:12px"><input name="email" type="email" placeholder="Email" required autocomplete="email">
      <input name="password" type="password" placeholder="Password" required autocomplete="current-password"><button class="btn">Log in</button>
      <p class="mute" style="font-size:13px">New here? <a href="#/signup">Sign up</a></p></form>`;
  },

  "/members": async () => {
    if (!ctx.session) return gate();
    if (ctx.profile?.state_blocked) return `<h1>Members</h1>${blockedBox()}`;
    if (!active()) return `<h1>Members</h1><p>Members content needs an active plan. <a class="btn" href="#/pricing">See plans</a></p>`;
    const [bots, alerts] = await Promise.all([fetch(C.publicData + "bots.json").then((r) => r.json()).catch(() => ({})), fetch(C.publicData + "alerts.json").then((r) => r.json()).catch(() => ({}))]);
    const t = bots.totals || {}, pct = (x) => x == null ? "–" : (x > 0 ? "+" : "") + x.toFixed(1) + "%";
    const al = (alerts.log || []).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 15);
    return `<h1>Members</h1>
      <section class="card" style="margin-bottom:16px"><div class="card-h"><h2>Smart-money alerts <span class="sub">Polymarket public data · 2+ top sports traders on the same outcome</span></h2></div>
      <table><thead><tr><th>Market</th><th>Outcome</th><th class="num">Traders</th><th class="num">Their avg</th><th>Result</th></tr></thead><tbody>
      ${al.map((a) => `<tr><td>${esc(a.title)}</td><td>${esc(a.outcome)}</td><td class="num">${esc(a.n)}</td><td class="num">${Math.round((a.their_avg || 0) * 100)}¢</td><td>${esc(a.result || "open")}</td></tr>`).join("") || `<tr><td colspan=5 class=mute>No alerts.</td></tr>`}</tbody></table></section>
      <section class="card" style="margin-bottom:16px"><div class="card-h"><h2>Bot results <span class="sub">aggregated · ${t.settled || 0} settled · ${t.wins || 0}–${t.losses || 0} · ROI ${pct(t.roi_pct)}</span></h2></div>
      <table><thead><tr><th>Strategy</th><th class="num">Settled</th><th class="num">W–L</th><th class="num">ROI</th></tr></thead><tbody>
      ${(bots.strategies || []).map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${x.settled}</td><td class="num">${x.wins}–${x.losses}</td><td class="num">${pct(x.roi_pct)}</td></tr>`).join("")}</tbody></table>
      <p class="note" style="padding:0 16px 14px">Totals only. Results are from our own accounts and are not a promise of future results.</p></section>
      <p><a class="btn" href="#/research">Run research</a>${ctx.key ? "" : ` <a class="btn ghost" href="#/account">Connect your AI</a>`}</p>`;
  },

  "/research": async () => {
    if (!ctx.session) return gate();
    if (ctx.profile?.state_blocked) return `<h1>Research</h1>${blockedBox()}`;
    const hasKey = !!ctx.key && ctx.key.status !== "invalid", ok = active() && hasKey;
    const { data: runs } = await sb.from("research_runs").select("id,kind,input,model,status,created_at").order("created_at", { ascending: false }).limit(20);
    setTimeout(() => document.querySelectorAll("form[data-kind]").forEach((f) => f.onsubmit = async (e) => {
      e.preventDefault(); const btn = f.querySelector("button"); btn.disabled = true; btn.textContent = "Running…";
      const { data, error } = await sb.functions.invoke("research-run", { body: { kind: f.dataset.kind, query: f.q.value } });
      if (error) { flash(await fnError(error), true); return render(); }
      flash(`Run #${data.run_id} done · billed to ${data.result.billed_to}.`); sessionStorage.setItem("lastRun", JSON.stringify(data)); render();
    }));
    const last = JSON.parse(sessionStorage.getItem("lastRun") || "null");
    const notice = !active() ? `<div class="flash err">Research needs an active Member plan. <a href="#/pricing">See plans</a></div>`
      : !ctx.key ? `<div class="flash err">Connect your AI provider key to run research. <a class="btn sm" href="#/account">Connect your AI</a></div>`
      : ctx.key.status === "invalid" ? `<div class="flash err">Your saved ${esc(provName(ctx.key.provider))} key was rejected. <a class="btn sm" href="#/account">Replace key</a></div>` : "";
    return `<h1>Research</h1><p class="mute">${ctx.key ? `Using <b>${esc(provName(ctx.key.provider))}</b> · ${esc(ctx.key.model || "")} (key …${esc(ctx.key.last4)}). Your provider bills your account; Closer AI doesn't charge per run. <a href="#/account">Change</a>` : "Runs use your own AI provider key; Closer AI doesn't charge per run."}</p>${notice}
      <div class="grid">${Object.entries(RUNS).map(([k, [n]]) => `<form class="card pad f" data-kind="${k}"><h2>${n}</h2>
        <input name="q" placeholder="Topic (optional), e.g. NFL" maxlength="200"><button class="btn" ${ok ? "" : "disabled"}>Run</button></form>`).join("")}</div>
      ${last ? `<div class="card pad" style="margin:12px 0"><h2>Latest result <span class="mute">(${esc(last.result.provider_name || "")} · ${esc(last.result.model)} · billed to ${esc(last.result.billed_to || "your provider")}${last.result.usage?.total_tokens ? ` · ${last.result.usage.total_tokens} tokens` : ""})</span></h2><p style="margin-top:8px;white-space:pre-wrap">${esc(last.result.summary)}</p>
        <details style="margin-top:8px"><summary class="mute">Data used (Polymarket public)</summary><pre>${esc(JSON.stringify(last.result.markets, null, 1))}</pre></details><p class="mute" style="font-size:12px;margin-top:6px">${esc(last.result.disclaimer)}</p></div>` : ""}
      <section class="card"><div class="card-h"><h2>Your runs</h2></div><table><thead><tr><th>#</th><th>Type</th><th>Topic</th><th>Model</th><th>Status</th><th>When</th></tr></thead><tbody>
      ${(runs || []).map((r) => `<tr><td>${r.id}</td><td>${esc(RUNS[r.kind]?.[0])}</td><td>${esc(r.input)}</td><td>${esc(r.model || "–")}</td><td>${esc(r.status)}</td><td>${new Date(r.created_at).toLocaleString()}</td></tr>`).join("") || `<tr><td colspan=6 class=mute>No runs yet.</td></tr>`}</tbody></table></section>`;
  },

  "/account": async () => {
    if (!ctx.session) return gate();
    const q = new URLSearchParams(location.hash.split("?")[1] || "");
    if (q.get("checkout") === "success") flash("Payment received. Your plan activates once Stripe confirms.");
    const led = SHOW_CREDITS ? (await sb.from("credit_ledger").select("created_at,reason,bucket,delta").order("created_at", { ascending: false }).limit(50)).data : null;
    const p = ctx.profile || {}, k = ctx.key;
    setTimeout(() => {
      const keyCall = async (body, okMsg) => {
        const { data, error } = await sb.functions.invoke("ai-key", { body });
        if (error) { flash(await fnError(error), true); return render(); }
        flash(typeof okMsg === "function" ? okMsg(data) : okMsg); render();
      };
      const form = $("#keyform");
      if (form) {
        const sync = () => { // show the fields that fit the chosen provider
          const pv = form.provider.value, cat = AI[pv];
          form.key.placeholder = cat.hint;
          form.model.innerHTML = cat.models.map((m, i) => `<option value="${m}">${m}${i === 0 ? " (lower cost)" : ""}</option>`).join("") + `<option value="__other">Other model ID…</option>`;
          $("#basewrap").style.display = pv === "custom" ? "grid" : "none"; form.base_url.required = pv === "custom";
          const other = pv === "custom" || form.model.value === "__other";
          if (pv === "custom") form.model.value = "__other";
          $("#modelother").style.display = other ? "block" : "none"; form.model.style.display = pv === "custom" ? "none" : "block";
          $("#keyhelp").textContent = `Get a key at ${cat.console}. It's encrypted at rest and never shown again; we only display the last 4 characters. ${cat.name === AI.custom.name ? "Your provider" : cat.name} bills your runs to your own account.`;
        };
        form.provider.onchange = sync; form.model.onchange = () => { $("#modelother").style.display = form.model.value === "__other" ? "block" : "none"; };
        sync();
        form.onsubmit = async (e) => {
          e.preventDefault();
          const v = form.key.value.trim(); form.key.value = ""; // clear the secret field immediately
          const model = form.model.value === "__other" || form.provider.value === "custom" ? $("#modelother").value.trim() : form.model.value;
          const btn = form.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Checking with provider…";
          await keyCall({ action: "save", provider: form.provider.value, key: v, model, base_url: form.base_url.value.trim() },
            (d) => `${provName(d.provider)} key saved (…${d.last4})${d.status === "valid" ? " and verified." : ". Saved, but the provider couldn't confirm it yet."}`);
        };
      }
      const t = $("#keytest"); if (t) t.onclick = () => { t.disabled = true; t.textContent = "Testing…"; keyCall({ action: "test" }, (d) => d.status === "valid" ? "Your provider accepted the key." : "Couldn't confirm the key right now (provider unreachable or model unknown)."); };
      const d = $("#keydel"); if (d) d.onclick = () => { if (confirm("Remove your AI provider key from Closer AI?")) keyCall({ action: "delete" }, "AI provider key removed."); };
      const r = $("#keyrep"); if (r) r.onclick = () => { $("#keyform").style.display = "grid"; r.style.display = "none"; };
      const ms = $("#modelsave"); if (ms) ms.onclick = () => { const v = $("#modelpick").value === "__other" ? $("#modelpick2").value.trim() : $("#modelpick").value; keyCall({ action: "model", model: v }, `Model set to ${v}.`); };
      const mp = $("#modelpick"); if (mp) mp.onchange = () => { $("#modelpick2").style.display = mp.value === "__other" ? "block" : "none"; };
    });
    const keyForm = (hidden) => `<form class="f" id="keyform" style="margin-top:10px;${hidden ? "display:none" : ""}" autocomplete="off">
        <label class="mute" style="font-size:12px">AI provider</label>
        <select name="provider" id="provpick">${Object.entries(AI).map(([id, c]) => `<option value="${id}" ${k?.provider === id ? "selected" : ""}>${c.name}</option>`).join("")}</select>
        <div id="basewrap" style="display:none;gap:6px"><input name="base_url" type="url" placeholder="https://api.example.com/v1" spellcheck="false"><span class="mute" style="font-size:11px">https only; private/local addresses are blocked.</span></div>
        <input name="key" type="password" autocomplete="off" spellcheck="false" required>
        <label class="mute" style="font-size:12px">Model</label>
        <select name="model"></select><input id="modelother" placeholder="model ID, e.g. meta-llama/llama-4-70b" style="display:none" spellcheck="false">
        <button class="btn" type="submit">${k ? "Save new key" : "Save key"}</button>
        <p class="mute" style="font-size:12px" id="keyhelp"></p></form>`;
    const statusTxt = k ? ({ valid: '<span style="color:var(--green)">verified</span>', invalid: '<span style="color:var(--red)">rejected by provider</span>', untested: "not tested yet", unverified: "saved, not confirmed" })[k.status] : "";
    const modelPicker = k && k.provider !== "custom" ? `<div class="f" style="margin-top:8px;grid-template-columns:1fr auto;max-width:none"><select id="modelpick">${AI[k.provider].models.map((m) => `<option ${m === k.model ? "selected" : ""}>${m}</option>`).join("")}<option value="__other" ${AI[k.provider].models.includes(k.model) ? "" : "selected"}>Other model ID…</option></select><button class="btn ghost sm" id="modelsave">Save model</button>
        <input id="modelpick2" value="${AI[k.provider].models.includes(k.model) ? "" : esc(k.model || "")}" placeholder="model ID" style="${AI[k.provider].models.includes(k.model) ? "display:none" : ""}"></div>`
      : k ? `<div class="f" style="margin-top:8px;grid-template-columns:1fr auto;max-width:none"><input type="hidden" id="modelpick" value="__other"><input id="modelpick2" value="${esc(k.model || "")}" placeholder="model ID"><button class="btn ghost sm" id="modelsave">Save model</button></div>` : "";
    return `<h1>Account</h1>${blockedBox()}<div class="grid">
      <div class="card pad"><h2>Profile</h2><p class="mute" style="margin-top:6px">${esc(ctx.session.user.email)}<br>State: ${esc(p.state || "–")}<br>18+: ${p.adult_confirmed ? "yes" : "no"}</p></div>
      <div class="card pad"><h2>Plan</h2><p class="mute" style="margin-top:6px">${paid() ? `Member · renews ${new Date(ctx.sub.current_period_end).toLocaleDateString()}` : ctx.beta ? "Free beta: full access, no payment needed." : esc(ctx.sub?.status || "No plan")}</p>
        ${!active() && !p.state_blocked ? `<p style="margin-top:8px"><button class="btn" data-buy="member">Subscribe $19/mo</button></p>` : ""}</div>
      ${SHOW_CREDITS ? `<div class="card pad"><h2>Credits</h2><div class="big">${ctx.bal.plan_credits + ctx.bal.pack_credits}</div><p class="mute">${ctx.bal.plan_credits} plan · ${ctx.bal.pack_credits} top-up</p>
        ${active() && !p.state_blocked ? `<p style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${PACKS.map(([id, cr, usd]) => `<button class="btn ghost sm" data-buy="${id}">+${cr} · $${usd}</button>`).join("")}</p>` : ""}</div>` : ""}
      ${p.state_blocked ? "" : `<div class="card pad" id="aicard" style="grid-column:span 2"><h2>Your AI provider</h2>
        ${k ? `<p style="margin-top:6px"><b>${esc(provName(k.provider))}</b>${k.base_url ? ` · <span class="mute">${esc(k.base_url)}</span>` : ""} · model <code>${esc(k.model || "")}</code></p>
          <p style="margin-top:4px"><code>••••••••${esc(k.last4)}</code> · ${statusTxt}</p><p class="mute" style="font-size:12px">${k.tested_at ? "Last checked " + new Date(k.tested_at).toLocaleString() : ""}</p>
          ${modelPicker}
          <p style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn ghost sm" id="keytest">Test key</button><button class="btn ghost sm" id="keyrep">Replace / switch provider</button><button class="btn ghost sm" id="keydel">Delete</button></p>${keyForm(true)}`
        : `<p class="mute" style="margin-top:6px">No AI connected. Pick any provider below and use your own API key; runs bill to your account with that provider.</p>${keyForm(false)}`}</div>`}</div>
      ${SHOW_CREDITS ? `<section class="card"><div class="card-h"><h2>Credit ledger</h2></div><table><thead><tr><th>When</th><th>What</th><th>Bucket</th><th class="num">Credits</th></tr></thead><tbody>
      ${(led || []).map((r) => `<tr><td>${new Date(r.created_at).toLocaleString()}</td><td>${esc(r.reason)}</td><td>${esc(r.bucket)}</td><td class="num">${r.delta > 0 ? "+" : ""}${r.delta}</td></tr>`).join("") || `<tr><td colspan=4 class=mute>No credit activity yet.</td></tr>`}</tbody></table></section>` : ""}`;
  },
};

const gate = () => `<h1>Please log in</h1><p><a class="btn" href="#/login">Log in</a> <a class="btn ghost" href="#/signup">Sign up</a></p>`;

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-buy]"); if (!b) return;
  b.disabled = true;
  const { data, error } = await sb.functions.invoke("create-checkout", { body: { item: b.dataset.buy } });
  b.disabled = false;
  if (error) return flash(await fnError(error), true);
  if (data?.url) location.href = data.url;
});

let seq = 0;
async function render() {
  const my = ++seq; await loadCtx(); if (my !== seq) return; nav();
  const route = (location.hash.slice(1).split("?")[0]) || "/";
  const v = views[route] || views["/"];
  const html = await v(); if (my !== seq) return;
  $("#view").innerHTML = html;
}
window.addEventListener("hashchange", () => { if (!keep) flash(""); keep = false; render(); });
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" || ev === "SIGNED_OUT") render(); });
render();
