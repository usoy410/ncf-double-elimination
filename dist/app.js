/**
 * @file app.js
 * @description Tournament Frontend Controller for NCF Intramurals 2026 Call of Legends.
 * Orchestrates bracket rendering, live 5-second background sync, spectator vs organizer
 * authorization, and Optimistic Concurrency Control (OCC) conflict rejection.
 */

const { defaults: DEFAULTS, specs, groups, blankGames, fresh, scores, derive, champion, placements, gameSkipped, record, sourceLabel, valid, migrate } = Bracket;
const KEY = 'ncf-legends-2026-placement-v3';

// Core Application State
let data = fresh();
let versions = { MLBB: 1, CODM: 1 };
let active = 'MLBB';
let selected = null;
let storageOK = true;
let migrated = false;

// Fallback API client if running in mocked test environment
const API = (typeof TournamentAPI !== 'undefined' ? TournamentAPI : null) || {
  getToken: () => null,
  getProfile: () => null,
  isOrganizer: () => false,
  login: async () => ({ success: false }),
  logout: () => {},
  fetchBrackets: async () => ({ success: false }),
  recordGameOCC: async () => ({ success: false }),
  updateTeamsOCC: async () => ({ success: false }),
  resetBracketOCC: async () => ({ success: false }),
};

// Restore from browser cache on startup for instant rendering
try {
  const stored = JSON.parse(localStorage.getItem(KEY));
  if (valid(stored, specs.map(s => s.bestOf))) {
    data = stored;
  } else {
    const old = JSON.parse(localStorage.getItem('ncf-legends-2026-double-v2')) || JSON.parse(localStorage.getItem('ncf-legends-2026-v1'));
    if (valid(old, Array(15).fill(3)) || valid(old, Array(7).fill(3))) {
      data = migrate(old);
      migrated = true;
      localStorage.setItem(KEY, JSON.stringify(data));
    }
  }
} catch {
  storageOK = false;
}

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Saves current tournament bracket data to localStorage as an offline buffer.
 */
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    storageOK = true;
  } catch {
    storageOK = false;
  }
  render();
}

/**
 * Displays user notification or conflict warning toast.
 * @param {string} message Text to display
 * @param {boolean} [isConflict=false] Whether this notification represents a rejected conflict
 */
function notify(message, isConflict = false) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = isConflict ? 'conflict' : '';
  toast.style.display = 'block';
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => { toast.style.display = 'none'; }, isConflict ? 5000 : 3500);
}

/**
 * Derives natural language outcome text for completed matches.
 */
function resultText(i, ms, t) {
  const place = placements(ms).indexOf(ms[i].winner);
  return ms[i].winner === null ? '' : `${t.names[ms[i].winner]} ${place >= 0 ? `finish in place ${place + 1}` : 'advance'}.`;
}

/**
 * Updates header badges to reflect live connection and organizer authentication state.
 */
function updateAuthUI() {
  const isOrg = API.isOrganizer();
  for (const selector of ['#edit', '#reset']) {
    const button = $(selector);
    if (button) button.hidden = !isOrg;
  }
  if (!isOrg) $('#team-dialog')?.close();
  const streamEditor = $('#stream-editor');
  if (streamEditor) streamEditor.hidden = !isOrg;
  const authBar = $('#auth-bar');
  if (!authBar) return;
  const profile = API.getProfile();

  authBar.hidden = false;
  if (isOrg) {
    authBar.innerHTML = `<span class="auth-badge">★ Organizer: <b>${esc(profile?.name || 'Marshall')}</b> <button type="button" class="logout-btn" id="logout-btn">Log out</button></span>`;
    const logoutBtn = $('#logout-btn');
    if (logoutBtn) logoutBtn.onclick = () => { API.logout(); updateAuthUI(); render(); notify('Logged out of organizer mode.'); if (selected !== null && $('#match-dialog')?.open) showMatch(selected); };
  } else {
    authBar.innerHTML = '<button id="auth-btn" class="auth-btn" type="button">Login</button>';
    const authBtn = $('#auth-btn');
    if (authBtn) authBtn.onclick = () => window.location.assign('/login');
  }
}

