/* Browser-side Polymarket client (replaces the old Vercel /api functions).
   Public, read-only endpoints only; all send Access-Control-Allow-Origin: *. No keys, no trading. */
(function () {
  const DATA = 'https://data-api.polymarket.com';
  const CLOB = 'https://clob.polymarket.com';
  const GAMMA = 'https://gamma-api.polymarket.com';
  const memo = new Map();

  async function getJSON(url, { timeoutMs = 9000, retries = 2 } = {}) {
    let lastErr;
    for (let i = 0; i <= retries; i++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const r = await fetch(url, { signal: ctrl.signal });
        if (r.status === 429 || r.status >= 500) throw new Error('HTTP ' + r.status);
        if (!r.ok) { const e = new Error('HTTP ' + r.status); e.fatal = true; throw e; }
        return await r.json();
      } catch (e) {
        lastErr = e.name === 'AbortError' ? new Error('timeout') : e;
        if (e.fatal) break;
        await new Promise((res) => setTimeout(res, 500 * (i + 1)));
      } finally { clearTimeout(t); }
    }
    throw lastErr;
  }
  async function cached(key, ttlMs, fn) {
    const hit = memo.get(key), now = Date.now();
    if (hit && now - hit.at < ttlMs) return hit.val;
    const val = await fn();
    memo.set(key, { at: now, val });
    if (memo.size > 300) memo.delete(memo.keys().next().value);
    return val;
  }
  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) { const idx = i++; try { out[idx] = await fn(items[idx], idx); } catch (e) { out[idx] = { __error: String(e.message || e) }; } }
    }));
    return out;
  }
  const niceName = (n, w) => { n = n || w || ''; return /^0x[0-9a-fA-F]{40}(-\d+)?$/.test(n) ? n.slice(0, 6) + '…' + n.slice(38, 42) : n; };
  const PERIODS = new Set(['DAY', 'WEEK', 'MONTH', 'ALL']);
  const period = (p) => { p = String(p || 'MONTH').toUpperCase(); return PERIODS.has(p) ? p : 'MONTH'; };
  const parse = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v || []; } catch { return []; } };

  async function leaderboard(per, limit = 50) {
    per = period(per);
    const rows = await cached(`lb:${per}:${limit}`, 120000, async () => {
      const r = await getJSON(`${DATA}/v1/leaderboard?category=SPORTS&timePeriod=${per}&orderBy=PNL&limit=${limit}`);
      return (r || []).map((x) => ({ rank: Number(x.rank), wallet: x.proxyWallet, name: niceName(x.userName, x.proxyWallet), x: x.xUsername || '',
        verified: !!x.verifiedBadge, pnl: Number(x.pnl) || 0, vol: Number(x.vol) || 0, image: x.profileImage || '' }));
    });
    return { period: per, updated: Date.now(), rows };
  }

  // ---- feed (port of api/feed.js) ----
  const MERGE_SEC = 60;
  function mergeFills(trades) {
    const out = [], open = new Map();
    for (const t of trades) {
      const k = t.wallet + '|' + t.asset, g = open.get(k);
      if (g && g.firstTs - t.ts <= MERGE_SEC) { g.size += t.size; g.usd += t.usd; g.fills++; g.firstTs = t.ts; g.price = g.usd / g.size; continue; }
      const n = { ...t, fills: 1, firstTs: t.ts }; open.set(k, n); out.push(n);
    }
    for (const t of out) { t.usd = +t.usd.toFixed(2); t.size = +t.size.toFixed(2); t.price = +t.price.toFixed(4); delete t.firstTs; }
    return out;
  }
  function groupAgreements(trades, sinceTs) {
    const g = new Map();
    for (const t of trades) {
      if (t.ts < sinceTs) continue;
      let x = g.get(t.asset);
      if (!x) { x = { asset: t.asset, conditionId: t.conditionId, title: t.title, outcome: t.outcome, eventSlug: t.eventSlug, slug: t.slug, icon: t.icon, wallets: new Map(), usd: 0, shares: 0, first: t.ts, last: t.ts }; g.set(t.asset, x); }
      x.wallets.set(t.wallet, t.name); x.usd += t.usd; x.shares += t.size; x.first = Math.min(x.first, t.ts); x.last = Math.max(x.last, t.ts);
    }
    return [...g.values()].filter((x) => x.wallets.size >= 2).map((x) => ({
      asset: x.asset, conditionId: x.conditionId, title: x.title, outcome: x.outcome, eventSlug: x.eventSlug, slug: x.slug, icon: x.icon,
      traders: [...x.wallets.values()], n: x.wallets.size, usd: Math.round(x.usd), avgPrice: x.shares ? +(x.usd / x.shares).toFixed(4) : null, first: x.first, last: x.last,
    })).sort((a, b) => b.last - a.last);
  }
  async function feed(per, n = 30, windowMin = 30) {
    per = period(per);
    const data = await cached(`feed:${per}:${n}`, 25000, async () => {
      const lb = (await leaderboard(per, 50)).rows.slice(0, n);
      let errors = 0;
      const lists = await mapLimit(lb, 5, (t) => getJSON(`${DATA}/trades?user=${t.wallet}&limit=50&side=BUY`, { timeoutMs: 8000, retries: 1 }));
      const trades = [];
      lists.forEach((list, i) => {
        if (!Array.isArray(list)) { errors++; return; }
        const who = lb[i];
        for (const t of list) {
          if (t.side !== 'BUY') continue;
          const price = Number(t.price), size = Number(t.size);
          trades.push({ ts: Number(t.timestamp), wallet: who.wallet, name: who.name || t.name || t.pseudonym, rank: who.rank, title: t.title, outcome: t.outcome,
            outcomeIndex: t.outcomeIndex, price, size, usd: +(price * size).toFixed(2), asset: t.asset, conditionId: t.conditionId, slug: t.slug, eventSlug: t.eventSlug, icon: t.icon, tx: t.transactionHash });
        }
      });
      trades.sort((a, b) => b.ts - a.ts);
      if (!trades.length && errors) throw new Error('all wallet requests failed');
      return { trades: mergeFills(trades), rawTrades: trades.length, errors, wallets: lb.length, fetchedAt: Date.now() };
    });
    const now = Math.floor(Date.now() / 1000);
    const agrees = groupAgreements(data.trades, now - windowMin * 60);
    const earlier = groupAgreements(data.trades, now - 6 * 3600).filter((g) => !agrees.some((a) => a.asset === g.asset));
    const agreeSet = new Set(agrees.map((a) => a.asset));
    const trades = data.trades.slice(0, 400).map((t) => ({ ...t, agree: agreeSet.has(t.asset) && t.ts >= now - windowMin * 60 }));
    return { period: per, wallets: data.wallets, rawTrades: data.rawTrades, mergeSec: MERGE_SEC, walletErrors: data.errors, windowMin,
      updated: data.fetchedAt, serverNow: now * 1000, trades, agrees, earlier: earlier.slice(0, 12) };
  }

  // ---- market info (port of api/market.js) ----
  async function market(token) {
    if (!/^\d{5,90}$/.test(String(token))) throw new Error('bad_token');
    return cached(`mk:${token}`, 60000, async () => {
      const r = await getJSON(`${GAMMA}/markets?clob_token_ids=${token}`);
      const x = Array.isArray(r) ? r[0] : null;
      if (!x) throw new Error('not_found');
      const outcomes = parse(x.outcomes), prices = parse(x.outcomePrices), tokens = parse(x.clobTokenIds);
      return { question: x.question, slug: x.slug, eventSlug: (x.events && x.events[0] && x.events[0].slug) || null, endDate: x.endDate,
        gameStartTime: x.gameStartTime || null, closed: !!x.closed, active: !!x.active, volume: Number(x.volume) || 0, liquidity: Number(x.liquidity) || 0,
        icon: x.icon || x.image || '', outcomes: outcomes.map((o, i) => ({ name: o, price: prices[i] != null ? Number(prices[i]) : null, token: tokens[i] || null })),
        bestBid: x.bestBid != null ? Number(x.bestBid) : null, bestAsk: x.bestAsk != null ? Number(x.bestAsk) : null,
        lastTradePrice: x.lastTradePrice != null ? Number(x.lastTradePrice) : null };
    });
  }

  // ---- price history (port of api/prices.js) ----
  const RANGES = { '1d': [['1d', 5], ['1w', 30], ['max', 60]], '1w': [['1w', 30], ['max', 60]], '1m': [['1m', 60], ['max', 120]], max: [['max', 120]] };
  async function prices(token, range) {
    if (!/^\d{5,90}$/.test(String(token))) throw new Error('bad_token');
    range = RANGES[range] ? range : '1d';
    const out = await cached(`px:${token}:${range}`, 30000, async () => {
      for (const [interval, fidelity] of RANGES[range]) {
        const r = await getJSON(`${CLOB}/prices-history?market=${token}&interval=${interval}&fidelity=${fidelity}`);
        const h = (r && r.history) || [];
        if (h.length) return { interval, fidelity, history: h.map((p) => [p.t, p.p]) };
      }
      return { interval: null, fidelity: null, history: [] };
    });
    return { token, range, ...out };
  }

  // ---- last trade prices (port of api/last-price.js) ----
  async function lastPrices(tokens) {
    tokens = tokens.filter((t) => /^\d{5,90}$/.test(String(t)));
    const vals = await mapLimit(tokens, 4, (t) => cached(`lp:${t}`, 30000, () => getJSON(`${CLOB}/last-trade-price?token_id=${t}`, { retries: 1 })));
    const out = {};
    tokens.forEach((t, i) => { const p = vals[i] && Number(vals[i].price); out[t] = Number.isFinite(p) ? p : null; });
    return out;
  }

  window.PM = { leaderboard, feed, market, prices, lastPrices };
})();
