// AYT TMA Radarless Approach Calculator
// Hardcoded speed: 5 NM / 1 minute (300 kt GS)

const SPEED_NM_PER_MIN = 5;

const WAYPOINTS = [
  {
    id: "DERYA",
    name: "DERYA",
    entryWpt: "TOMBİ",
    airway: "VA-16",
    radial: "R-170",
    fl: "FL070",
    msa: "3,000' / 12,000'",
    straightInRwy: "36",
  },
  {
    id: "KUMRU",
    name: "KUMRU",
    entryWpt: "KFK",
    airway: "VA-16",
    radial: "R-350",
    fl: "FL120",
    msa: "10,000' / 9,000'",
    straightInRwy: "18",
  },
  {
    id: "BRONZ",
    name: "BRONZ",
    entryWpt: "CRD",
    airway: "R-55",
    radial: "R-310",
    fl: "FL110",
    msa: "10,000'",
    straightInRwy: null,
  },
  {
    id: "ALPAY",
    name: "ALPAY",
    entryWpt: "W-79",
    airway: "W-79",
    radial: "R-270",
    fl: "FL120",
    msa: "10,000' / 12,000'",
    straightInRwy: null,
  },
  {
    id: "DAMLA",
    name: "DAMLA",
    entryWpt: "HİSAR",
    airway: "W-77",
    radial: "R-030",
    fl: "FL130",
    msa: "9,000'",
    straightInRwy: null,
  },
  {
    id: "KONAK",
    name: "KONAK",
    entryWpt: "MUT",
    airway: "R-55",
    radial: "R-090",
    fl: "FL130",
    msa: "9,000' / 3,000'",
    straightInRwy: null,
  },
  {
    id: "MANAV",
    name: "MANAV",
    entryWpt: "DOREN",
    airway: "W-83",
    radial: "R-130",
    fl: "FL070",
    msa: "3,000'",
    straightInRwy: null,
  },
];

// Application State
const state = {
  activeRwy: "36",
  flightType: "ARR", // 'ARR' | 'DEP'
  selectedWpt: "BRONZ",
  selectedDist: 60,
  inputTimeRaw: "00",
  inputCallsign: "",
  approachMode: "auto", // 'auto' | 'normal' | 'straight'
  lookupTimeRaw: "10",
  aircraftList: [],
  nextId: 1,
};

function loadSavedState() {
  try {
    const saved = localStorage.getItem("ayt_radarsiz_state_v2");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.activeRwy) state.activeRwy = parsed.activeRwy;
      if (Array.isArray(parsed.aircraftList)) {
        state.aircraftList = parsed.aircraftList.map((a) => ({
          ...a,
          type: a.type || "ARR",
        }));
      }
      if (typeof parsed.nextId === "number") state.nextId = parsed.nextId;
    }
  } catch (err) {
    console.warn("Could not load state from localStorage:", err);
  }
}

function saveState() {
  try {
    localStorage.setItem(
      "ayt_radarsiz_state_v2",
      JSON.stringify({
        activeRwy: state.activeRwy,
        aircraftList: state.aircraftList,
        nextId: state.nextId,
      })
    );
  } catch (err) {
    console.warn("Could not save state:", err);
  }
}

// Parse flexible time input: "0", "5", "05", ":05", "10:05", "9:30", "1005"
function parseTimeInput(rawStr) {
  const s = String(rawStr ?? "").trim();
  if (!s) {
    return { valid: true, hasHour: false, totalMinutes: 0 };
  }

  if (s.startsWith(":")) {
    const m = parseFloat(s.slice(1));
    if (!Number.isNaN(m)) {
      return { valid: true, hasHour: false, totalMinutes: m };
    }
  }

  if (s.includes(":")) {
    const parts = s.split(":");
    const hh = parseInt(parts[0], 10);
    const mm = parseFloat(parts[1]);
    if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
      return {
        valid: true,
        hasHour: true,
        totalMinutes: hh * 60 + mm,
      };
    }
  }

  const digitsOnly = /^\d{3,4}$/.test(s);
  const num = parseFloat(s);
  if (!Number.isNaN(num)) {
    if (digitsOnly && num >= 100) {
      const hh = Math.floor(num / 100);
      const mm = num % 100;
      return {
        valid: true,
        hasHour: true,
        totalMinutes: hh * 60 + mm,
      };
    }
    return {
      valid: true,
      hasHour: false,
      totalMinutes: num,
    };
  }

  return { valid: false, hasHour: false, totalMinutes: 0 };
}

// Format minutes value into clean time string
function formatTime(totalMins, hasHour = false) {
  if (totalMins === null || totalMins === undefined || Number.isNaN(totalMins)) {
    return "—";
  }

  const totalSeconds = Math.round(totalMins * 60);
  const sign = totalSeconds < 0 ? "-" : "";
  const absSeconds = Math.abs(totalSeconds);
  const wholeMins = Math.floor(absSeconds / 60);
  const secs = absSeconds % 60;
  const secSuffix = secs > 0 ? `:${String(secs).padStart(2, "0")}` : "";

  if (hasHour) {
    const hh = Math.floor(wholeMins / 60) % 24;
    const mm = wholeMins % 60;
    return `${sign}${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}${secSuffix}`;
  } else {
    if (wholeMins >= 60) {
      const modMm = wholeMins % 60;
      return `:${String(modMm).padStart(2, "0")}${secSuffix} (${wholeMins}')`;
    }
    return `${sign}:${String(wholeMins).padStart(2, "0")}${secSuffix}`;
  }
}

function isAircraftStraightIn(wptId, mode, activeRwy) {
  if (mode === "straight") return true;
  if (mode === "normal") return false;
  if (activeRwy === "36" && wptId === "DERYA") return true;
  if (activeRwy === "18" && wptId === "KUMRU") return true;
  return false;
}