/**
 * Handles recording a game winner with Optimistic Concurrency Control.
 * If another device updated the match, the edit is rejected and latest state is pulled.
 */
async function chooseGame(i, g, side) {
  const t = data[active];

  // Viewer check: Only approved tournament organizers can record results
  if (!API.isOrganizer()) {
    notify('👁️ Spectator mode. Log in as an approved organizer to record scores.');
    return;
  }

  // Pre-validate move in memory
  if (!record(t, i, g, side)) return;

  // Execute OCC update against the live server
  const expectedVer = versions[active] || 1;
  const res = await API.recordGameOCC({
    title: active,
    expectedVersion: expectedVer,
    matchIndex: i,
    gameIndex: g,
    winnerSide: side,
  });

  if (res && res.conflict) {
    // REJECT CONFLICTING EDIT: Preserve integrity and load server's current state
    notify('⚠️ Edit rejected: Match was updated on another device. Refreshed with latest results.', true);
    if (res.current) {
      data[active].names = res.current.names;
      data[active].games = res.current.games;
      versions[active] = res.current.version;
      save();
    }
    showMatch(i);
    return;
  }

  if (res && res.success && res.version) {
    versions[active] = res.version;
  }

  save();
  showMatch(i);
  const ms = derive(t);
  if (ms[i].winner !== null) notify(resultText(i, ms, t));
}

/**
 * Generates semantic HTML for a match bracket card.
 */
function matchHTML(i, m, t) {
  const complete = m.winner !== null;
  return `<button class="match" data-match="${i}" aria-label="Open match ${i + 1}: ${m.seeds.map(s => s === null ? 'To be decided' : esc(t.names[s])).join(' versus ')}"><div class="match-title">${specs[i].title}</div><div class="match-label"><span>M${String(i + 1).padStart(2, '0')} · BO${specs[i].bestOf}</span><span class="${m.ready ? 'ready' : ''}">${complete ? 'COMPLETE' : m.ready ? 'VIEW SERIES ↗' : 'UPCOMING'}</span></div>${m.seeds.map((seed, k) => `<div class="team-row ${seed === null ? 'pending' : ''} ${complete && seed === m.winner ? 'winner' : ''}"><span class="seed">${seed === null ? '—' : String(seed + 1).padStart(2, '0')}</span><span>${seed === null ? sourceLabel(specs[i].sources[k]) : esc(t.names[seed])}</span><span class="score">${complete && seed === m.winner ? '✓ &nbsp; ' : ''}${m.ready ? m.score[k] : '—'}</span></div>`).join('')}</button>`;
}

/**
 * Main render function: builds bracket grid, standings, and connects SVG lines.
 */
