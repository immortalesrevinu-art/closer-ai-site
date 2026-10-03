/* My bots: per-strategy record from data/bots.json (built on the box by build_bots_json.py). */
(function () {
  const { esc, usd, cents, downloadCSV, stamp } = window.CA;
  const $ = (id) => document.getElementById(id);
  const BAR = 150;
  let D = null, showUsd = localStorage.getItem('ca_usd') !== '0';
  const pct = (v, sign) => (v == null ? '–' : (sign && v > 0 ? '+' : '') + v.toFixed(1) + '%');
  const cls = (v) => (v == null ? '' : v >= 0 ? 'pos' : 'neg');
  const fmtAt = (s) => { if (!s) return '–'; const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  const RES = { win: '<span class="tag win">WIN</span>', loss: '<span class="tag loss">LOSS</span>', open: '<span class="tag pend">OPEN</span>', closed_early: '<span class="tag pend">SOLD</span>' };

  function applyUsd() {
    const has = D && D.show_dollars && D.totals.pnl_usd !== undefined, on = has && showUsd;
    document.querySelectorAll('.usd').forEach((e) => { e.style.display = on ? '' : 'none'; });
    $('usd-toggle').style.display = has ? '' : 'none';
    $('usd-toggle').textContent = on ? 'Hide $' : 'Show $';
  }
  function render() {
    const t = D.totals;
    $('t-n').textContent = t.settled;
    $('t-wl').textContent = `${t.wins}–${t.losses}`;
    $('t-roi').textContent = pct(t.roi_pct, true); $('t-roi').className = cls(t.roi_pct);
    $('t-pnl').textContent = t.pnl_usd == null ? '–' : (t.pnl_usd > 0 ? '+' : '') + usd(t.pnl_usd); $('t-pnl').className = cls(t.pnl_usd);
    const src = (D.sources || []).map((s) => `${s.name} ${fmtAt(s.updated_utc)}`).join(' · ');
    $('fresh').textContent = `Updated ${fmtAt(D.generated_at_utc)}. ${t.open} bets open. Ledgers: ${src}`;
    $('strats').innerHTML = D.strategies.map((s) => {
      const p = Math.min(100, (100 * s.settled) / BAR);
      return `<tr><td><b>${esc(s.name)}</b><div class="mute" style="font-size:12px;max-width:360px">${esc(s.description)}</div></td>
        <td class="num">${s.settled}</td><td class="num">${s.wins}–${s.losses}</td><td class="num">${pct(s.win_rate_pct)}</td>
        <td class="num ${cls(s.roi_pct)}">${pct(s.roi_pct, true)}</td>
        <td class="num usd ${cls(s.pnl_usd)}">${s.pnl_usd == null ? '–' : (s.pnl_usd > 0 ? '+' : '') + usd(s.pnl_usd)}</td>
        <td class="num hide-sm">${s.avg_price == null ? '–' : cents(s.avg_price)}</td><td class="num">${s.open}</td>
        <td class="hide-sm" style="min-width:120px"><div style="height:6px;background:#1a212c;border-radius:9px;overflow:hidden"><i style="display:block;height:100%;width:${p}%;background:var(--green)"></i></div>
        <span class="mute" style="font-size:11.5px">${s.settled}/${BAR}</span></td></tr>`;
    }).join('') || '<tr><td colspan="9" class="mute">No bets yet.</td></tr>';
    $('recent-sub').textContent = `latest ${D.recent.length}`;
    $('recent').innerHTML = D.recent.map((r) => `<tr>
        <td>${esc(fmtAt(r.at_utc))}</td><td>${esc(r.strategy_name)}</td><td>${esc(r.label)}</td>
        <td><span class="out">${esc(r.side)}${r.pick ? ' · ' + esc(r.pick) : ''}</span></td>
        <td class="num">${r.price == null ? '–' : cents(r.price)}</td><td class="num hide-sm">${r.contracts ?? '–'}</td>
        <td>${RES[r.status] || esc(r.status)}</td><td class="num ${cls(r.roi_pct)}">${pct(r.roi_pct, true)}</td>
        <td class="num usd ${cls(r.pnl_usd)}">${r.pnl_usd == null ? '–' : (r.pnl_usd > 0 ? '+' : '') + usd(r.pnl_usd)}</td></tr>`).join('');
    $('notes').textContent = (D.notes || []).join(' ');
    applyUsd();
  }
  function load() {
    fetch('data/bots.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((d) => { D = d; render(); })
      .catch((e) => { if (!D) { $('fresh').textContent = 'Bot stats are unavailable right now (' + e.message + ').'; $('strats').innerHTML = $('recent').innerHTML = '<tr><td colspan="9" class="mute">No data.</td></tr>'; } });
  }
  $('usd-toggle').onclick = () => { showUsd = !showUsd; localStorage.setItem('ca_usd', showUsd ? '1' : '0'); applyUsd(); };
  $('csv').onclick = () => D && downloadCSV(`closer-ai-my-bots-${stamp()}.csv`, D.recent, [
    { h: 'time_utc', v: (r) => r.at_utc }, { h: 'strategy', v: (r) => r.strategy_name }, { h: 'venue', v: (r) => r.venue }, { h: 'match', v: (r) => r.label },
    { h: 'side', v: (r) => r.side }, { h: 'pick', v: (r) => r.pick }, { h: 'price', v: (r) => r.price }, { h: 'contracts', v: (r) => r.contracts },
    { h: 'result', v: (r) => r.status }, { h: 'roi_pct', v: (r) => r.roi_pct }].concat(D.show_dollars && showUsd ? [{ h: 'cost_usd', v: (r) => r.cost_usd }, { h: 'pnl_usd', v: (r) => r.pnl_usd }] : []));
  load();
  setInterval(load, 120000);
})();