// Arrival Checkpoints Calculation
// Manual delay (holdMins) ONLY shifts 10 DME Fix and Established time, keeping 10 NM unchanged
function calculateArrivalCheckpoints({ wptId, dist, timeRaw, mode, holdMins = 0 }, activeRwy) {
  const parsedTime = parseTimeInput(timeRaw);
  const tInit = parsedTime.totalMinutes;
  const hasHour = parsedTime.hasHour;
  const straightIn = isAircraftStraightIn(wptId, mode, activeRwy);
  const d = Number(dist) || 60;
  const hold = Number(holdMins) || 0;

  const deltaTo25 = d >= 25 ? (d - 25) / SPEED_NM_PER_MIN : null;
  const deltaTo10 = d >= 10 ? (d - 10) / SPEED_NM_PER_MIN : 0;

  const t25 = deltaTo25 !== null ? tInit + deltaTo25 : null;
  const t10 = tInit + deltaTo10;
  const tRadialZero = tInit + d / SPEED_NM_PER_MIN;

  let tVor = null;
  let tFix = null;
  let tEst = null;
  let tClear = null;

  if (straightIn) {
    tClear = t25 !== null ? t25 : tInit;
    tEst = t10 + hold;
  } else {
    tClear = t10;
    tVor = t10 + 2;
    tFix = tVor + 2 + hold;
    tEst = tFix + 5;
  }

  return {
    wptId,
    dist: d,
    hasHour,
    straightIn,
    holdMins: hold,
    tInit,
    t25,
    t10,
    tVor,
    tFix,
    tEst,
    tClear,
    tRadialZero,
  };
}

// Departure Checkpoints Calculation (Starts at 0 NM at depTime, flies outbound at 5 NM / 1 min)
function calculateDepartureCheckpoints({ wptId, timeRaw }) {
  const parsedTime = parseTimeInput(timeRaw);
  const tDep = parsedTime.totalMinutes;
  const hasHour = parsedTime.hasHour;

  return {
    wptId,
    hasHour,
    tDep,
    t10: tDep + 10 / SPEED_NM_PER_MIN,
    t25: tDep + 25 / SPEED_NM_PER_MIN,
    t50: tDep + 50 / SPEED_NM_PER_MIN,
    t60: tDep + 60 / SPEED_NM_PER_MIN,
  };
}

function getReferenceBaseHour(items) {
  for (const item of items) {
    const p = parseTimeInput(item.timeRaw);
    if (p.hasHour) {
      return Math.floor(p.totalMinutes / 60);
    }
  }
  return null;
}

function normalizeTime(mins, hasHour, refHour) {
  if (!hasHour && refHour !== null && mins < 120) {
    return refHour * 60 + mins;
  }
  return mins;
}

// Compute "Will Delay?" for all arriving aircraft
function computeArrivalDelays(computedArrivals, refHour) {
  const list = computedArrivals.map((item) => {
    const normClear = normalizeTime(item.calc.tClear, item.calc.hasHour, refHour);
    const normEst = normalizeTime(item.calc.tEst, item.calc.hasHour, refHour);
    return {
      ...item,
      normClear,
      normEst,
    };
  });

  const sorted = [...list].sort((a, b) => {
    if (a.normClear !== b.normClear) return a.normClear - b.normClear;
    return a.acft.id - b.acft.id;
  });

  const delayMap = new Map();

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const blockers = [];

    for (let j = 0; j < i; j++) {
      const earlier = sorted[j];
      if (earlier.normClear <= current.normClear && current.normClear < earlier.normEst) {
        blockers.push(earlier);
      }
    }

    delayMap.set(current.acft.id, {
      willDelay: blockers.length > 0,
      blockers,
    });
  }

  return delayMap;
}

// Compute Head-On Conflicts between Departing and Arriving Aircraft on the same Waypoint
function computeDepArrConflicts(computedArrivals, computedDepartures, refHour) {
  const conflicts = [];

  computedDepartures.forEach((depItem) => {
    const matchingArrivals = computedArrivals.filter(
      (arrItem) => arrItem.acft.wptId === depItem.acft.wptId
    );

    matchingArrivals.forEach((arrItem) => {
      const useHasHour = depItem.calc.hasHour || arrItem.calc.hasHour;
      const tDepNorm = normalizeTime(depItem.calc.tDep, depItem.calc.hasHour, refHour);
      const tArrZeroNorm = normalizeTime(arrItem.calc.tRadialZero, arrItem.calc.hasHour, refHour);

      const tCrossNorm = (tDepNorm + tArrZeroNorm) / 2;
      const dCross = SPEED_NM_PER_MIN * (tCrossNorm - tDepNorm);

      const displayTime = formatTime(
        useHasHour ? tCrossNorm : tCrossNorm - (refHour ? refHour * 60 : 0),
        useHasHour
      );

      const dCrossRounded = +dCross.toFixed(1);
      const isValidInboundConflict = dCross >= 0 && dCross <= Math.max(arrItem.calc.dist, 60);

      conflicts.push({
        depAcft: depItem.acft,
        arrAcft: arrItem.acft,
        wpt: depItem.wpt,
        tCrossNorm,
        displayTime,
        dCross: dCrossRounded,
        isValidInboundConflict,
        tDepFormatted: formatTime(depItem.calc.tDep, depItem.calc.hasHour),
        tArrZeroFormatted: formatTime(arrItem.calc.tRadialZero, arrItem.calc.hasHour),
        tArrInitFormatted: formatTime(arrItem.calc.tInit, arrItem.calc.hasHour),
        arrDist: arrItem.calc.dist,
      });
    });
  });

  return conflicts;
}

