const PARTY_LIST = [
  { id: 'labour', name: 'Labour', short: 'Labour', color: '#d43f43', vote: 26.9 },
  { id: 'greens', name: 'Green', short: 'Green', color: '#23834e', vote: 11.6 },
  { id: 'maori', name: 'Te Pāti Māori', short: 'Māori', color: '#8e2936', vote: 3.1 },
  { id: 'top', name: 'The Opportunities Party', short: 'TOP', color: '#79c3e6', vote: 2.2 },
  { id: 'nzfirst', name: 'NZ First', short: 'NZ First', color: '#46515b', vote: 6.1 },
  { id: 'act', name: 'ACT', short: 'ACT', color: '#e4b82e', vote: 8.6 },
  { id: 'national', name: 'National', short: 'National', color: '#2869a8', vote: 38.1 },
  { id: 'other', name: 'Other parties', short: 'Other', color: '#89958f', vote: 3.4 },
];
const MAP_CONFIG = {
  general: {
    label: 'General', count: 64, noun: 'General electorate', codeField: 'GED2025_V1_00', nameField: 'GED2025_V1_00_NAME',
  },
  maori: {
    label: 'Māori', count: 7, noun: 'Māori electorate', codeField: 'MED2025_V1_00', nameField: 'MED2025_V1_00_NAME',
  },
};
const STORE_KEY = 'te-poti-simulator-v1';
const initialVotes = Object.fromEntries(PARTY_LIST.map((party) => [party.id, party.vote]));
let state = { mapType: 'general', selected: null, winners: {}, votes: { ...initialVotes } };
let electorates = {
  general: window.NZ_ELECTORATE_DATA?.general?.features || [],
  maori: window.NZ_ELECTORATE_DATA?.maori?.features || [],
};
let map;
let geoLayer;
let landLayer;
let searchTimer;
let toastTimer;

