/* Live dashboard: leaderboard, trade feed, smart-money agreement, charts, exports. */
(function () {
  const { esc, mt, mtFull, ago, usd, cents, pmEvent, pmProfile, downloadCSV, downloadXLSX, stamp, openChart } = window.CA;
  const REFRESH_SEC = 60;
  const $ = (id) => document.getElementById(id);
  const S = { period: localStorage.getItem('ca_period') || 'MONTH', filter: 'all', q: '', feed: null, lb: null, seen: new Set(), next: 0, loading: false, lbAt: 0 };
  const isMid = (p) => p >= 0.3 && p <= 0.7;

  // ---------- data ----------
  async function getJSON(url) {
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || j.error || 'HTTP ' + r.status);
    return j;
  }
  async function loadLeaderboard() {
    try {
      const per = S.period, lb = await window.PM.leaderboard(per);
      if (per !== S.period) return;
      S.lb = lb;
      S.lbAt = Date.now(); $('lb-err').style.display = 'none';
      renderLeaderboard();
    } catch (e) { $('lb-err').textContent = 'Leaderboard failed to load: ' + e.message; $('lb-err').style.display = 'block'; }
  }
  async function loadFeed(force) {
    if (S.loading && !force) return;
    S.loading = true; const seq = (S.seq = (S.seq || 0) + 1), per = S.period;
    $('dot').className = 'dot load'; $('live-txt').textContent = 'Updating…';
    try {
      const f = await window.PM.feed(per, 30);
      if (seq !== S.seq) return; // a newer request (e.g. period switch) superseded this one
      const firstLoad = !S.feed || S.feed.period !== f.period;
      S.feed = f; $('feed-err').style.display = 'none';
      renderFeed(firstLoad); renderAgrees(); renderStats();
      $('dot').className = 'dot'; $('live-txt').textContent = 'Live · data ' + ago(f.updated / 1000);
      if (f.walletErrors) { $('feed-err').textContent = `${f.walletErrors} of ${f.wallets} wallets could not be fetched this round (rate limit or timeout); showing the rest.`; $('feed-err').style.display = 'block'; }
    } catch (e) {
      if (seq !== S.seq) return;
      $('dot').className = 'dot err'; $('live-txt').textContent = 'Feed error';
      $('feed-err').textContent = 'Live feed failed to load: ' + e.message + '. Retrying automatically.'; $('feed-err').style.display = 'block';
    } finally { if (seq === S.seq) { S.loading = false; S.next = Date.now() + REFRESH_SEC * 1000; } }
  }

  // ---------- render ----------
  function renderLeaderboard() {
    const rows = S.lb ? S.lb.rows : [];
    $('lb-sub').textContent = 'by P&L · ' + S.period.toLowerCase();
    $('lb-body').innerHTML = rows.map((r) => `<tr data-w="${esc(r.wallet)}">
      <td class="rk">${r.rank}</td>
      <td><a class="who" href="${pmProfile(r.wallet)}" target="_blank" rel="noopener" title="${esc(r.wallet)}">${esc(r.name)}</a>${r.rank <= 30 ? '' : ' <span class="mute" style="font-size:11px">(not in feed)</span>'}</td>
      <td class="num ${r.pnl >= 0 ? 'pos' : 'neg'}">${usd(r.pnl, true)}</td>
      <td class="num mute">${usd(r.vol, true)}</td></tr>`).join('') || '<tr><td colspan="4" class="mute">No data.</td></tr>';
  }
  function filtered() {
    if (!S.feed) return [];
    const now = Date.now() / 1000, q = S.q.toLowerCase();
    return S.feed.trades.filter((t) => {
      if (S.filter === 'mid' && !isMid(t.price)) return false;
      if (S.filter === 'agree' && !t.agree) return false;
      if (S.filter === 'big' && t.usd < 1000) return false;
      if (S.filter === 'c100' && t.usd < 100) return false;
      if (S.filter === 'hour' && now - t.ts > 3600) return false;
      if (q && !(`${t.title} ${t.outcome} ${t.name}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }
  const key = (t) => t.tx + ':' + t.asset + ':' + t.wallet;
  function renderFeed(firstLoad) {
    const rows = filtered().slice(0, 250);
    $('feed-sub').textContent = `BUYs from the top ${S.feed.wallets} ${S.period.toLowerCase()} wallets · ${S.feed.trades.length} orders (${S.feed.rawTrades} fills)`;
    $('feed-body').innerHTML = rows.map((t, i) => {
      const k = key(t), fresh = !firstLoad && !S.seen.has(k);
      const cls = [isMid(t.price) ? 'mid' : '', t.agree ? 'agree' : '', fresh ? 'fresh' : ''].join(' ');
      return `<tr class="${cls}" data-i="${S.feed.trades.indexOf(t)}">
        <td class="c-time" title="${esc(mtFull(t.ts))}">${esc(mt(t.ts))}</td>
        <td class="c-who"><span class="rk">#${t.rank}</span> <a class="who" href="${pmProfile(t.wallet)}" target="_blank" rel="noopener">${esc(t.name)}</a></td>
        <td class="c-mkt"><div class="mkt">${t.icon ? `<img class="ico" loading="lazy" src="${esc(t.icon)}" alt="">` : ''}<span>${esc(t.title)}</span></div></td>
        <td class="c-out"><span class="out">${esc(t.outcome)}</span>${isMid(t.price) ? '<span class="tag mid">30–70¢</span>' : ''}${t.agree ? '<span class="tag agr">Smart money agrees</span>' : ''}</td>
        <td class="c-px num">${cents(t.price)}</td>
        <td class="c-usd num"><span class="pxm">${cents(t.price)}</span>${usd(t.usd)}${t.fills > 1 ? `<div class="fills">${t.fills} fills</div>` : ''}</td></tr>`;
    }).join('') || `<tr><td colspan="6" class="mute">No trades match this filter.</td></tr>`;
    S.feed.trades.forEach((t) => S.seen.add(key(t)));
  }
  function agreeCard(a, old) {
    return `<div class="ag ${old ? 'old' : ''}" data-asset="${esc(a.asset)}">
      <div class="t">${a.icon ? `<img class="ico" src="${esc(a.icon)}" alt="">` : ''}<span>${esc(a.title)}</span></div>
      <div class="row"><span>Outcome</span><span class="out">${esc(a.outcome)}</span></div>
      <div class="row"><span>${a.n} traders</span><b style="text-align:right">${esc(a.traders.join(', '))}</b></div>
      <div class="row"><span>Total bought · avg</span><b>${usd(a.usd)} · ${cents(a.avgPrice)}</b></div>
      <div class="row"><span>Last buy</span><b>${esc(mt(a.last))} · ${ago(a.last)}</b></div></div>`;
  }
  function renderAgrees() {
    const f = S.feed;
    let html = f.agrees.map((a) => agreeCard(a, false)).join('');
    if (!f.agrees.length) {
      html = `<div class="empty">No agreement right now: no outcome has been bought by 2+ top traders in the last ${f.windowMin} minutes.${f.earlier.length ? ' Earlier clusters (last 6h) are shown below.' : ''}</div>`;
    }
    if (f.earlier.length) html += `<div class="ag-sep">Earlier · 2+ top traders on the same outcome in the last 6 hours</div>` + f.earlier.slice(0, f.agrees.length ? 4 : 8).map((a) => agreeCard(a, true)).join('');
    $('agrees').innerHTML = html;
  }
  function renderStats() {
    const f = S.feed, now = Date.now() / 1000;
    const hr = f.trades.filter((t) => now - t.ts <= 3600);
    $('s-wallets').textContent = f.wallets;
    $('s-buys').textContent = hr.length;
    $('s-usd').textContent = usd(hr.reduce((s, t) => s + t.usd, 0), true);
    $('s-agree').textContent = f.agrees.length;
  }

  // ---------- chart ----------
  function chartFor(asset, conditionId, base) {
    const buys = S.feed ? S.feed.trades.filter((t) => t.conditionId === conditionId) : [];
    openChart({ token: asset, title: base.title, outcome: base.outcome, eventSlug: base.eventSlug, icon: base.icon, buys });
  }
  $('feed-body').addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const tr = e.target.closest('tr[data-i]'); if (!tr) return;
    const t = S.feed.trades[+tr.dataset.i]; chartFor(t.asset, t.conditionId, t);
  });
  $('agrees').addEventListener('click', (e) => {
    const c = e.target.closest('.ag'); if (!c) return;
    const a = S.feed.agrees.concat(S.feed.earlier).find((x) => x.asset === c.dataset.asset); if (a) chartFor(a.asset, a.conditionId, a);
  });
  $('lb-body').addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const tr = e.target.closest('tr[data-w]'); if (!tr) return;
    $('q').value = S.q = tr.querySelector('.who').textContent; setFilter('all');
    document.getElementById('feed').scrollIntoView({ behavior: 'smooth' });
  });

  // ---------- exports ----------
  const COLS = {
    lb: [{ h: 'rank', v: (r) => r.rank, w: 6 }, { h: 'trader', v: (r) => r.name, w: 22 }, { h: 'wallet', v: (r) => r.wallet, w: 44 },
      { h: 'pnl_usd', v: (r) => r.pnl.toFixed(2), x: (r) => +r.pnl.toFixed(2), w: 14 }, { h: 'volume_usd', v: (r) => r.vol.toFixed(2), x: (r) => +r.vol.toFixed(2), w: 14 },
      { h: 'profile', v: (r) => pmProfile(r.wallet), w: 40 }],
    feed: [{ h: 'time', v: (r) => mtFull(r.ts), w: 22 }, { h: 'unix_ts', v: (r) => r.ts, w: 12 }, { h: 'rank', v: (r) => r.rank, w: 6 }, { h: 'trader', v: (r) => r.name, w: 20 },
      { h: 'wallet', v: (r) => r.wallet, w: 44 }, { h: 'market', v: (r) => r.title, w: 44 }, { h: 'outcome', v: (r) => r.outcome, w: 20 }, { h: 'side', v: () => 'BUY', w: 6 },
      { h: 'price_cents', v: (r) => (r.price * 100).toFixed(1), x: (r) => +(r.price * 100).toFixed(1), w: 10 }, { h: 'shares', v: (r) => r.size, x: (r) => +r.size, w: 12 },
      { h: 'usd', v: (r) => r.usd.toFixed(2), x: (r) => +r.usd.toFixed(2), w: 12 }, { h: 'fills', v: (r) => r.fills || 1, w: 6 }, { h: 'mid_30_70', v: (r) => (isMid(r.price) ? 'yes' : ''), w: 9 },
      { h: 'smart_money_agrees', v: (r) => (r.agree ? 'yes' : ''), w: 10 }, { h: 'event_url', v: (r) => pmEvent(r.eventSlug), w: 40 }, { h: 'token_id', v: (r) => r.asset, w: 30 }],
    agree: [{ h: 'last_buy', v: (r) => mtFull(r.last), w: 22 }, { h: 'first_buy', v: (r) => mtFull(r.first), w: 22 }, { h: 'market', v: (r) => r.title, w: 44 },
      { h: 'outcome', v: (r) => r.outcome, w: 20 }, { h: 'traders', v: (r) => r.traders.join('; '), w: 36 }, { h: 'n_traders', v: (r) => r.n, w: 8 },
      { h: 'total_usd', v: (r) => r.usd, x: (r) => +r.usd, w: 12 }, { h: 'avg_price_cents', v: (r) => (r.avgPrice * 100).toFixed(1), x: (r) => +(r.avgPrice * 100).toFixed(1), w: 10 },
      { h: 'window', v: (r) => r._win, w: 10 }, { h: 'event_url', v: (r) => pmEvent(r.eventSlug), w: 40 }, { h: 'token_id', v: (r) => r.asset, w: 30 }],
  };
  const agreeRows = () => S.feed ? S.feed.agrees.map((a) => ({ ...a, _win: S.feed.windowMin + 'm' })).concat(S.feed.earlier.map((a) => ({ ...a, _win: '6h' }))) : [];
  $('csv-lb').onclick = () => S.lb && downloadCSV(`top-sports-traders-${S.period.toLowerCase()}-${stamp()}.csv`, S.lb.rows, COLS.lb);
  $('csv-feed').onclick = () => S.feed && downloadCSV(`top-trader-buys-${stamp()}.csv`, filtered(), COLS.feed);
  $('csv-agree').onclick = () => S.feed && downloadCSV(`smart-money-agrees-${stamp()}.csv`, agreeRows(), COLS.agree);
  $('xlsx').onclick = () => S.feed && downloadXLSX(`closer-ai-dashboard-${stamp()}.xlsx`, [
    { name: 'Trade feed', rows: S.feed.trades, cols: COLS.feed },
    { name: 'Smart money agrees', rows: agreeRows(), cols: COLS.agree },
    { name: 'Leaderboard ' + S.period.toLowerCase(), rows: S.lb ? S.lb.rows : [], cols: COLS.lb },
  ]);

  // ---------- controls ----------
  function setFilter(f) { S.filter = f; document.querySelectorAll('#filters .chip').forEach((c) => c.classList.toggle('on', c.dataset.f === f)); if (S.feed) renderFeed(true); }
  $('filters').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) setFilter(c.dataset.f); });
  $('q').addEventListener('input', (e) => { S.q = e.target.value.trim(); if (S.feed) renderFeed(true); });
  function setPeriod(p) {
    S.period = p; localStorage.setItem('ca_period', p);
    document.querySelectorAll('#period button').forEach((b) => b.classList.toggle('on', b.dataset.p === p));
  }
  $('period').addEventListener('click', (e) => {
    const p = e.target.dataset.p; if (!p || p === S.period) return;
    setPeriod(p); $('feed-body').innerHTML = '<tr><td colspan="6" class="mute">Loading…</td></tr>'; loadLeaderboard(); loadFeed(true);
  });
  $('refresh').onclick = () => { loadFeed(); if (Date.now() - S.lbAt > 60000) loadLeaderboard(); };

  // auto-refresh every ~45s (paused while the tab is hidden)
  setInterval(() => {
    const left = Math.max(0, Math.ceil((S.next - Date.now()) / 1000));
    $('countdown').textContent = S.loading ? '' : '· ' + left + 's';
    if (document.hidden || S.loading) return;
    if (left <= 0) { loadFeed(); if (Date.now() - S.lbAt > 300000) loadLeaderboard(); }
    if (S.feed && !S.loading) $('live-txt').textContent = 'Live · data ' + ago(S.feed.updated / 1000);
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() > S.next) loadFeed(); });

  setPeriod(S.period);
  loadLeaderboard();
  // deep link: /dashboard#m=TOKEN opens that chart
  function openFromHash() {
    const m = location.hash.match(/^#m=(\d+)/);
    const modal = document.getElementById('mkt-modal');
    if (!m || (modal && modal.classList.contains('open'))) return;
    const t = S.feed && S.feed.trades.find((x) => x.asset === m[1]);
    chartFor(m[1], t ? t.conditionId : null, t || {});
  }
  window.addEventListener('hashchange', openFromHash);
  loadFeed().then(openFromHash);
})();