function estimatePositionAtTime(item, queryMins) {
  if (item.acft.type === "DEP") {
    const { tDep } = item.calc;
    if (queryMins < tDep) {
      const wait = +(tDep - queryMins).toFixed(1);
      return {
        text: `On ground (Departs 0 NM in ${wait}m)`,
        color: "var(--text-muted)",
      };
    }
    const elapsed = queryMins - tDep;
    const dme = +(elapsed * SPEED_NM_PER_MIN).toFixed(1);
    return {
      text: `${dme} NM outbound on ${item.wpt.name} (${item.wpt.entryWpt})`,
      color: "var(--accent-amber)",
    };
  }

  const { dist: d, tInit, t10, tVor, tFix, tEst, straightIn, holdMins } = item.calc;

  if (queryMins < tInit) {
    const wait = +(tInit - queryMins).toFixed(1);
    return {
      text: `Not yet reported (reports ${d} NM in ${wait}m)`,
      color: "var(--text-muted)",
    };
  }

  if (straightIn) {
    const tEffective10 = t10 + holdMins;
    if (queryMins < tEffective10) {
      const elapsed = Math.max(0, queryMins - tInit - holdMins);
      const currentDme = Math.max(10, +(d - elapsed * SPEED_NM_PER_MIN).toFixed(1));
      return {
        text: `${currentDme} NM inbound on ${item.wpt.name} (Straight-In)`,
        color: "var(--accent-purple)",
      };
    }
    if (Math.abs(queryMins - tEst) < 0.05) {
      return {
        text: `10 NM — Established (${item.wpt.name})`,
        color: "var(--accent-green)",
      };
    }
    const afterEst = +(queryMins - tEst).toFixed(1);
    return {
      text: `Established ${afterEst}m ago`,
      color: "var(--text-muted)",
    };
  }

  if (queryMins <= tVor) {
    const elapsed = queryMins - tInit;
    const currentDme = Math.max(0, +(d - elapsed * SPEED_NM_PER_MIN).toFixed(1));
    return {
      text: `${currentDme} NM inbound on ${item.wpt.name}`,
      color: "var(--accent-blue)",
    };
  }

  const tArriveFix = tVor + 2;
  if (queryMins <= tArriveFix) {
    const outboundElapsed = queryMins - tVor;
    const outboundDme = +(outboundElapsed * SPEED_NM_PER_MIN).toFixed(1);
    return {
      text: `${outboundDme} NM outbound (AYT VOR → 10 DME FIX)`,
      color: "var(--accent-amber)",
    };
  }

  if (queryMins <= tFix) {
    const remHold = +(tFix - queryMins).toFixed(1);
    return {
      text: `Delay/Hold at 10 DME FIX (${remHold}m left)`,
      color: "var(--accent-amber)",
    };
  }

  if (queryMins < tEst) {
    const remTurn = +(tEst - queryMins).toFixed(1);
    return {
      text: `In 5-min ILS turn (${remTurn}m to Established)`,
      color: "var(--accent-purple)",
    };
  }

  if (Math.abs(queryMins - tEst) < 0.05) {
    return {
      text: `ESTABLISHED`,
      color: "var(--accent-green)",
    };
  }

  const afterEst = +(queryMins - tEst).toFixed(1);
  return {
    text: `Established ${afterEst}m ago`,
    color: "var(--text-muted)",
  };
}

// Render Waypoint Buttons (with TMA Waypoint + Entry Fix e.g. KUMRU / KFK)
function renderWaypointGrid() {
  const container = document.getElementById("wptGrid");
  container.innerHTML = "";

  WAYPOINTS.forEach((wpt) => {
    const isStraightForCurrentRwy =
      state.flightType === "ARR" && wpt.straightInRwy === state.activeRwy;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `wpt-btn ${state.selectedWpt === wpt.id ? "active" : ""} ${
      isStraightForCurrentRwy ? "straight-in-capable" : ""
    }`;

    btn.innerHTML = `
      <div class="wpt-name">
        <span>${wpt.name}</span>
        <span class="wpt-entry-badge">${wpt.entryWpt}</span>
      </div>
      <div class="wpt-meta">
        <span>${wpt.airway} • ${wpt.radial} • ${wpt.fl}</span>
        ${isStraightForCurrentRwy ? `<span class="wpt-tag">STR-IN</span>` : ""}
      </div>
    `;

    btn.addEventListener("click", () => {
      state.selectedWpt = wpt.id;
      renderWaypointGrid();
      syncSvgChartSelection();
      renderLivePreview();
    });

    container.appendChild(btn);
  });

  syncSvgChartSelection();
}

function syncSvgChartSelection() {
  document.querySelectorAll(".chart-corridor").forEach((el) => {
    const wpt = el.getAttribute("data-wpt");
    el.classList.toggle("active-corridor", wpt === state.selectedWpt);
  });
}