function render() {
  const t = data[active];
  const ms = derive(t);
  const champ = champion(ms);
  const complete = ms.filter(m => m.winner !== null).length;
  const total = 12;

  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === active));

  const savedEl = $('#saved');
  if (savedEl) savedEl.textContent = storageOK ? 'Live synchronized (5s)' : 'Storage unavailable · keep this tab open';

  const progressEl = $('#progress');
  if (progressEl) {
    progressEl.innerHTML = `<div style="width:${(complete / total) * 100}%"></div>`;
    progressEl.setAttribute('aria-label', `${complete} of ${total} matches completed`);
  }

  const boardEl = $('#board');
  if (boardEl) {
    boardEl.innerHTML = groups.map(group => `<section class="bracket-group ${group.kind}"><div class="group-title">${group.title}<span>${group.note}</span></div><div class="bracket-grid">${group.columns.map(([name, ids]) => `<div class="column"><div class="column-heading">${name}</div><div class="matches">${ids.map(i => matchHTML(i, ms[i], t)).join('')}</div></div>`).join('')}${group.kind === 'championship' ? `<div class="column"><div class="column-heading">CHAMPION</div><div class="matches"><div class="champion-box" data-champion><div class="trophy" aria-hidden="true">♜</div><small>${champ === null ? 'THE CROWN AWAITS' : 'NCF 2026 CHAMPION'}</small><h3>${champ === null ? 'WHO WILL RISE?' : esc(t.names[champ])}</h3><p>${champ === null ? 'One final. One champion.' : `${active} · Champions of the campus`}</p></div></div></div>` : ''}</div></section>`).join('');
  }

  document.querySelectorAll('[data-match]').forEach(b => {
    b.onclick = () => showMatch(Number(b.dataset.match));
  });

  if (typeof drawBracketConnectors === 'function') drawBracketConnectors();
  const standings = $('#placements');
  if (standings) standings.innerHTML = `<h2>${active} final placements</h2><p>All eight teams, from champion to eighth place.</p><ol>${placements(ms).map((seed, i) => `<li class="${i < 3 ? 'podium' : ''}"><span>${String(i + 1).padStart(2, '0')}</span><div><small>${['Champion', 'Runner-up', 'Third place'][i] || `Place ${i + 1}`}</small><strong>${seed === null ? 'To be decided' : esc(t.names[seed])}</strong></div></li>`).join('')}</ol>`;
  updateAuthUI();
}

/**
 * Displays match details dialog with round-by-round score controls.
 */
function showMatch(i) {
  selected = i;
  const t = data[active];
  const m = derive(t)[i];
  const games = t.games[i];
  const isOrg = API.isOrganizer();
  const name = k => m.seeds[k] === null ? 'TBD' : esc(t.names[m.seeds[k]]);

  const contentEl = $('#match-content');
  if (!contentEl) return;

  contentEl.innerHTML = `<div class="dialog-top"><p class="eyebrow">${active} / M${String(i + 1).padStart(2, '0')} · BO${specs[i].bestOf}</p><button data-close aria-label="Close match">✕</button></div><h2>${specs[i].title}</h2><div class="${isOrg ? 'organizer-notice' : 'viewer-notice'}">${isOrg ? '⚡ Organizer mode: Tap winner to record series results. Conflicting updates will be rejected.' : '👁️ Spectator viewing mode: Match results sync live every 5 seconds.'}</div><div class="series-score"><span>${name(0)}</span><span>${m.score[0]} : ${m.score[1]}</span><span>${name(1)}</span></div><div class="rounds" style="--game-count:${games.length}">${games.map((v, g) => {
    const skip = gameSkipped(games, g, specs[i].winTarget);
    const locked = !m.ready || (g > 0 && games[g - 1] === null) || skip || !isOrg;
    return `<div class="round"><h3>${active === 'CODM' ? 'MAP' : 'GAME'} 0${g + 1}</h3>${[0, 1].map(k => `<button data-game="${g}" data-side="${k}" ${locked ? 'disabled' : ''} class="${v === k ? 'chosen' : ''}" aria-pressed="${v === k}">${name(k)} &nbsp; ${v === k ? '✓' : '+'}</button>`).join('')}<p>${skip ? 'Not needed' : v !== null ? 'Winner recorded' : locked && !isOrg ? 'Spectator view' : locked ? 'Awaiting prior game' : 'Select winner'}</p></div>`;
  }).join('')}</div><div class="dialog-bottom"><span>${m.winner === null ? `Best of ${specs[i].bestOf} · ${specs[i].winTarget} wins to take the series` : esc(resultText(i, derive(t), t))}</span><button data-close>Done</button></div>${isOrg ? '<p>To correct a result, tap the winner again. Later games and affected downstream matchups will clear.</p>' : ''}`;

  contentEl.querySelectorAll('[data-game]').forEach(b => {
    b.onclick = () => chooseGame(i, Number(b.dataset.game), Number(b.dataset.side));
  });

  bindClose();
  const matchDialog = $('#match-dialog');
  if (matchDialog && !matchDialog.open && typeof matchDialog.showModal === 'function') {
    matchDialog.showModal();
  }
}

