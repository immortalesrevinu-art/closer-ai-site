/* Results page for the bundled alert-log snapshot (public/data/alerts.json). */
(function () {
  const { nice, esc, mt, mtFull, usd, cents, pmEvent, downloadCSV, downloadXLSX, stamp, openChart } = window.CA;
  const $ = (id) => document.getElementById(id);
  let rows = [];
  function status(a) {
    if (a.result === 'win' || a.result === 'loss') return a.result;
    if (a.now != null && a.now >= 0.99) return 'likely-win';
    if (a.now != null && a.now <= 0.01) return 'likely-loss';
    return 'pending';
  }
  const pnl = (a, s) => (s === 'win' ? 100 * (1 / a.ask_now - 1) : s === 'loss' ? -100 : null);
  function render() {
    const settled = rows.filter((a) => a.result === 'win' || a.result === 'loss');
    const w = settled.filter((a) => a.result === 'win').length, l = settled.length - w;
    $('r-n').textContent = rows.length;
    $('r-wl').textContent = `${w}–${l}`;
    $('r-rate').textContent = settled.length ? Math.round((100 * w) / settled.length) + '%' : 'n/a';
    const p = settled.reduce((s, a) => s + pnl(a, a.result), 0);
    $('r-pnl').textContent = settled.length ? (p >= 0 ? '+' : '') + usd(p) : 'n/a';
    $('r-pnl').className = settled.length ? (p >= 0 ? 'pos' : 'neg') : '';
    const pend = rows.filter((a) => status(a) === 'pending' || status(a).startsWith('likely')).length;
    if (!settled.length && pend) $('r-rate').nextElementSibling.textContent = `win rate (settled) · ${pend} pending`;
    $('body').innerHTML = rows.slice().sort((a, b) => b.at - a.at).map((a) => {
      const s = status(a);
      const tag = { win: '<span class="tag win">WIN</span>', loss: '<span class="tag loss">LOSS</span>', 'likely-win': '<span class="tag win">Likely win*</span>',
        'likely-loss': '<span class="tag loss">Likely loss*</span>', pending: '<span class="tag pend">Pending</span>' }[s];
      const now = a.now === undefined ? '…' : cents(a.now);
      return `<tr data-asset="${esc(a.asset)}"><td class="c-time" title="${esc(mtFull(a.at))}">${esc(mt(a.at, true))}</td><td class="c-mkt">${esc(a.title)}</td><td class="c-out"><span class="out">${esc(a.outcome)}</span></td>
        <td class="hide-sm">${esc((a.traders || []).map(nice).join(', '))}</td><td class="num hide-sm">${usd(a.usd)}</td><td class="num c-px">${cents(a.their_avg)}</td>
        <td class="num c-px">${cents(a.ask_now)}</td><td class="num c-px">${now}</td><td class="c-res">${tag}</td>
        <td class="c-mob">${esc((a.traders || []).map(nice).join(', '))} · ${usd(a.usd)}<br>Avg ${cents(a.their_avg)} · Ask ${cents(a.ask_now)} · Now ${now}</td></tr>`;
    }).join('') || '<tr><td colspan="9" class="mute">No alerts logged yet.</td></tr>';
  }
  const COLS = [{ h: 'alert_time', v: (a) => mtFull(a.at), w: 22 }, { h: 'unix_ts', v: (a) => Math.round(a.at), w: 12 }, { h: 'market', v: (a) => a.title, w: 44 },
    { h: 'outcome', v: (a) => a.outcome, w: 22 }, { h: 'traders', v: (a) => (a.traders || []).join('; '), w: 30 }, { h: 'n_traders', v: (a) => a.n, w: 8 },
    { h: 'their_usd', v: (a) => a.usd, x: (a) => +a.usd, w: 10 }, { h: 'their_avg_cents', v: (a) => Math.round(a.their_avg * 100), x: (a) => Math.round(a.their_avg * 100), w: 10 },
    { h: 'ask_at_alert_cents', v: (a) => Math.round(a.ask_now * 100), x: (a) => Math.round(a.ask_now * 100), w: 10 },
    { h: 'now_cents', v: (a) => (a.now == null ? '' : (a.now * 100).toFixed(1)), x: (a) => (a.now == null ? '' : +(a.now * 100).toFixed(1)), w: 10 },
    { h: 'logged_result', v: (a) => a.result || 'pending', w: 10 }, { h: 'status', v: (a) => status(a), w: 12 },
    { h: 'hypo_pnl_100', v: (a) => { const p = pnl(a, a.result); return p == null ? '' : p.toFixed(2); }, x: (a) => { const p = pnl(a, a.result); return p == null ? '' : +p.toFixed(2); }, w: 10 },
    { h: 'event_url', v: (a) => pmEvent(a.slug), w: 40 }, { h: 'token_id', v: (a) => a.asset, w: 30 }];
  $('csv').onclick = () => downloadCSV(`closer-ai-alert-results-${stamp()}.csv`, rows, COLS);
  $('xlsx').onclick = () => downloadXLSX(`closer-ai-alert-results-${stamp()}.xlsx`, [{ name: 'Alert results', rows, cols: COLS }]);
  $('body').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-asset]'); if (!tr) return;
    const a = rows.find((x) => x.asset === tr.dataset.asset);
    openChart({ token: a.asset, title: a.title, outcome: a.outcome, eventSlug: a.slug, buys: [] });
  });
  fetch('data/alerts.json', { cache: 'no-cache' }).then((r) => r.json()).then(async (d) => {
    rows = d.log || [];
    $('snap').textContent = `Snapshot of the alert log taken ${mtFull(d.snapshot_at)}. Refreshed automatically from the bot log.`;
    render();
    const toks = [...new Set(rows.map((a) => a.asset).filter(Boolean))];
    for (let i = 0; i < toks.length; i += 25) {
      try {
        const prices = await window.PM.lastPrices(toks.slice(i, i + 25));
        rows.forEach((a) => { if (a.asset in prices) a.now = prices[a.asset]; });
      } catch (e) { rows.forEach((a) => { if (a.now === undefined) a.now = null; }); }
    }
    render();
  }).catch(() => { $('body').innerHTML = '<tr><td colspan="9" class="mute">Could not load the alert log snapshot.</td></tr>'; });
})();