// Render Live Instant Preview inside the top calculator card
function renderLivePreview() {
  const previewEl = document.getElementById("livePreview");
  const wptObj = WAYPOINTS.find((w) => w.id === state.selectedWpt) || WAYPOINTS[0];
  const callsignLabel = state.inputCallsign.trim()
    ? state.inputCallsign.trim().toUpperCase()
    : state.flightType === "DEP"
    ? "DEP PREVIEW"
    : "ARR PREVIEW";

  if (state.flightType === "DEP") {
    const depCalc = calculateDepartureCheckpoints({
      wptId: state.selectedWpt,
      timeRaw: state.inputTimeRaw,
    });

    previewEl.innerHTML = `
      <div class="preview-header">
        <div class="preview-title">
          <span class="badge badge-dep">🛫 OUTBOUND DEPARTURE</span>
          <span><strong>${callsignLabel}</strong> → <strong>${wptObj.name} (${wptObj.entryWpt})</strong> • ${wptObj.airway} • ${wptObj.radial}</span>
        </div>
        <span class="step-delta">Starts at 0 NM (AYT) • 5 NM / 1 min</span>
      </div>
      <div class="preview-steps dep-steps">
        <div class="step-box">
          <div class="step-label"><span>0 NM (DEP)</span> <span class="step-delta">+0m</span></div>
          <div class="step-time">${formatTime(depCalc.tDep, depCalc.hasHour)}</div>
        </div>
        <div class="step-box">
          <div class="step-label"><span>10 NM</span> <span class="step-delta">+2m</span></div>
          <div class="step-time">${formatTime(depCalc.t10, depCalc.hasHour)}</div>
        </div>
        <div class="step-box">
          <div class="step-label"><span>25 NM</span> <span class="step-delta">+5m</span></div>
          <div class="step-time">${formatTime(depCalc.t25, depCalc.hasHour)}</div>
        </div>
        <div class="step-box">
          <div class="step-label"><span>50 NM</span> <span class="step-delta">+10m</span></div>
          <div class="step-time">${formatTime(depCalc.t50, depCalc.hasHour)}</div>
        </div>
        <div class="step-box">
          <div class="step-label"><span>60 NM</span> <span class="step-delta">+12m</span></div>
          <div class="step-time">${formatTime(depCalc.t60, depCalc.hasHour)}</div>
        </div>
      </div>
    `;
    return;
  }

  const calc = calculateArrivalCheckpoints(
    {
      wptId: state.selectedWpt,
      dist: state.selectedDist,
      timeRaw: state.inputTimeRaw,
      mode: state.approachMode,
      holdMins: 0,
    },
    state.activeRwy
  );

  previewEl.innerHTML = `
    <div class="preview-header">
      <div class="preview-title">
        <span class="badge ${calc.straightIn ? "badge-straight" : "badge-normal"}">
          ${calc.straightIn ? `⚡ STRAIGHT-IN (RWY ${state.activeRwy})` : `📐 NORMAL (RWY ${state.activeRwy})`}
        </span>
        <span><strong>${callsignLabel}</strong> via <strong>${wptObj.name} (${wptObj.entryWpt})</strong> • ${wptObj.airway} • ${wptObj.radial} • ${wptObj.fl}</span>
      </div>
      <span class="step-delta">Total to Established: <strong>+${calc.tEst - calc.tInit} min</strong></span>
    </div>
    <div class="preview-steps">
      <div class="step-box">
        <div class="step-label"><span>INITIAL (${calc.dist} NM)</span></div>
        <div class="step-time">${formatTime(calc.tInit, calc.hasHour)}</div>
      </div>
      <div class="step-box">
        <div class="step-label"><span>25 NM</span></div>
        <div class="step-time">${formatTime(calc.t25, calc.hasHour)}</div>
      </div>
      <div class="step-box">
        <div class="step-label"><span>10 NM</span></div>
        <div class="step-time">${formatTime(calc.t10, calc.hasHour)}</div>
      </div>
      <div class="step-box ${calc.straightIn ? "step-bypassed" : ""}">
        <div class="step-label"><span>AYT VOR</span></div>
        <div class="step-time">${calc.straightIn ? "—" : formatTime(calc.tVor, calc.hasHour)}</div>
      </div>
      <div class="step-box ${calc.straightIn ? "step-bypassed" : ""}">
        <div class="step-label"><span>10 DME FIX</span></div>
        <div class="step-time">${calc.straightIn ? "—" : formatTime(calc.tFix, calc.hasHour)}</div>
      </div>
      <div class="step-box">
        <div class="step-label"><span>ESTABLISHED</span></div>
        <div class="step-time">${formatTime(calc.tEst, calc.hasHour)}</div>
      </div>
    </div>
  `;
}

// Helper to build <option> list for inline waypoint <select>
function buildWaypointOptionsHtml(selectedWptId) {
  return WAYPOINTS.map(
    (w) =>
      `<option value="${w.id}" ${w.id === selectedWptId ? "selected" : ""}>${w.name} (${w.entryWpt})</option>`
  ).join("");
}

// Update all calculated cells in-place without destroying focused input elements
function refreshCalculatedValuesOnly() {
  const refHour = getReferenceBaseHour(state.aircraftList);
  const arrivals = state.aircraftList.filter((a) => a.type !== "DEP");
  const departures = state.aircraftList.filter((a) => a.type === "DEP");

  const computedArrivals = arrivals.map((acft) => ({
    acft,
    wpt: WAYPOINTS.find((w) => w.id === acft.wptId) || WAYPOINTS[0],
    calc: calculateArrivalCheckpoints(acft, state.activeRwy),
  }));

  const computedDepartures = departures.map((acft) => ({
    acft,
    wpt: WAYPOINTS.find((w) => w.id === acft.wptId) || WAYPOINTS[0],
    calc: calculateDepartureCheckpoints(acft),
  }));

  const delayMap = computeArrivalDelays(computedArrivals, refHour);

  // Update each Arrival row's calculated cells in-place
  computedArrivals.forEach(({ acft, calc }) => {
    const tr = document.querySelector(`tr[data-row-id="${acft.id}"]`);
    if (!tr) return;

    const delayInfo = delayMap.get(acft.id) || { willDelay: false };
    const modeBtn = tr.querySelector("[data-toggle-mode]");
    if (modeBtn) {
      modeBtn.className = `badge ${calc.straightIn ? "badge-straight" : "badge-normal"}`;
      modeBtn.textContent = calc.straightIn ? "STRAIGHT-IN" : "NORMAL";
    }

    const cell25 = tr.querySelector('[data-col="t25"]');
    const cell10 = tr.querySelector('[data-col="t10"]');
    const cellVor = tr.querySelector('[data-col="tVor"]');
    const cellFix = tr.querySelector('[data-col="tFix"]');
    const cellEst = tr.querySelector('[data-col="tEst"]');
    const cellDelayStatus = tr.querySelector('[data-col="willDelay"]');

    if (cell25) cell25.textContent = formatTime(calc.t25, calc.hasHour);
    if (cell10) cell10.textContent = formatTime(calc.t10, calc.hasHour);
    if (cellVor) {
      cellVor.innerHTML = calc.straightIn
        ? `<span style="color:var(--text-muted)">—</span>`
        : formatTime(calc.tVor, calc.hasHour);
    }
    if (cellFix) {
      cellFix.innerHTML = calc.straightIn
        ? `<span style="color:var(--text-muted)">—</span>`
        : formatTime(calc.tFix, calc.hasHour);
    }
    if (cellEst) cellEst.textContent = formatTime(calc.tEst, calc.hasHour);
    if (cellDelayStatus) {
      cellDelayStatus.innerHTML = `
        <span class="badge ${delayInfo.willDelay ? "badge-delayed" : "badge-nodelay"}">
          ${delayInfo.willDelay ? "DELAYED" : "NO DELAY"}
        </span>
      `;
    }
  });

  // Update each Departure row's calculated cells in-place
  computedDepartures.forEach(({ acft, calc }) => {
    const tr = document.querySelector(`tr[data-row-id="${acft.id}"]`);
    if (!tr) return;

    const cell10 = tr.querySelector('[data-col="dep10"]');
    const cell25 = tr.querySelector('[data-col="dep25"]');
    const cell50 = tr.querySelector('[data-col="dep50"]');
    const cell60 = tr.querySelector('[data-col="dep60"]');

    if (cell10) cell10.textContent = formatTime(calc.t10, calc.hasHour);
    if (cell25) cell25.textContent = formatTime(calc.t25, calc.hasHour);
    if (cell50) cell50.textContent = formatTime(calc.t50, calc.hasHour);
    if (cell60) cell60.textContent = formatTime(calc.t60, calc.hasHour);
  });

  renderConflictsAndDelays(computedArrivals, computedDepartures, delayMap, refHour);
  renderPositionLookup([...computedArrivals, ...computedDepartures], refHour);
}