/**
 * Binds dialog close buttons.
 */
function bindClose() {
  document.querySelectorAll('[data-close]').forEach(b => {
    b.onclick = () => b.closest('dialog')?.close();
  });
}

/**
 * 5-Second Live Background Synchronization.
 * Fetches latest brackets from server, updates state if newer version exists.
 */
async function syncEveryFiveSeconds() {
  if (typeof fetch === 'undefined') return;
  const res = await API.fetchBrackets();
  const syncBadge = $('#sync-status');
  const syncText = $('#sync-text');

  if (!res || !res.success || !res.brackets) {
    if (syncBadge) { syncBadge.className = 'sync-badge offline'; }
    if (syncText) syncText.textContent = 'OFFLINE';
    return;
  }

  if (syncBadge) { syncBadge.className = 'sync-badge live'; }
  if (syncText) syncText.textContent = 'LIVE · 5s';

  let hasNewerState = false;
  for (const title of ['MLBB', 'CODM']) {
    const serverBracket = res.brackets[title];
    if (serverBracket && serverBracket.version > (versions[title] || 0)) {
      data[title].names = serverBracket.names;
      data[title].games = serverBracket.games;
      versions[title] = serverBracket.version;
      hasNewerState = true;
    }
  }

  if (hasNewerState) {
    save();
    if ($('#match-dialog')?.open && selected !== null) {
      showMatch(selected);
    }
  }
}

// Background sync heartbeat every 5 seconds (5000 ms)
if (typeof setInterval !== 'undefined') {
  setInterval(syncEveryFiveSeconds, 5000);
}

// Tab Switching
document.querySelectorAll('[data-tab]').forEach(b => {
  b.onclick = () => {
    active = b.dataset.tab;
    render();
  };
});

// Edit Teams Action
const editBtn = $('#edit');
if (editBtn) {
  editBtn.onclick = () => {
    if (!API.isOrganizer()) {
      notify('Only approved organizers can edit team names.');
      return;
    }
    const teamFields = $('#team-fields');
    if (teamFields) {
      teamFields.innerHTML = data[active].names.map((n, i) => `<label>SEED ${String(i + 1).padStart(2, '0')}<input name="team${i}" value="${esc(n)}" required maxlength="32" aria-label="Team ${i + 1}"></label>`).join('');
    }
    $('#team-dialog')?.showModal();
  };
}

// Save Teams Form Submission with OCC
const teamForm = $('#team-form');
if (teamForm) {
  teamForm.onsubmit = async e => {
    e.preventDefault();
    if (!API.isOrganizer()) return notify('Only approved organizers can edit team names.');
    const names = Array.from($('#team-fields').querySelectorAll('input')).map(x => x.value.trim());
    if (names.some(n => !n)) return notify('Every team needs a name.');
    if (new Set(names.map(n => n.toLowerCase())).size < 8) return notify('Please give each team a unique name.');

    const expectedVer = versions[active] || 1;
    const res = await API.updateTeamsOCC(active, expectedVer, names);

    if (res && res.conflict) {
      notify('⚠️ Conflict rejected: Team names were updated on another device. Refreshed.', true);
      if (res.current) {
        data[active].names = res.current.names;
        versions[active] = res.current.version;
        save();
      }
      return;
    }

    if (res && res.success && res.version) {
      versions[active] = res.version;
    }

    data[active].names = names;
    save();
    $('#team-dialog')?.close();
    notify('Team names updated.');
  };
}