function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      state.winners = saved.winners && typeof saved.winners === 'object' ? saved.winners : {};
      state.votes = { ...initialVotes, ...(saved.votes || {}) };
      Object.keys(state.votes).forEach((key) => { state.votes[key] = clamp(Number(state.votes[key]) || 0, 0, 100); });
    }
  } catch (_) { /* Keep the in-memory defaults if browser storage is unavailable. */ }
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ winners: state.winners, votes: state.votes })); } catch (_) { /* Storage is optional. */ }
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function keyFor(type, code) { return `${type}:${code}`; }
function getParty(id) { return PARTY_LIST.find((party) => party.id === id); }
function rgb(hex) { const n = parseInt(hex.slice(1), 16); return `${n >> 16},${(n >> 8) & 255},${n & 255}`; }
function partyStyle(partyId, alpha = 1) {
  const party = getParty(partyId);
  return party ? `rgba(${rgb(party.color)},${alpha})` : null;
}
function currentFeatureKey(feature) {
  const cfg = MAP_CONFIG[state.mapType];
  const props = feature.properties || {};
  return keyFor(state.mapType, String(props[cfg.codeField] ?? props[ cfg.nameField] ?? ''));
}
function styleFeature(feature) {
  const partyId = state.winners[currentFeatureKey(feature)];
  const selected = state.selected && currentFeatureKey(feature) === keyFor(state.selected.type, state.selected.code);
  return {
    color: selected ? '#244b45' : '#58766e',
    weight: selected ? 2.4 : 1.3,
    opacity: .9,
    fillColor: partyStyle(partyId, partyId ? .88 : .76) || '#f5f1e6',
    fillOpacity: .96,
    lineJoin: 'round',
  };
}
function initMap() {
  if (!window.L) {
    showMapError();
    return;
  }
  document.getElementById('map').style.background = 'radial-gradient(ellipse at 25% 22%, rgba(255,255,255,.42), transparent 58%), #dce9e5';
  map = L.map('map', { zoomControl: false, scrollWheelZoom: true, minZoom: 3, maxZoom: 12, preferCanvas: true }).setView([-41.4, 173.2], 4.2);
  const land = window.NZ_LAND;
  if (land?.features?.length) {
    landLayer = L.geoJSON(land, { style: { color: '#45695e', weight: 2.2, opacity: .95, fillColor: '#d6e4d8', fillOpacity: 1, lineJoin: 'round' } }).addTo(map);
  }
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  loadMap('general');
}
async function loadMap(type, retry = false) {
  const cfg = MAP_CONFIG[type];
  const loading = document.getElementById('mapLoading');
  const error = document.getElementById('mapError');
  loading.classList.remove('hidden');
  error.classList.add('hidden');
  if (!electorates[type].length || retry) {
    try {
      const data = window.NZ_ELECTORATE_DATA?.[type];
      if (!data?.features?.length) throw new Error('Bundled boundary data is unavailable');
      electorates[type] = data.features;
    } catch (err) {
      console.error('Could not load electorate boundaries:', err);
      loading.classList.add('hidden');
      showMapError();
      return;
    }
  }
  renderLayer(type, true);
  loading.classList.add('hidden');
}
function showMapError() {
  document.getElementById('mapLoading').classList.add('hidden');
  document.getElementById('mapError').classList.remove('hidden');
}
function renderLayer(type, fit = false) {
  if (!map || !electorates[type].length) return;
  if (geoLayer) map.removeLayer(geoLayer);
  state.mapType = type;
  const cfg = MAP_CONFIG[type];
  geoLayer = L.geoJSON({ type: 'FeatureCollection', features: electorates[type] }, {
    style: styleFeature,
    onEachFeature(feature, layer) {
      const props = feature.properties || {};
      const code = String(props[cfg.codeField] ?? props[cfg.nameField] ?? '');
      const name = String(props[cfg.nameField] || 'Electorate');
      layer.bindTooltip(name, { className: 'electorate-tooltip', sticky: true, direction: 'top', opacity: .98 });
      layer.on('click', () => selectSeat({ type, code, name }));
      layer.on('mouseover', () => layer.setStyle({ weight: 2.3, color: '#456c63', fillOpacity: 1 }));
      layer.on('mouseout', () => geoLayer.resetStyle(layer));
    },
  }).addTo(map);
  document.getElementById('mapCount').textContent = `${cfg.count} electorates`;
  const tabs = document.querySelectorAll('.map-tab');
  tabs.forEach((tab) => {
    const active = tab.dataset.map === type;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  updateSelectionView();
  updateMapColors();
  populateSearchList();
  if (fit) {
    const nzBounds = L.latLngBounds([[-47.8, 165.2], [-33.8, 179.2]]);
    map.fitBounds(nzBounds, { animate: true, maxZoom: 5.4, padding: [12, 12] });
  }
  window.setTimeout(() => map.invalidateSize(), 50);
}
function updateMapColors() { if (geoLayer) geoLayer.setStyle(styleFeature); }
function selectSeat(seat) {
  state.selected = seat;
  if (seat.type !== state.mapType) {
    if (electorates[seat.type].length) renderLayer(seat.type, false);
    else switchMap(seat.type);
  }
  updateSelectionView();
  updateMapColors();
  saveState();
}
function updateSelectionView() {
  const empty = document.getElementById('emptySelection');
  const active = document.getElementById('activeSelection');
  const seatIndex = document.getElementById('seatIndex');
  if (!state.selected) {
    empty.classList.remove('hidden'); active.classList.add('hidden'); seatIndex.textContent = 'NO SEAT SELECTED'; return;
  }
  const { type, code, name } = state.selected;
  const winner = state.winners[keyFor(type, code)];
  const party = getParty(winner);
  empty.classList.add('hidden'); active.classList.remove('hidden');
  seatIndex.textContent = `${String(code).toUpperCase()} · ${type === 'maori' ? 'MĀORI' : 'GENERAL'}`;
  document.getElementById('selectedSeatName').textContent = name;
  document.getElementById('selectedSeatType').textContent = MAP_CONFIG[type].noun;
  const dot = document.getElementById('selectedSeatDot');
  dot.style.background = party ? party.color : '#e7eeeb';
  dot.style.borderColor = party ? party.color : '#b5c4bd';
  document.getElementById('partyChoices').innerHTML = PARTY_LIST.map((item) => {
    const chosen = item.id === winner;
    return `<button type="button" class="party-choice${chosen ? ' selected' : ''}" style="--party-color:${item.color};--party-soft:rgba(${rgb(item.color)},.09)" data-party="${item.id}" aria-pressed="${chosen}"><span class="party-swatch"></span><span>${item.name}</span>${chosen ? '<span class="choice-check">✓</span>' : ''}</button>`;
  }).join('');
  document.querySelectorAll('.party-choice').forEach((button) => button.addEventListener('click', () => assignSeat(button.dataset.party)));
}
function assignSeat(partyId) {
  if (!state.selected || !getParty(partyId)) return;
  state.winners[keyFor(state.selected.type, state.selected.code)] = partyId;
  updateSelectionView(); updateMapColors(); updateResults(); saveState();
}
function clearSelectedSeat() {
  if (!state.selected) return;
  delete state.winners[keyFor(state.selected.type, state.selected.code)];
  updateSelectionView(); updateMapColors(); updateResults(); saveState();
}
function voteSum() { return PARTY_LIST.reduce((sum, party) => sum + Number(state.votes[party.id] || 0), 0); }
function electorateCounts() {
  const counts = Object.fromEntries(PARTY_LIST.map((party) => [party.id, 0]));
  Object.values(state.winners).forEach((partyId) => { if (counts[partyId] !== undefined) counts[partyId] += 1; });
  return counts;
}
function electorateNamesByParty() {
  const names = Object.fromEntries(PARTY_LIST.map((party) => [party.id, []]));
  Object.entries(state.winners).forEach(([key, partyId]) => {
    if (!names[partyId]) return;
    const separator = key.indexOf(':');
    if (separator < 0) return;
    const type = key.slice(0, separator);
    const code = key.slice(separator + 1);
    const cfg = MAP_CONFIG[type];
    if (!cfg) return;
    const feature = electorates[type].find((item) => String(item.properties?.[cfg.codeField]) === code);
    names[partyId].push(String(feature?.properties?.[cfg.nameField] || code));
  });
  Object.values(names).forEach((partyNames) => partyNames.sort((a, b) => a.localeCompare(b, 'en-NZ')));
  return names;
}
function sainteLagueShares() {
  const totalVotes = voteSum();
  const qualified = PARTY_LIST.filter((party) => {
    const share = totalVotes > 0 ? (Number(state.votes[party.id] || 0) / totalVotes) * 100 : 0;
    return share >= 5;
  });
  const allocated = Object.fromEntries(PARTY_LIST.map((party) => [party.id, 0]));
  if (!qualified.length) return allocated;
  for (let seat = 0; seat < 120; seat += 1) {
    let best = qualified[0]; let bestQuotient = -1;
    qualified.forEach((party) => {
      const share = totalVotes > 0 ? Number(state.votes[party.id] || 0) / totalVotes : 0;
      const quotient = share / (2 * allocated[party.id] + 1);
      if (quotient > bestQuotient) { best = party; bestQuotient = quotient; }
    });
    allocated[best.id] += 1;
  }
  return allocated;
}
function updateResults() {
  const votesTotal = voteSum();
  const voteTotal = document.getElementById('voteTotal');
  voteTotal.textContent = `${votesTotal.toFixed(votesTotal % 1 ? 1 : 0)}%`;
  voteTotal.classList.toggle('invalid', votesTotal <= 0);
  const electorate = electorateCounts();
  const electorateNames = electorateNamesByParty();
  const entitlements = sainteLagueShares();
  const rows = PARTY_LIST.map((party) => {
    const electorateSeats = electorate[party.id];
    const partyVoteSeats = entitlements[party.id] || 0;
    const overhangSeats = Math.max(0, electorateSeats - partyVoteSeats);
    const listSeats = Math.max(0, partyVoteSeats - electorateSeats);
    const totalSeats = partyVoteSeats + overhangSeats;
    const eligible = partyVoteSeats > 0 || electorateSeats > 0;
    return { ...party, electorateSeats, electorateNames: electorateNames[party.id], partyVoteSeats, listSeats, overhangSeats, totalSeats, eligible };
  }).filter((party) => party.eligible || party.electorateSeats > 0);
  const overhang = rows.reduce((sum, party) => sum + party.overhangSeats, 0);
  const totalHouse = 120 + overhang;
  const assignedElectorates = Object.values(electorate).reduce((sum, count) => sum + count, 0);
  const partyVoteTotal = rows.reduce((sum, party) => sum + party.partyVoteSeats, 0);
  const listTotal = rows.reduce((sum, party) => sum + party.listSeats, 0);
  document.getElementById('houseTotal').textContent = totalHouse;
  const majority = Math.floor(totalHouse / 2) + 1;
  document.getElementById('majorityMark').textContent = majority;
  const majorityLine = document.getElementById('majorityLine');
  majorityLine.style.left = `${(majority / totalHouse) * 100}%`;
  majorityLine.dataset.label = `${majority} · MAJORITY`;
  document.getElementById('overhangValue').textContent = `+${overhang}`;
  document.getElementById('seatRows').innerHTML = rows.map((party) => `<tr><td><span class="party-name-cell" style="--party-color:${party.color}"><i class="table-swatch"></i>${party.name}</span></td><td>${party.electorateSeats}</td><td>${party.partyVoteSeats}</td><td>${party.listSeats}</td><td class="party-seat-count">${party.totalSeats}${party.overhangSeats ? `<small class="row-overhang">+${party.overhangSeats}</small>` : ''}</td></tr>`).join('');
  document.getElementById('seatFoot').innerHTML = `<tr><td>Parliament total</td><td>${assignedElectorates}</td><td>${partyVoteTotal}</td><td>${listTotal}</td><td>${totalHouse}</td></tr>`;
  const barRows = rows.filter((party) => party.totalSeats > 0);
  document.getElementById('seatBar').innerHTML = barRows.map((party) => `<span class="seat-segment" style="width:${(party.totalSeats / totalHouse) * 100}%;background:${party.color}" title="${party.name}: ${party.totalSeats} seats"></span>`).join('');
  document.getElementById('seatBarLegend').innerHTML = barRows.map((party) => `<span class="bar-label" style="--party-color:${party.color}"><i></i>${party.short} ${party.totalSeats}</span>`).join('') || '<span class="bar-label">Enter party vote shares to see seat allocation.</span>';
  renderChamber(rows, overhang, totalHouse);
}
function renderChamber(rows, overhang, totalHouse) {
  const svg = document.getElementById('chamberMap');
  const rowCounts = [11, 14, 18, 22, 25, 30];
  const radii = [120, 153, 186, 219, 252, 285];
  const centerX = 370;
  const centerY = 350;
  const positions = [];
  rowCounts.forEach((count, row) => {
    for (let index = 0; index < count; index += 1) {
      const progress = index / (count - 1);
      const angle = (180 + 180 * progress) * Math.PI / 180;
      positions.push({
        x: centerX + radii[row] * Math.cos(angle),
        y: centerY + radii[row] * Math.sin(angle),
        progress,
        radius: radii[row],
      });
    }
  });
  positions.sort((a, b) => a.progress - b.progress || b.radius - a.radius);

  const seatParties = rows.flatMap((party) => Array(party.partyVoteSeats).fill(party));
  while (seatParties.length < 120) seatParties.push(null);
  const baseDots = [];
  const partySeatNumbers = Object.fromEntries(rows.map((party) => [party.id, 0]));
  positions.forEach((point, index) => {
    const party = seatParties[index];
    if (!party) {
      baseDots.push(`<circle class="chamber-seat unallocated" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="10.5"><title>Party-vote seat not yet allocated</title></circle>`);
      return;
    }
    partySeatNumbers[party.id] += 1;
    const electorateName = party.electorateNames[partySeatNumbers[party.id] - 1];
    const seatLabel = electorateName ? `${electorateName} electorate MP` : 'List MP';
    baseDots.push(`<circle class="chamber-seat" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="10.5" fill="${party.color}"><title>${seatLabel}</title></circle>`);
  });

  const overhangRows = rows.filter((party) => party.overhangSeats > 0);
  const extraDots = [];
  let extraIndex = 0;
  const maxColumns = 24;
  overhangRows.forEach((party) => {
    for (let index = 0; index < party.overhangSeats; index += 1) {
      const row = Math.floor(extraIndex / maxColumns);
      const col = extraIndex % maxColumns;
      const rowCount = Math.min(maxColumns, overhang - row * maxColumns);
      const spacing = 26;
      const x = centerX + (col - (rowCount - 1) / 2) * spacing;
      const y = 447 + row * 27;
      const electorateName = party.electorateNames[party.partyVoteSeats + index];
      const seatLabel = electorateName ? `${electorateName} electorate MP · overhang` : `${party.name} overhang MP`;
      extraDots.push(`<circle class="chamber-seat overhang-seat" cx="${x.toFixed(2)}" cy="${y}" r="10.5" fill="${party.color}"><title>${seatLabel}</title></circle>`);
      extraIndex += 1;
    }
  });
  const height = overhang ? 470 + Math.ceil(overhang / maxColumns) * 27 : 440;
  svg.setAttribute('viewBox', `0 0 740 ${height}`);
  svg.setAttribute('aria-label', `Semicircular Parliament seat map: 120 base seats and ${overhang} overhang ${overhang === 1 ? 'seat' : 'seats'}`);
  const majority = Math.floor(totalHouse / 2) + 1;
  svg.innerHTML = `${baseDots.join('')}<g class="chamber-center-label"><text x="370" y="300" text-anchor="middle">PARLIAMENT</text><text x="370" y="323" text-anchor="middle">120 BASE SEATS</text><text x="370" y="346" text-anchor="middle">MAJORITY ${majority}</text></g>${overhang ? `<line class="overhang-divider" x1="120" x2="620" y1="400" y2="400"></line><text class="overhang-label-svg" x="370" y="418" text-anchor="middle">OVERHANG - ${overhang} EXTRA ${overhang === 1 ? 'SEAT' : 'SEATS'}</text>${extraDots.join('')}` : '<text class="no-overhang-svg" x="370" y="418" text-anchor="middle">NO OVERHANG IN THIS SCENARIO</text>'}`;
  document.getElementById('chamberBaseTotal').textContent = `${partySeatTotal(rows)} base seats`;
  document.getElementById('chamberOverhangTotal').textContent = `+${overhang} overhang`;
  document.getElementById('chamberLegend').innerHTML = rows.filter((party) => party.totalSeats > 0).map((party) => `<span class="chamber-legend-item"><i style="--party-color:${party.color}"></i><span>${party.short}</span><strong>${party.totalSeats}</strong></span>`).join('');
}
function partySeatTotal(rows) { return rows.reduce((sum, party) => sum + party.partyVoteSeats, 0); }
function renderVoteFields() {
  const inputHost = document.getElementById('voteInputs');
  inputHost.innerHTML = PARTY_LIST.map((party) => `<label class="vote-item" for="vote-${party.id}"><span class="vote-party" style="--party-color:${party.color}"><i class="vote-swatch"></i><span>${party.name}</span></span><input id="vote-${party.id}" class="vote-field" type="number" min="0" max="100" step="0.1" value="${Number(state.votes[party.id]).toFixed(1)}" aria-label="${party.name} party vote percentage"><span class="vote-percent">%</span></label>`).join('');
  document.querySelectorAll('.vote-field').forEach((field) => {
    const partyId = field.id.replace('vote-', '');
    field.addEventListener('input', () => {
      state.votes[partyId] = clamp(Number(field.value) || 0, 0, 100);
      updateResults(); saveState();
    });
    field.addEventListener('change', () => {
      field.value = Number(state.votes[partyId]).toFixed(1);
      updateResults(); saveState();
    });
  });
  updateResults();
}
function populateSearchList() {
  const cfg = MAP_CONFIG[state.mapType];
  const search = document.getElementById('seatSearch');
  const listId = 'electorateSuggestions';
  let list = document.getElementById(listId);
  if (!list) { list = document.createElement('datalist'); list.id = listId; document.body.appendChild(list); search.setAttribute('list', listId); }
  list.innerHTML = electorates[state.mapType].map((feature) => `<option value="${String(feature.properties?.[cfg.nameField] || '').replaceAll('"', '&quot;')}"></option>`).join('');
}
function focusSearchResult() {
  const query = document.getElementById('seatSearch').value.trim().toLocaleLowerCase();
  if (!query) return;
  const cfg = MAP_CONFIG[state.mapType];
  const feature = electorates[state.mapType].find((item) => String(item.properties?.[cfg.nameField] || '').toLocaleLowerCase() === query)
    || electorates[state.mapType].find((item) => String(item.properties?.[cfg.nameField] || '').toLocaleLowerCase().includes(query));
  if (!feature) { showToast('No matching electorate on this map'); return; }
  const name = String(feature.properties[cfg.nameField]);
  const code = String(feature.properties[cfg.codeField] ?? name);
  const target = geoLayer?.getLayers().find((layer) => String(layer.feature.properties?.[cfg.nameField]) === name);
  if (target) { map.fitBounds(target.getBounds().pad(.45), { maxZoom: 9, animate: true }); selectSeat({ type: state.mapType, code, name }); }
  document.getElementById('seatSearch').value = name;
}
function switchMap(type) {
  if (state.selected && state.selected.type !== type) state.selected = null;
  state.mapType = type;
  updateSelectionView();
  const loading = document.getElementById('mapLoading');
  loading.classList.remove('hidden');
  loadMap(type);
}
function showToast(message) {
  const toast = document.getElementById('toast'); toast.textContent = message; toast.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
}
function clearCurrentMap() {
  const prefix = `${state.mapType}:`;
  Object.keys(state.winners).filter((key) => key.startsWith(prefix)).forEach((key) => delete state.winners[key]);
  if (state.selected?.type === state.mapType) state.selected = null;
  updateSelectionView(); updateMapColors(); updateResults(); saveState(); showToast(`${MAP_CONFIG[state.mapType].label} electorate assignments cleared`);
}
function resetScenario() {
  state.winners = {}; state.selected = null; state.votes = { ...initialVotes };
  updateSelectionView(); updateMapColors(); updateResults(); saveState();
  document.querySelectorAll('.vote-field').forEach((field) => { field.value = Number(state.votes[field.id.replace('vote-', '')]).toFixed(1); });
  document.getElementById('seatSearch').value = '';
  showToast('Scenario reset to the illustrative starting split');
}
function connectUI() {
  document.querySelectorAll('.map-tab').forEach((tab) => tab.addEventListener('click', () => switchMap(tab.dataset.map)));
  document.getElementById('seatSearch').addEventListener('change', focusSearchResult);
  document.getElementById('seatSearch').addEventListener('keydown', (event) => { if (event.key === 'Enter') focusSearchResult(); });
  document.getElementById('clearSeatButton').addEventListener('click', clearSelectedSeat);
  document.getElementById('clearMapButton').addEventListener('click', clearCurrentMap);
  document.getElementById('resetButton').addEventListener('click', resetScenario);
  document.getElementById('retryMap').addEventListener('click', () => loadMap(state.mapType, true));
}
readState(); connectUI(); renderVoteFields(); initMap();
