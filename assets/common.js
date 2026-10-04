/* Shared helpers: formatting (viewer's local time), CSV/Excel export, market chart modal. */
(function () {
  const TZ = undefined; // viewer's own time zone
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fTime = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const fShort = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  const fDate = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });
  const fDay = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const fFull = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  function mt(tsSec, withDate) {
    const d = new Date(tsSec * 1000);
    const today = fDay.format(new Date()) === fDay.format(d);
    return (withDate || !today ? fDate.format(d) + ', ' : '') + fShort.format(d);
  }
  const mtFull = (tsSec) => fFull.format(new Date(tsSec * 1000)).replace(',', '');
  const fDH = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric' });
  const mtTick = (tsSec, span) => { const d = new Date(tsSec * 1000); return span > 3 * 86400 ? fDate.format(d) : span > 12 * 3600 ? fDH.format(d) : fShort.format(d); };
  function ago(tsSec) {
    const s = Math.max(0, Math.floor(Date.now() / 1000 - tsSec));
    if (s < 60) return s + 's ago'; if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago';
  }
  function usd(n, compact) {
    if (n == null || !isFinite(n)) return '–';
    const a = Math.abs(n), sign = n < 0 ? '-' : '';
    if (compact && a >= 1e6) return sign + '$' + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
    if (compact && a >= 1e4) return sign + '$' + (a / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'K';
    return sign + '$' + a.toLocaleString('en-US', { maximumFractionDigits: a < 100 ? 2 : 0 });
  }
  const cents = (p) => { if (p == null || !isFinite(p)) return '–'; const c = Math.round(p * 1000) / 10; return (Number.isInteger(c) ? c : c.toFixed(1)) + '¢'; };
  const nice = (n) => (/^0x[0-9a-fA-F]{40}(-\d+)?$/.test(n || '') ? n.slice(0, 6) + '…' + n.slice(38, 42) : n);
  const short = (w) => (w ? w.slice(0, 6) + '…' + w.slice(-4) : '');
  const pmEvent = (slug) => 'https://polymarket.com/event/' + encodeURIComponent(slug || '');
  const pmProfile = (w) => 'https://polymarket.com/profile/' + w;

  // ---------- CSV / Excel ----------
  function toCSV(rows, cols) {
    const q = (v) => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [cols.map((c) => q(c.h)).join(',')].concat(rows.map((r) => cols.map((c) => q(c.v(r))).join(','))).join('\r\n');
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  // UTF-8 BOM so Excel opens accents/¢ correctly.
  const downloadCSV = (name, rows, cols) => download(name, '\ufeff' + toCSV(rows, cols), 'text/csv;charset=utf-8');
  const stamp = () => fDay.format(new Date());

  let xlsxP = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    xlsxP = xlsxP || new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      s.onload = () => res(window.XLSX); s.onerror = () => { xlsxP = null; rej(new Error('Could not load Excel library')); };
      document.head.appendChild(s);
    });
    return xlsxP;
  }
  // sheets: [{name, rows, cols}] -> real .xlsx with one tab per table (falls back to CSV).
  async function downloadXLSX(file, sheets) {
    try {
      const X = await loadXLSX();
      const wb = X.utils.book_new();
      for (const s of sheets) {
        const aoa = [s.cols.map((c) => c.h)].concat(s.rows.map((r) => s.cols.map((c) => { const v = c.x ? c.x(r) : c.v(r); return v == null ? '' : v; })));
        const ws = X.utils.aoa_to_sheet(aoa);
        ws['!cols'] = s.cols.map((c) => ({ wch: c.w || 14 }));
        X.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
      }
      X.writeFile(wb, file);
    } catch (e) {
      alert('Excel export unavailable (' + e.message + '). Downloading CSV instead.');
      sheets.forEach((s) => downloadCSV(file.replace(/\.xlsx$/, '') + '-' + s.name.toLowerCase().replace(/\W+/g, '-') + '.csv', s.rows, s.cols));
    }
  }

  // ---------- market chart modal ----------
  // opts: { token, title, outcome, eventSlug, buys: [{ts, price, usd, name, outcome, asset}] }
  let chart = null, cur = null;
  function ensureModal() {
    let m = document.getElementById('mkt-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'mkt-modal'; m.className = 'modal';
    m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-h"><img class="ico" id="mm-ico" alt=""><div style="min-width:0"><h3 id="mm-title"></h3>
      <div class="mute" style="font-size:12.5px;margin-top:3px" id="mm-sub"></div></div><button class="x" aria-label="Close" id="mm-x">×</button></div>
      <div class="sheet-b">
        <div class="outs" id="mm-outs"></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
          <div class="seg" id="mm-range"><button data-r="1d">1D</button><button data-r="1w">1W</button><button data-r="1m">1M</button><button data-r="max">All</button></div>
          <span class="mute" id="mm-status" style="font-size:12px"></span>
          <a class="btn ghost sm" id="mm-pm" target="_blank" rel="noopener" style="margin-left:auto">Open on Polymarket ↗</a>
        </div>
        <div class="chartbox"><canvas id="mm-canvas"></canvas></div>
        <div class="meta" id="mm-meta"></div>
        <div class="card" style="margin-top:12px">
          <div class="card-h"><h2>Top-trader buys in this market <span class="sub" id="mm-bn"></span></h2><button class="btn ghost sm" id="mm-csv">Download CSV</button></div>
          <div class="tw"><table><thead><tr><th>Time</th><th>Trader</th><th>Outcome</th><th class="num">Price</th><th class="num">Size</th></tr></thead><tbody id="mm-buys"></tbody></table></div>
        </div>
        <p class="note">Price = last traded/mid price from Polymarket's CLOB price history. Green dots = buys by top-ranked sports traders (dot size scales with $). Times are in your local time zone.</p>
      </div></div>`;
    document.body.appendChild(m);
    m.addEventListener('click', (e) => { if (e.target === m) closeChart(); });
    m.querySelector('#mm-x').onclick = closeChart;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeChart(); });
    m.querySelector('#mm-range').addEventListener('click', (e) => { const r = e.target.dataset.r; if (r && cur) { cur.range = r; drawChart(); } });
    m.querySelector('#mm-csv').onclick = () => cur && downloadCSV(`market-buys-${(cur.eventSlug || 'market')}-${stamp()}.csv`, cur.buys, [
      { h: 'time', v: (r) => mtFull(r.ts) }, { h: 'unix_ts', v: (r) => r.ts }, { h: 'trader', v: (r) => r.name }, { h: 'wallet', v: (r) => r.wallet },
      { h: 'market', v: (r) => r.title }, { h: 'outcome', v: (r) => r.outcome }, { h: 'price_cents', v: (r) => (r.price * 100).toFixed(1) },
      { h: 'shares', v: (r) => r.size }, { h: 'usd', v: (r) => r.usd }]);
    return m;
  }
  function closeChart() {
    const m = document.getElementById('mkt-modal'); if (!m) return;
    m.classList.remove('open'); document.body.style.overflow = '';
    if (location.hash.startsWith('#m=')) history.replaceState(null, '', location.pathname + location.search);
  }
  function pickRange(buys) {
    if (!buys.length) return '1d';
    const old = Math.min(...buys.map((b) => b.ts)), age = Date.now() / 1000 - old;
    return age < 86400 ? '1d' : age < 7 * 86400 ? '1w' : age < 30 * 86400 ? '1m' : 'max';
  }
  async function openChart(o) {
    const m = ensureModal();
    cur = { ...o, buys: (o.buys || []).slice().sort((a, b) => b.ts - a.ts) };
    cur.range = o.range || pickRange(cur.buys.filter((b) => b.asset === o.token));
    m.querySelector('#mm-title').textContent = o.title || 'Market';
    m.querySelector('#mm-sub').textContent = o.outcome ? 'Outcome: ' + o.outcome : '';
    const ico = m.querySelector('#mm-ico'); ico.src = o.icon || ''; ico.style.display = o.icon ? '' : 'none';
    m.querySelector('#mm-pm').href = pmEvent(o.eventSlug);
    m.querySelector('#mm-pm').style.display = o.eventSlug ? '' : 'none';
    m.querySelector('#mm-outs').innerHTML = ''; m.querySelector('#mm-meta').innerHTML = '';
    renderBuys();
    m.classList.add('open'); document.body.style.overflow = 'hidden';
    history.replaceState(null, '', '#m=' + o.token);
    drawChart();
    // market info (outcomes + current prices) is optional; chart works without it
    try {
      const mk = await window.PM.market(o.token);
      if (cur.token !== o.token && !mk.outcomes.some((x) => x.token === cur.token)) return;
      cur.market = mk;
      if (!o.title) m.querySelector('#mm-title').textContent = mk.question;
      if (!o.eventSlug && mk.eventSlug) { cur.eventSlug = mk.eventSlug; m.querySelector('#mm-pm').href = pmEvent(mk.eventSlug); m.querySelector('#mm-pm').style.display = ''; }
      renderOutcomes();
      const start = mk.gameStartTime ? Date.parse(mk.gameStartTime.replace(' ', 'T').replace(/\+00$/, 'Z')) / 1000 : null;
      m.querySelector('#mm-meta').innerHTML =
        `<span>Status: <b>${mk.closed ? 'Closed' : mk.active ? 'Open' : '–'}</b></span>` +
        (start ? `<span>Game start: <b>${esc(mt(start, true))}</b></span>` : '') +
        `<span>Volume: <b>${usd(mk.volume, true)}</b></span><span>Liquidity: <b>${usd(mk.liquidity, true)}</b></span>` +
        (mk.bestBid != null ? `<span>Bid/Ask (outcome 1): <b>${cents(mk.bestBid)} / ${cents(mk.bestAsk)}</b></span>` : '');
    } catch (e) { /* ignore */ }
  }
  function renderOutcomes() {
    const m = ensureModal(), mk = cur.market; if (!mk) return;
    const box = m.querySelector('#mm-outs');
    box.innerHTML = mk.outcomes.filter((x) => x.token).map((x) =>
      `<button data-t="${esc(x.token)}" class="${x.token === cur.token ? 'on' : ''}">${esc(x.name)} <b>${cents(x.price)}</b></button>`).join('');
    box.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      cur.token = b.dataset.t; cur.outcome = mk.outcomes.find((x) => x.token === cur.token).name;
      m.querySelector('#mm-sub').textContent = 'Outcome: ' + cur.outcome;
      history.replaceState(null, '', '#m=' + cur.token);
      renderOutcomes(); drawChart();
    };
  }
  function renderBuys() {
    const m = ensureModal();
    m.querySelector('#mm-bn').textContent = cur.buys.length ? `(${cur.buys.length} from tracked wallets)` : '';
    m.querySelector('#mm-buys').innerHTML = cur.buys.length ? cur.buys.slice(0, 100).map((b) =>
      `<tr><td>${esc(mt(b.ts))}</td><td><a class="who" href="${pmProfile(b.wallet)}" target="_blank" rel="noopener">${esc(b.name)}</a></td>
       <td><span class="out">${esc(b.outcome)}</span></td><td class="num">${cents(b.price)}</td><td class="num">${usd(b.usd)}</td></tr>`).join('')
      : `<tr><td colspan="5" class="mute">No buys from tracked top traders in the current feed for this market.</td></tr>`;
  }
  // theme-aware chart colors (read from CSS variables at draw time; redrawn when the theme changes)
  const cv = (n, d) => (getComputedStyle(document.documentElement).getPropertyValue(n) || '').trim() || d;
  const light = () => document.documentElement.getAttribute('data-theme') === 'light';
  window.addEventListener('closer-theme', () => { if (chart && cur && cur.token) drawChart(); });
  async function drawChart() {
    const m = ensureModal(), token = cur.token, range = cur.range;
    m.querySelectorAll('#mm-range button').forEach((b) => b.classList.toggle('on', b.dataset.r === range));
    const st = m.querySelector('#mm-status'); st.textContent = 'Loading price history…';
    let data;
    try {
      data = await window.PM.prices(token, range);
    } catch (e) { st.textContent = 'Price history unavailable (' + e.message + ')'; return; }
    if (cur.token !== token || cur.range !== range) return;
    const hist = data.history || [];
    st.textContent = hist.length ? (data.interval !== range ? `No ${range.toUpperCase()} data; showing ${data.interval.toUpperCase()}` : `${hist.length} points`) : 'No price history for this outcome yet.';
    const t0 = hist.length ? hist[0][0] : 0, t1 = hist.length ? hist[hist.length - 1][0] : 0;
    const marks = cur.buys.filter((b) => b.asset === token && (!hist.length || (b.ts >= t0 - 600 && b.ts <= t1 + 3600)));
    const span = Math.max(1, (t1 || Date.now() / 1000) - (t0 || Date.now() / 1000 - 86400));
    const ctx = m.querySelector('#mm-canvas');
    if (chart) chart.destroy();
    if (!window.Chart) { st.textContent = 'Chart library failed to load.'; return; }
    chart = new Chart(ctx, {
      data: { datasets: [
        { type: 'line', label: 'Price', data: hist.map(([t, p]) => ({ x: t, y: p * 100 })), borderColor: cv('--blue', '#3b82f6'), borderWidth: 2, pointRadius: 0, tension: 0.15, fill: { target: 'origin', above: light() ? 'rgba(37,99,235,.08)' : 'rgba(59,130,246,.08)' } },
        { type: 'scatter', label: 'Top-trader buys', data: marks.map((b) => ({ x: b.ts, y: b.price * 100, b })), backgroundColor: light() ? 'rgba(10,143,85,.85)' : 'rgba(34,211,138,.85)', borderColor: light() ? '#ffffff' : '#04120b', borderWidth: 1,
          pointRadius: marks.map((b) => Math.max(4, Math.min(16, Math.sqrt(b.usd) / 6))), pointHoverRadius: marks.map((b) => Math.max(6, Math.min(18, Math.sqrt(b.usd) / 6 + 2))) },
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          x: { type: 'linear', min: hist.length ? t0 : undefined, max: hist.length ? t1 : undefined, grid: { color: cv('--line', '#1c2430') },
            ticks: { color: cv('--mute', '#8a96a8'), maxTicksLimit: 6, callback: (v) => mtTick(v, span) } },
          y: { suggestedMin: 0, suggestedMax: 100, grid: { color: cv('--line', '#1c2430') }, ticks: { color: cv('--mute', '#8a96a8'), callback: (v) => v + '¢' } },
        },
        plugins: {
          legend: { labels: { color: cv('--text', '#e8edf4'), boxWidth: 10 } },
          tooltip: { callbacks: {
            title: (it) => it.length ? mt(it[0].parsed.x, true) : '',
            label: (it) => it.raw.b ? `${it.raw.b.name} bought ${cents(it.raw.b.price)} · ${usd(it.raw.b.usd)}` : `Price ${it.parsed.y.toFixed(1)}¢`,
          } },
        },
      },
    });
  }

  window.CA = { nice, esc, mt, mtFull, ago, usd, cents, short, pmEvent, pmProfile, downloadCSV, downloadXLSX, stamp, openChart, closeChart, TZ };
})();