// Render Scenario Sheet, Departures Sub-Table, Conflicts & Delays, and Position Lookup
function renderScenarioBoard() {
  const arrTbody = document.getElementById("scenarioTableBody");
  const depSection = document.getElementById("departuresSection");
  const depTbody = document.getElementById("departuresTableBody");
  const summaryText = document.getElementById("scenarioSummaryText");

  const refHour = getReferenceBaseHour(state.aircraftList);

  const arrivals = state.aircraftList.filter((a) => a.type !== "DEP");
  const departures = state.aircraftList.filter((a) => a.type === "DEP");

  const computedArrivals = arrivals.map((acft) => ({
    acft,
    wpt: WAYPOINTS.find((w) => w.id === acft.wptId) || WAYPOINTS[0],
    calc: calculateArrivalCheckpoints(acft, state.activeRwy),
  }));

  const computedDepartures = departures.map((acft) => ({
    acft,
    wpt: WAYPOINTS.find((w) => w.id === acft.wptId) || WAYPOINTS[0],
    calc: calculateDepartureCheckpoints(acft),
  }));

  const delayMap = computeArrivalDelays(computedArrivals, refHour);

  summaryText.textContent = `${computedArrivals.length} Arrival(s), ${computedDepartures.length} Departure(s) • All fields are directly editable below.`;

  // 1. Render Arrivals Table (Editable Inputs + Clean Calculated Numbers)
  if (computedArrivals.length === 0) {
    arrTbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="13">No arriving aircraft added yet.</td>
      </tr>
    `;
  } else {
    arrTbody.innerHTML = "";
    computedArrivals.forEach(({ acft, calc }) => {
      const delayInfo = delayMap.get(acft.id) || { willDelay: false };
      const tr = document.createElement("tr");
      tr.setAttribute("data-row-id", acft.id);

      tr.innerHTML = `
        <td>
          <input
            type="text"
            class="inline-input inline-callsign"
            data-edit-field="callsign"
            data-id="${acft.id}"
            value="${acft.callsign}"
            maxlength="12"
            aria-label="Edit Callsign"
          />
        </td>
        <td>
          <select
            class="inline-select inline-wpt"
            data-edit-field="wptId"
            data-id="${acft.id}"
            aria-label="Edit Waypoint"
          >
            ${buildWaypointOptionsHtml(acft.wptId)}
          </select>
        </td>
        <td>
          <button type="button" class="badge ${
            calc.straightIn ? "badge-straight" : "badge-normal"
          }" data-toggle-mode="${acft.id}" title="Click to toggle Straight-In / Normal">
            ${calc.straightIn ? "STRAIGHT-IN" : "NORMAL"}
          </button>
        </td>
        <td>
          <input
            type="number"
            class="inline-input inline-dist"
            data-edit-field="dist"
            data-id="${acft.id}"
            value="${calc.dist}"
            min="5"
            max="150"
            step="1"
            aria-label="Edit Distance NM"
          />
        </td>
        <td>
          <input
            type="text"
            class="inline-input inline-time"
            data-edit-field="timeRaw"
            data-id="${acft.id}"
            value="${acft.timeRaw}"
            aria-label="Edit Initial Time"
          />
        </td>
        <td class="time-cell" data-col="t25">${formatTime(calc.t25, calc.hasHour)}</td>
        <td class="time-cell" data-col="t10">${formatTime(calc.t10, calc.hasHour)}</td>
        <td class="time-cell" data-col="tVor">${
          calc.straightIn ? `<span style="color:var(--text-muted)">—</span>` : formatTime(calc.tVor, calc.hasHour)
        }</td>
        <td class="time-cell" data-col="tFix">${
          calc.straightIn ? `<span style="color:var(--text-muted)">—</span>` : formatTime(calc.tFix, calc.hasHour)
        }</td>
        <td class="time-cell" data-col="tEst">${formatTime(calc.tEst, calc.hasHour)}</td>
        <td data-col="willDelay">
          <span class="badge ${delayInfo.willDelay ? "badge-delayed" : "badge-nodelay"}">
            ${delayInfo.willDelay ? "DELAYED" : "NO DELAY"}
          </span>
        </td>
        <td>
          <div class="hold-controls">
            <button type="button" class="hold-btn" data-hold-id="${acft.id}" data-hold-delta="-1">-1m</button>
            <input
              type="number"
              class="inline-input inline-hold"
              data-edit-field="holdMins"
              data-id="${acft.id}"
              value="${calc.holdMins}"
              step="1"
              aria-label="Edit Manual Delay"
            />
            <button type="button" class="hold-btn" data-hold-id="${acft.id}" data-hold-delta="1">+1m</button>
          </div>
        </td>
        <td>
          <button type="button" class="row-del-btn" data-del-id="${acft.id}" title="Remove aircraft">✕</button>
        </td>
      `;

      arrTbody.appendChild(tr);
    });
  }

  // 2. Render Departures Sub-Table (Editable Callsign, Waypoint, and Dep Time)
  if (computedDepartures.length === 0) {
    depSection.classList.add("hidden");
    depTbody.innerHTML = "";
  } else {
    depSection.classList.remove("hidden");
    depTbody.innerHTML = "";
    computedDepartures.forEach(({ acft, calc }) => {
      const tr = document.createElement("tr");
      tr.setAttribute("data-row-id", acft.id);
      tr.innerHTML = `
        <td>
          <input
            type="text"
            class="inline-input inline-callsign"
            data-edit-field="callsign"
            data-id="${acft.id}"
            value="${acft.callsign}"
            maxlength="12"
            aria-label="Edit Departure Callsign"
          />
        </td>
        <td>
          <select
            class="inline-select inline-wpt"
            data-edit-field="wptId"
            data-id="${acft.id}"
            aria-label="Edit Departure Waypoint"
          >
            ${buildWaypointOptionsHtml(acft.wptId)}
          </select>
        </td>
        <td>
          <input
            type="text"
            class="inline-input inline-time"
            data-edit-field="timeRaw"
            data-id="${acft.id}"
            value="${acft.timeRaw}"
            aria-label="Edit Departure Time"
          />
        </td>
        <td class="time-cell" data-col="dep10">${formatTime(calc.t10, calc.hasHour)}</td>
        <td class="time-cell" data-col="dep25">${formatTime(calc.t25, calc.hasHour)}</td>
        <td class="time-cell" data-col="dep50">${formatTime(calc.t50, calc.hasHour)}</td>
        <td class="time-cell" data-col="dep60">${formatTime(calc.t60, calc.hasHour)}</td>
        <td>
          <button type="button" class="row-del-btn" data-del-id="${acft.id}" title="Remove departure">✕</button>
        </td>
      `;
      depTbody.appendChild(tr);
    });
  }

  // Wire up inline editable fields (updates live on input without losing cursor focus)
  document.querySelectorAll("[data-edit-field]").forEach((inputEl) => {
    const field = inputEl.getAttribute("data-edit-field");
    const id = Number(inputEl.getAttribute("data-id"));

    const handleUpdate = () => {
      const target = state.aircraftList.find((a) => a.id === id);
      if (!target) return;

      if (field === "callsign") {
        target.callsign = inputEl.value.toUpperCase();
      } else if (field === "wptId") {
        target.wptId = inputEl.value;
      } else if (field === "dist") {
        target.dist = Number(inputEl.value) || 0;
      } else if (field === "timeRaw") {
        target.timeRaw = inputEl.value;
      } else if (field === "holdMins") {
        target.holdMins = Number(inputEl.value) || 0;
      }

      saveState();
      refreshCalculatedValuesOnly();
    };

    inputEl.addEventListener("input", handleUpdate);
    inputEl.addEventListener("change", handleUpdate);
  });

  // Wire up Delete buttons
  document.querySelectorAll("[data-del-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-del-id"));
      state.aircraftList = state.aircraftList.filter((a) => a.id !== id);
      saveState();
      renderScenarioBoard();
    });
  });

  // Wire up Hold -1m / +1m steppers
  arrTbody.querySelectorAll("[data-hold-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-hold-id"));
      const delta = Number(btn.getAttribute("data-hold-delta"));
      const target = state.aircraftList.find((a) => a.id === id);
      if (target) {
        target.holdMins = (target.holdMins || 0) + delta;
        saveState();
        renderScenarioBoard();
      }
    });
  });

  // Wire up Approach Mode toggle badge
  arrTbody.querySelectorAll("[data-toggle-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-toggle-mode"));
      const target = state.aircraftList.find((a) => a.id === id);
      if (target) {
        const currentlyStraight = isAircraftStraightIn(target.wptId, target.mode, state.activeRwy);
        target.mode = currentlyStraight ? "normal" : "straight";
        saveState();
        renderScenarioBoard();
      }
    });
  });

  renderConflictsAndDelays(computedArrivals, computedDepartures, delayMap, refHour);
  renderPositionLookup([...computedArrivals, ...computedDepartures], refHour);
}

// Render Dedicated Conflicts & Delay Analysis Cards
function renderConflictsAndDelays(computedArrivals, computedDepartures, delayMap, refHour) {
  const depArrListEl = document.getElementById("depArrConflictList");
  const ilsDelayListEl = document.getElementById("ilsDelayList");

  const depArrConflicts = computeDepArrConflicts(computedArrivals, computedDepartures, refHour);

  if (depArrConflicts.length === 0) {
    depArrListEl.innerHTML = `
      <div class="conflict-box">
        <div class="conflict-detail">
          No Arrival &amp; Departure pair on the same waypoint yet. Add a <strong>Departure</strong> headed to the same waypoint an <strong>Arrival</strong> is coming from to calculate exact crossing DME &amp; time.
        </div>
      </div>
    `;
  } else {
    depArrListEl.innerHTML = "";
    depArrConflicts.forEach((c) => {
      const box = document.createElement("div");
      if (c.isValidInboundConflict) {
        box.className = "conflict-box alert-danger";
        box.innerHTML = `
          <div class="conflict-top">
            <span class="conflict-pair">🛫 ${c.depAcft.callsign} ↔ 🛬 ${c.arrAcft.callsign}</span>
            <span class="badge badge-delayed">${c.wpt.name} / ${c.wpt.entryWpt} (${c.wpt.airway})</span>
          </div>
          <div class="conflict-metrics">
            <div class="metric-pill where-pill">📍 WHERE: <strong>${c.dCross} NM (${c.wpt.name})</strong></div>
            <div class="metric-pill when-pill">⏰ WHEN: <strong>${c.displayTime}</strong></div>
          </div>
          <div class="conflict-detail">
            ${c.depAcft.callsign} departs 0 NM at <code>${c.tDepFormatted}</code> • ${c.arrAcft.callsign} reports ${c.arrDist} NM at <code>${c.tArrInitFormatted}</code> (hits 0 NM at <code>${c.tArrZeroFormatted}</code>).
          </div>
        `;
      } else {
        box.className = "conflict-box alert-safe";
        box.innerHTML = `
          <div class="conflict-top">
            <span class="conflict-pair">🛫 ${c.depAcft.callsign} ↔ 🛬 ${c.arrAcft.callsign}</span>
            <span class="badge badge-nodelay">${c.wpt.name} — CLEAR</span>
          </div>
          <div class="conflict-detail">
            No inbound radial crossing within ${c.arrDist} NM (crossing point would be at <code>${c.dCross} NM</code> @ <code>${c.displayTime}</code>).
          </div>
        `;
      }
      depArrListEl.appendChild(box);
    });
  }

  if (computedArrivals.length === 0) {
    ilsDelayListEl.innerHTML = `
      <div class="conflict-box">
        <div class="conflict-detail">Add arriving aircraft to check if any aircraft will be delayed at its ILS clearance point.</div>
      </div>
    `;
  } else {
    ilsDelayListEl.innerHTML = "";
    computedArrivals.forEach(({ acft, wpt, calc }) => {
      const info = delayMap.get(acft.id) || { willDelay: false, blockers: [] };
      const clearancePointLabel = calc.straightIn ? "25 NM" : "10 NM";
      const tClearStr = formatTime(calc.tClear, calc.hasHour);
      const tEstStr = formatTime(calc.tEst, calc.hasHour);

      const box = document.createElement("div");
      if (info.willDelay) {
        const blockerDescriptions = info.blockers
          .map(
            (b) =>
              `<strong>${b.acft.callsign}</strong> (cleared @ <code>${formatTime(
                b.calc.tClear,
                b.calc.hasHour
              )}</code>, established @ <code>${formatTime(b.calc.tEst, b.calc.hasHour)}</code>)`
          )
          .join(", ");

        box.className = "conflict-box alert-danger";
        box.innerHTML = `
          <div class="conflict-top">
            <span class="conflict-pair">🛬 ${acft.callsign} (${wpt.name} / ${wpt.entryWpt})</span>
            <span class="badge badge-delayed">WILL HAVE DELAY</span>
          </div>
          <div class="conflict-detail">
            Reaches ${clearancePointLabel} (ILS clearance point) at <code>${tClearStr}</code>, while ${blockerDescriptions} is already cleared and not yet established.
          </div>
        `;
      } else {
        box.className = "conflict-box alert-safe";
        box.innerHTML = `
          <div class="conflict-top">
            <span class="conflict-pair">🛬 ${acft.callsign} (${wpt.name} / ${wpt.entryWpt})</span>
            <span class="badge badge-nodelay">NO DELAY</span>
          </div>
          <div class="conflict-detail">
            Cleared at ${clearancePointLabel} @ <code>${tClearStr}</code> → Established @ <code>${tEstStr}</code>${
          calc.holdMins !== 0 ? ` (includes ${calc.holdMins > 0 ? `+${calc.holdMins}m` : `${calc.holdMins}m`} manual delay)` : ""
        }.
          </div>
        `;
      }
      ilsDelayListEl.appendChild(box);
    });
  }
}

function renderPositionLookup(allComputed, refHour) {
  const listEl = document.getElementById("positionSnapshotList");
  if (allComputed.length === 0) {
    listEl.innerHTML = `<div class="snapshot-item" style="color:var(--text-muted)">Add aircraft to inspect their positions at any time.</div>`;
    return;
  }

  const parsedQuery = parseTimeInput(state.lookupTimeRaw);
  const queryMins = parsedQuery.totalMinutes;

  listEl.innerHTML = "";
  allComputed.forEach((item) => {
    const { acft, wpt, calc } = item;
    let effectiveQuery = queryMins;
    if (calc.hasHour && !parsedQuery.hasHour) {
      const baseHour =
        refHour !== null
          ? refHour
          : Math.floor((acft.type === "DEP" ? calc.tDep : calc.tInit) / 60);
      effectiveQuery = baseHour * 60 + queryMins;
    }

    const pos = estimatePositionAtTime(item, effectiveQuery);
    const row = document.createElement("div");
    row.className = "snapshot-item";
    row.innerHTML = `
      <div class="snapshot-left">
        <span class="callsign-cell">${acft.callsign}</span>
        <span class="badge ${
          acft.type === "DEP"
            ? "badge-dep"
            : calc.straightIn
            ? "badge-straight"
            : "badge-normal"
        }">${acft.type === "DEP" ? `DEP → ${wpt.name} (${wpt.entryWpt})` : `${wpt.name} (${wpt.entryWpt})`}</span>
      </div>
      <div class="snapshot-status" style="color: ${pos.color}">${pos.text}</div>
    `;
    listEl.appendChild(row);
  });
}

function initApp() {
  loadSavedState();

  const btnRwy36 = document.getElementById("btnRwy36");
  const btnRwy18 = document.getElementById("btnRwy18");
  const tabArrival = document.getElementById("tabArrival");
  const tabDeparture = document.getElementById("tabDeparture");
  const distFieldGroup = document.getElementById("distFieldGroup");
  const approachOverrideGroup = document.getElementById("approachOverrideGroup");
  const wptFieldLabel = document.getElementById("wptFieldLabel");
  const timeFieldLabel = document.getElementById("timeFieldLabel");
  const metaFieldLabel = document.getElementById("metaFieldLabel");
  const btnSubmitAircraft = document.getElementById("btnSubmitAircraft");

  function syncFormModeUI() {
    const isDep = state.flightType === "DEP";
    tabArrival.classList.toggle("active", !isDep);
    tabDeparture.classList.toggle("active", isDep);

    distFieldGroup.classList.toggle("hidden", isDep);
    approachOverrideGroup.classList.toggle("hidden", isDep);

    metaFieldLabel.textContent = isDep
      ? "1. Callsign"
      : "1. Callsign & Approach Type";
    wptFieldLabel.textContent = isDep
      ? "2. Departure Waypoint / Exit Fix"
      : "2. Waypoint / Entry Fix";
    timeFieldLabel.innerHTML = isDep
      ? `3. Departure Time at 0 NM <span class="hint">(e.g. <code>04</code> or <code>10:04</code>)</span>`
      : `4. Report Time <span class="hint">(e.g. <code>0</code>, <code>05</code>, or <code>10:05</code>)</span>`;

    btnSubmitAircraft.classList.toggle("dep-mode", isDep);
    btnSubmitAircraft.innerHTML = isDep
      ? `<span>🛫 Add Departure to Scenario (Enter)</span>`
      : `<span>➕ Add Arrival to Scenario Sheet (Enter)</span>`;

    renderWaypointGrid();
    renderLivePreview();
  }

  tabArrival.addEventListener("click", () => {
    state.flightType = "ARR";
    syncFormModeUI();
  });

  tabDeparture.addEventListener("click", () => {
    state.flightType = "DEP";
    syncFormModeUI();
  });

  function updateRwyUI() {
    btnRwy36.classList.toggle("active", state.activeRwy === "36");
    btnRwy18.classList.toggle("active", state.activeRwy === "18");
    renderWaypointGrid();
    renderLivePreview();
    renderScenarioBoard();
  }

  btnRwy36.addEventListener("click", () => {
    state.activeRwy = "36";
    saveState();
    updateRwyUI();
  });

  btnRwy18.addEventListener("click", () => {
    state.activeRwy = "18";
    saveState();
    updateRwyUI();
  });

  // Distance Input & Step Buttons (-5, -1, +1, +5)
  const inputDist = document.getElementById("inputDist");

  inputDist.addEventListener("input", () => {
    state.selectedDist = Number(inputDist.value) || 0;
    renderLivePreview();
  });

  document.querySelectorAll(".dist-step-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const step = Number(btn.getAttribute("data-dist-step"));
      const cur = Number(inputDist.value) || 60;
      const nextDist = Math.max(5, cur + step);
      inputDist.value = nextDist;
      state.selectedDist = nextDist;
      renderLivePreview();
    });
  });

  // Time Input & Step Buttons (-5m, -1m, +1m, +5m)
  const inputTime = document.getElementById("inputTime");
  inputTime.addEventListener("input", () => {
    state.inputTimeRaw = inputTime.value;
    renderLivePreview();
  });

  document.querySelectorAll(".minute-step-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const step = Number(btn.getAttribute("data-step"));
      const parsed = parseTimeInput(inputTime.value);
      const nextMins = Math.max(0, parsed.totalMinutes + step);
      if (parsed.hasHour) {
        inputTime.value = formatTime(nextMins, true);
      } else {
        inputTime.value = String(Math.round(nextMins)).padStart(2, "0");
      }
      state.inputTimeRaw = inputTime.value;
      renderLivePreview();
    });
  });

  // Callsign Input
  const inputCallsign = document.getElementById("inputCallsign");
  inputCallsign.addEventListener("input", () => {
    state.inputCallsign = inputCallsign.value;
    renderLivePreview();
  });

  // Approach Mode Override Buttons
  const modeBtns = document.querySelectorAll(".mode-btn");
  modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.approachMode = btn.getAttribute("data-mode");
      modeBtns.forEach((b) => b.classList.toggle("active", b === btn));
      renderLivePreview();
    });
  });

  // Add Aircraft Form Submit
  const aircraftForm = document.getElementById("aircraftForm");
  aircraftForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const isDep = state.flightType === "DEP";
    const defaultPrefix = isDep ? "DEP" : "ACFT";
    const callsign =
      state.inputCallsign.trim().toUpperCase() || `${defaultPrefix} ${state.nextId}`;

    state.aircraftList.push({
      id: state.nextId++,
      type: state.flightType,
      callsign,
      wptId: state.selectedWpt,
      dist: isDep ? 0 : Number(inputDist.value) || 60,
      timeRaw: inputTime.value.trim() || "00",
      mode: state.approachMode,
      holdMins: 0,
    });

    state.inputCallsign = "";
    inputCallsign.value = "";

    saveState();
    renderLivePreview();
    renderScenarioBoard();
  });

  document.getElementById("btnSortByEst").addEventListener("click", () => {
    const refHour = getReferenceBaseHour(state.aircraftList);
    state.aircraftList.sort((a, b) => {
      if (a.type !== b.type) return a.type === "ARR" ? -1 : 1;
      if (a.type === "DEP") {
        const ca = calculateDepartureCheckpoints(a);
        const cb = calculateDepartureCheckpoints(b);
        return (
          normalizeTime(ca.tDep, ca.hasHour, refHour) -
          normalizeTime(cb.tDep, cb.hasHour, refHour)
        );
      }
      const ca = calculateArrivalCheckpoints(a, state.activeRwy);
      const cb = calculateArrivalCheckpoints(b, state.activeRwy);
      return (
        normalizeTime(ca.tEst, ca.hasHour, refHour) -
        normalizeTime(cb.tEst, cb.hasHour, refHour)
      );
    });
    saveState();
    renderScenarioBoard();
  });

  document.getElementById("btnSortByInit").addEventListener("click", () => {
    const refHour = getReferenceBaseHour(state.aircraftList);
    state.aircraftList.sort((a, b) => {
      const ta = parseTimeInput(a.timeRaw);
      const tb = parseTimeInput(b.timeRaw);
      return (
        normalizeTime(ta.totalMinutes, ta.hasHour, refHour) -
        normalizeTime(tb.totalMinutes, tb.hasHour, refHour)
      );
    });
    saveState();
    renderScenarioBoard();
  });

  document.getElementById("btnClearAll").addEventListener("click", () => {
    state.aircraftList = [];
    state.nextId = 1;
    saveState();
    renderScenarioBoard();
  });

  const lookupTimeInput = document.getElementById("lookupTimeInput");
  lookupTimeInput.addEventListener("input", () => {
    state.lookupTimeRaw = lookupTimeInput.value;
    renderScenarioBoard();
  });

  document.querySelectorAll(".lookup-step").forEach((btn) => {
    btn.addEventListener("click", () => {
      const step = Number(btn.getAttribute("data-step"));
      const parsed = parseTimeInput(lookupTimeInput.value);
      const nextMins = Math.max(0, parsed.totalMinutes + step);
      if (parsed.hasHour) {
        lookupTimeInput.value = formatTime(nextMins, true);
      } else {
        lookupTimeInput.value = String(Math.round(nextMins)).padStart(2, "0");
      }
      state.lookupTimeRaw = lookupTimeInput.value;
      renderScenarioBoard();
    });
  });

  // Interactive native SVG chart corridors
  document.querySelectorAll(".chart-corridor").forEach((corridor) => {
    corridor.addEventListener("click", () => {
      const wpt = corridor.getAttribute("data-wpt");
      if (wpt) {
        state.selectedWpt = wpt;
        renderWaypointGrid();
        renderLivePreview();
      }
    });
  });

  syncFormModeUI();
  updateRwyUI();
}

document.addEventListener("DOMContentLoaded", initApp);