// Reset Bracket Action with OCC
const resetBtn = $('#reset');
if (resetBtn) {
  resetBtn.onclick = async () => {
    if (!API.isOrganizer()) {
      notify('Only approved organizers can reset brackets.');
      return;
    }
    if (confirm(`Reset all ${active} results? Team names will stay. This cannot be undone.`)) {
      const expectedVer = versions[active] || 1;
      const res = await API.resetBracketOCC(active, expectedVer);

      if (res && res.conflict) {
        notify('⚠️ Conflict rejected: Bracket was updated on another device before reset.', true);
        syncEveryFiveSeconds();
        return;
      }

      if (res && res.success && res.version) {
        versions[active] = res.version;
      }

      data[active].games = blankGames();
      save();
      notify(`${active} bracket reset.`);
    }
  };
}

// Organizer Login Form Submission
const authError = $('#auth-error');
function clearLoginError() {
  if (authError) {
    authError.textContent = '';
    authError.hidden = true;
  }
  $('#organizer-passcode')?.removeAttribute('aria-invalid');
}
const passcodeInput = $('#organizer-passcode');
if (passcodeInput) passcodeInput.oninput = clearLoginError;
const authForm = $('#auth-form');
if (authForm) {
  authForm.onsubmit = async e => {
    e.preventDefault();
    clearLoginError();
    const passcode = $('#organizer-passcode')?.value;
    const res = await API.login(passcode);

    if (res && res.success) {
      $('#auth-dialog')?.close();
      if (window.location.pathname.replace(/\/$/, '') === '/login') {
        window.location.replace('/');
        return;
      }
      updateAuthUI();
      render();
      notify(`Welcome, ${res.organizer?.name || 'Marshall'}! Organizer mode enabled.`);
      if (selected !== null && $('#match-dialog')?.open) {
        showMatch(selected);
      }
    } else {
      if (authError) {
        authError.textContent = res?.error || 'Invalid tournament passcode.';
        authError.hidden = false;
      }
      $('#organizer-passcode')?.setAttribute('aria-invalid', 'true');
    }
  };
}

/**
 * Exports printable tournament brackets and placements.
 */
function exportPDF() {
  const t = data[active];
  const ms = derive(t);
  const header = `<h1>NCF INTRAMURALS 2026 · ${active}</h1><p>SINGLE ELIMINATION WITH FULL PLACEMENTS | 8 TEAMS | 12 SERIES | 11 BO3 + BO5 CHAMPIONSHIP</p>`;
  const printView = $('#print-view');
  if (printView) {
    printView.innerHTML = groups.map(group => `<section>${header}<h2>${group.title}</h2><p>${group.note}</p><div class="print-bracket">${group.columns.map(([title, ids]) => `<div><h3>${title}</h3><div class="print-column">${ids.map(i => `<div class="print-match" data-match="${i}"><small>M${i + 1} · ${specs[i].title} · BO${specs[i].bestOf}</small>${ms[i].seeds.map((seed, k) => `<div>${seed === null ? sourceLabel(specs[i].sources[k]) : esc(t.names[seed])} — ${ms[i].score[k]}${seed !== null && seed === ms[i].winner ? ' ✓' : ''}</div>`).join('')}</div>`).join('')}</div></div>`).join('')}</div><footer>Exported ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} (Philippine time) · Current bracket state</footer></section>`).join('') + `<section>${header}<h2>FINAL PLACEMENTS</h2><table><thead><tr><th>Place</th><th>Team</th></tr></thead><tbody>${placements(ms).map((seed, i) => `<tr><td>${i + 1}</td><td>${seed === null ? 'To be decided' : esc(t.names[seed])}</td></tr>`).join('')}</tbody></table></section><section>${header}<h2>${active === 'CODM' ? 'MAP' : 'GAME'} RESULTS</h2><table><thead><tr><th>Match</th><th>Teams</th>${[1, 2, 3, 4, 5].map(n => `<th>${active === 'CODM' ? 'Map' : 'Game'} ${n}</th>`).join('')}<th>Winner</th></tr></thead><tbody>${ms.map((m, i) => `<tr><td>M${i + 1} · BO${specs[i].bestOf}</td><td>${m.seeds.map(seed => seed === null ? 'TBD' : esc(t.names[seed])).join(' vs ')}</td>${[0, 1, 2, 3, 4].map(g => `<td>${g >= specs[i].bestOf ? '—' : gameSkipped(t.games[i], g, specs[i].winTarget) ? 'Not needed' : t.games[i][g] === null ? 'Pending' : esc(t.names[m.seeds[t.games[i][g]]] ?? 'TBD')}</td>`).join('')}<td>${m.winner === null ? 'Pending' : esc(t.names[m.winner])}</td></tr>`).join('')}</tbody></table></section>`;
  }
  document.title = `NCF-2026-${active}-12-Series`;
  if (typeof drawBracketConnectors === 'function') drawBracketConnectors();
  if (typeof window.print === 'function') window.print();
  document.title = 'Call of Legends · NCF Intramurals 2026';
}

const exportBtn = $('#export');
if (exportBtn) exportBtn.onclick = exportPDF;

bindClose();
if (window.location.pathname.replace(/\/$/, '') === '/organizer') {
  window.location.replace('/login');
} else if (window.location.pathname.replace(/\/$/, '') === '/login') {
  if (API.isOrganizer()) window.location.replace('/');
  else $('#auth-dialog')?.showModal();
}
render();

// Perform initial sync immediately upon load
if (typeof fetch !== 'undefined') {
  syncEveryFiveSeconds();
}

if (migrated) notify('New format: team names, quarterfinals and championship semifinals retained. Other series start fresh.');

// Stream state is shared separately from bracket scores and their OCC versions.
let streamLinks = { MLBB: '', CODM: '' };
let streamsLoaded = false;
function renderStreams() {
  const links = $('#stream-links');
  if (!links) return;
  links.innerHTML = ['MLBB', 'CODM'].map(title => {
    let url = '';
    try { const parsed = new URL(streamLinks[title]); if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) url = parsed.href; } catch {}
    return `<div class="stream-card"><div><strong>${title}</strong><span>${title === 'MLBB' ? 'Mobile Legends: Bang Bang' : 'Call of Duty: Mobile'}</span></div>${url ? `<a class="watch-stream" href="${esc(url)}" target="_blank" rel="noopener noreferrer">▶ Watch ${title}<span class="sr-only"> (opens in a new tab)</span></a>` : '<span class="stream-unavailable">Link not posted yet</span>'}</div>`;
  }).join('');
}
async function loadStreams() {
  if (typeof fetch === 'undefined') return;
  try {
    const res = await fetch('/api/streams', { cache: 'no-store' });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error();
    streamLinks = result.streams;
    if (!streamsLoaded && $('#stream-url') && !$('#stream-url').value) {
      $('#stream-url').value = streamLinks[$('#stream-title').value] || '';
    }
    streamsLoaded = true;
    renderStreams();
  } catch { const message = $('#stream-message'); if (message) message.textContent = 'Unable to refresh livestream links. Please try again.'; }
}
const streamTitle = $('#stream-title');
if (streamTitle) streamTitle.onchange = () => { $('#stream-url').value = streamLinks[streamTitle.value] || ''; };
const streamForm = $('#stream-form');
if (streamForm) streamForm.onsubmit = async event => {
  event.preventDefault();
  if (!API.isOrganizer()) return;
  const message = $('#stream-message');
  message.textContent = 'Saving…';
  try {
    const res = await fetch(`/api/streams/${streamTitle.value}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API.getToken()}` }, body: JSON.stringify({ url: $('#stream-url').value }) });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.error || 'Unable to save livestream.');
    streamLinks[result.title] = result.url;
    renderStreams();
    message.textContent = result.url ? 'Livestream published.' : 'Livestream removed.';
  } catch (error) { message.textContent = error.message || 'Unable to save livestream.'; }
};
renderStreams();
loadStreams();
if (typeof fetch !== 'undefined') setInterval(loadStreams, 5000);
