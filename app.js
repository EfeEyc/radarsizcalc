// AYT TMA Radarless Approach Calculator
// Hardcoded speed: 5 NM / 1 minute (300 kt GS)

const SPEED_NM_PER_MIN = 5;

const WAYPOINTS = [
  {
    id: "DERYA",
    name: "DERYA",
    airway: "VA-16",
    radial: "R-170",
    fl: "FL070",
    star: "DERYA 1A",
    outer: "TOMBİ",
    msa: "3,000' / 12,000'",
    straightInRwy: "36",
  },
  {
    id: "KUMRU",
    name: "KUMRU",
    airway: "VA-16",
    radial: "R-350",
    fl: "FL120",
    star: "KUMRU 1A",
    outer: "KFK",
    msa: "10,000' / 9,000'",
    straightInRwy: "18",
  },
  {
    id: "BRONZ",
    name: "BRONZ",
    airway: "R-55",
    radial: "R-310",
    fl: "FL110",
    star: "BRONZ 1A",
    outer: "CRD",
    msa: "10,000'",
    straightInRwy: null,
  },
  {
    id: "ALPAY",
    name: "ALPAY",
    airway: "W-79",
    radial: "R-270",
    fl: "FL120",
    star: "ALPAY 1A",
    outer: "W-79",
    msa: "10,000' / 12,000'",
    straightInRwy: null,
  },
  {
    id: "DAMLA",
    name: "DAMLA",
    airway: "W-77",
    radial: "R-030",
    fl: "FL130",
    star: "DAMLA 1A",
    outer: "HİSAR",
    msa: "9,000'",
    straightInRwy: null,
  },
  {
    id: "KONAK",
    name: "KONAK",
    airway: "R-55",
    radial: "R-090",
    fl: "FL130",
    star: "KONAK 1A",
    outer: "MUT",
    msa: "9,000' / 3,000'",
    straightInRwy: null,
  },
  {
    id: "MANAV",
    name: "MANAV",
    airway: "W-83",
    radial: "R-130",
    fl: "FL070",
    star: "MANAV 1A",
    outer: "DOREN",
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
  aircraftList: [], // Mix of ARR and DEP items ({ type: 'ARR' | 'DEP', ... })
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
// Note: Manual delay (holdMins) ONLY shifts 10 DME Fix and Established time, keeping 10 NM unchanged!
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
  // Time the aircraft would hit 0 NM (AYT VOR) along the radial
  const tRadialZero = tInit + d / SPEED_NM_PER_MIN;

  let tVor = null;
  let tFix = null;
  let tEst = null;
  let tClear = null; // Point where plane can be cleared for ILS

  if (straightIn) {
    // Straight-In: Cleared for ILS at 25 NM, Established at 10 NM (+ manual delay if any)
    tClear = t25 !== null ? t25 : tInit;
    tEst = t10 + hold;
  } else {
    // Normal: Cleared for ILS at 10 NM, +2m VOR, +2m 10 DME Fix (+ manual delay), +5m Established
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
    t10: tDep + 10 / SPEED_NM_PER_MIN, // +2m
    t25: tDep + 25 / SPEED_NM_PER_MIN, // +5m
    t50: tDep + 50 / SPEED_NM_PER_MIN, // +10m
    t60: tDep + 60 / SPEED_NM_PER_MIN, // +12m
  };
}

// Helper to normalize times if user mixed "05" and "10:05" in the same scenario
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
// Rule: If at the point where you can CLEAR a plane for ILS (10 NM for Normal, 25 NM for Straight-In),
// there is ANOTHER plane that has been cleared BUT NOT ESTABLISHED yet, this plane WILL BE DELAYED.
// Takes into account manual delay added on the checkpoint sheet (which shifts Established time).
function computeArrivalDelays(computedArrivals, refHour) {
  // Map with normalized times for comparison
  const list = computedArrivals.map((item) => {
    const normClear = normalizeTime(item.calc.tClear, item.calc.hasHour, refHour);
    const normEst = normalizeTime(item.calc.tEst, item.calc.hasHour, refHour);
    return {
      ...item,
      normClear,
      normEst,
    };
  });

  // Sort by ILS clearance point time (tie-breaker: initial report time, then id)
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
      // Earlier plane reached its clearance point at or before current plane's clearance point,
      // AND earlier plane is NOT YET ESTABLISHED when current plane reaches its clearance point:
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
// Arrival: starts at D_arr0 at T_arr0, flies inbound towards 0 NM at 5 NM/min -> reaches 0 NM at T_arrAt0 = T_arr0 + D_arr0/5
// Departure: starts at 0 NM at T_dep, flies outbound at 5 NM/min
// Crossing time: t_conflict = (T_dep + T_arrAt0) / 2
// Crossing distance: D_conflict = 5 * (t_conflict - T_dep)
function computeDepArrConflicts(computedArrivals, computedDepartures, refHour) {
  const conflicts = [];

  computedDepartures.forEach((depItem) => {
    const matchingArrivals = computedArrivals.filter(
      (arrItem) => arrItem.acft.wptId === depItem.acft.wptId
    );

    matchingArrivals.forEach((arrItem) => {
      const useHasHour = depItem.calc.hasHour || arrItem.calc.hasHour;
      const tDepNorm = normalizeTime(depItem.calc.tDep, depItem.calc.hasHour, refHour);
      const tArrInitNorm = normalizeTime(arrItem.calc.tInit, arrItem.calc.hasHour, refHour);
      const tArrZeroNorm = normalizeTime(arrItem.calc.tRadialZero, arrItem.calc.hasHour, refHour);

      // Crossing calculation
      const tCrossNorm = (tDepNorm + tArrZeroNorm) / 2;
      const dCross = SPEED_NM_PER_MIN * (tCrossNorm - tDepNorm);

      // Convert tCrossNorm back to display format
      const displayTime = formatTime(
        useHasHour ? tCrossNorm : tCrossNorm - (refHour ? refHour * 60 : 0),
        useHasHour
      );

      const dCrossRounded = +dCross.toFixed(1);

      // Check if conflict occurs while arrival is inbound to 0 NM (dCross >= 0)
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

// Estimate exact position of an arrival or departure at query time T_q
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
      text: `${dme} NM outbound on ${item.wpt.name}`,
      color: "var(--accent-amber)",
    };
  }

  // Arrival
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

  // Normal Arrival
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

// Render Waypoint Buttons
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
        ${isStraightForCurrentRwy ? `<span class="wpt-tag">STR-IN</span>` : ""}
      </div>
      <div class="wpt-meta">${wpt.airway} • ${wpt.radial} • ${wpt.fl}</div>
    `;

    btn.addEventListener("click", () => {
      state.selectedWpt = wpt.id;
      renderWaypointGrid();
      renderLivePreview();
    });

    container.appendChild(btn);
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
          <span><strong>${callsignLabel}</strong> headed to <strong>${wptObj.name}</strong> (${wptObj.airway} • ${wptObj.radial})</span>
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

  // Arrival Live Preview
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
        <span><strong>${callsignLabel}</strong> via <strong>${wptObj.name}</strong> (${wptObj.airway} • ${wptObj.radial} • ${wptObj.fl})</span>
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

  summaryText.textContent = `${computedArrivals.length} Arrival(s), ${computedDepartures.length} Departure(s) • Active Runway: RWY ${state.activeRwy}`;

  // 1. Render Arrivals Table (Clean Numbers Only!)
  if (computedArrivals.length === 0) {
    arrTbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="12">No arriving aircraft added yet.</td>
      </tr>
    `;
  } else {
    arrTbody.innerHTML = "";
    computedArrivals.forEach(({ acft, wpt, calc }) => {
      const delayInfo = delayMap.get(acft.id) || { willDelay: false, blockers: [] };
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td class="callsign-cell">${acft.callsign}</td>
        <td class="wpt-cell">${wpt.name}</td>
        <td>
          <button type="button" class="badge ${
            calc.straightIn ? "badge-straight" : "badge-normal"
          }" data-toggle-mode="${acft.id}" title="Click to toggle Straight-In / Normal">
            ${calc.straightIn ? "STRAIGHT-IN" : "NORMAL"}
          </button>
        </td>
        <td class="time-cell">${formatTime(calc.tInit, calc.hasHour)}</td>
        <td class="time-cell">${formatTime(calc.t25, calc.hasHour)}</td>
        <td class="time-cell">${formatTime(calc.t10, calc.hasHour)}</td>
        <td class="time-cell">${
          calc.straightIn ? `<span style="color:var(--text-muted)">—</span>` : formatTime(calc.tVor, calc.hasHour)
        }</td>
        <td class="time-cell">${
          calc.straightIn ? `<span style="color:var(--text-muted)">—</span>` : formatTime(calc.tFix, calc.hasHour)
        }</td>
        <td class="time-cell">${formatTime(calc.tEst, calc.hasHour)}</td>
        <td>
          <span class="badge ${delayInfo.willDelay ? "badge-delayed" : "badge-nodelay"}">
            ${delayInfo.willDelay ? "DELAYED" : "NO DELAY"}
          </span>
        </td>
        <td>
          <div class="hold-controls">
            <button type="button" class="hold-btn" data-hold-id="${acft.id}" data-hold-delta="-1">-1m</button>
            <span class="hold-val ${calc.holdMins !== 0 ? "active-hold" : ""}">
              ${calc.holdMins > 0 ? `+${calc.holdMins}m` : `${calc.holdMins}m`}
            </span>
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

  // 2. Render Departures Sub-Table
  if (computedDepartures.length === 0) {
    depSection.classList.add("hidden");
    depTbody.innerHTML = "";
  } else {
    depSection.classList.remove("hidden");
    depTbody.innerHTML = "";
    computedDepartures.forEach(({ acft, wpt, calc }) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="callsign-cell">${acft.callsign}</td>
        <td class="wpt-cell">${wpt.name}</td>
        <td class="time-cell">${formatTime(calc.tDep, calc.hasHour)}</td>
        <td class="time-cell">${formatTime(calc.t10, calc.hasHour)}</td>
        <td class="time-cell">${formatTime(calc.t25, calc.hasHour)}</td>
        <td class="time-cell">${formatTime(calc.t50, calc.hasHour)}</td>
        <td class="time-cell">${formatTime(calc.t60, calc.hasHour)}</td>
        <td>
          <button type="button" class="row-del-btn" data-del-id="${acft.id}" title="Remove departure">✕</button>
        </td>
      `;
      depTbody.appendChild(tr);
    });
  }

  // Wire up table buttons (Delete, Hold/Delay, Mode Toggle)
  document.querySelectorAll("[data-del-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-del-id"));
      state.aircraftList = state.aircraftList.filter((a) => a.id !== id);
      saveState();
      renderScenarioBoard();
    });
  });

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

  // 3. Render Conflicts & Delays Section
  renderConflictsAndDelays(computedArrivals, computedDepartures, delayMap, refHour);

  // 4. Render Position Estimator at Time T
  renderPositionLookup([...computedArrivals, ...computedDepartures], refHour);
}

// Render Dedicated Conflicts & Delay Analysis Cards
function renderConflictsAndDelays(computedArrivals, computedDepartures, delayMap, refHour) {
  const depArrListEl = document.getElementById("depArrConflictList");
  const ilsDelayListEl = document.getElementById("ilsDelayList");

  // Part A: Departure <-> Arrival Head-On Conflicts on same waypoint
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
            <span class="badge badge-delayed">${c.wpt.name} (${c.wpt.airway})</span>
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

  // Part B: Arrival ILS Clearance Delays
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
            <span class="conflict-pair">🛬 ${acft.callsign} (${wpt.name})</span>
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
            <span class="conflict-pair">🛬 ${acft.callsign} (${wpt.name})</span>
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

// Render "Where is every aircraft at time T?"
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
        }">${acft.type === "DEP" ? `DEP → ${wpt.name}` : wpt.name}</span>
      </div>
      <div class="snapshot-status" style="color: ${pos.color}">${pos.text}</div>
    `;
    listEl.appendChild(row);
  });
}

// Initialize App & Event Listeners
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

    wptFieldLabel.textContent = isDep
      ? "1. Departure Waypoint / Airway"
      : "1. Entry Waypoint / STAR";
    timeFieldLabel.innerHTML = isDep
      ? `2. Departure Time at 0 NM <span class="hint">(e.g. <code>04</code> or <code>10:04</code>)</span>`
      : `3. Report Time <span class="hint">(e.g. <code>0</code>, <code>05</code>, or <code>10:05</code>)</span>`;
    metaFieldLabel.textContent = isDep
      ? "3. Callsign (Optional)"
      : "4. Callsign (Optional) & Approach Type";

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

  // Distance Preset Buttons & Custom Input
  const inputDist = document.getElementById("inputDist");
  const presetBtns = document.querySelectorAll(".preset-btn");

  function syncDistButtons(val) {
    presetBtns.forEach((btn) => {
      btn.classList.toggle("active", Number(btn.getAttribute("data-dist")) === Number(val));
    });
  }

  presetBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const d = Number(btn.getAttribute("data-dist"));
      state.selectedDist = d;
      inputDist.value = d;
      syncDistButtons(d);
      renderLivePreview();
    });
  });

  inputDist.addEventListener("input", () => {
    state.selectedDist = Number(inputDist.value) || 0;
    syncDistButtons(state.selectedDist);
    renderLivePreview();
  });

  // Time Input & Step Buttons
  const inputTime = document.getElementById("inputTime");
  inputTime.addEventListener("input", () => {
    state.inputTimeRaw = inputTime.value;
    renderLivePreview();
  });

  document.querySelectorAll(".quick-time-btns .time-step-btn").forEach((btn) => {
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

  // Scenario Sort & Clear Buttons
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

  // Lookup Time Input & Steppers
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

  // Chart Modal
  const chartModal = document.getElementById("chartModal");
  document.getElementById("btnToggleChart").addEventListener("click", () => {
    chartModal.classList.remove("hidden");
  });
  document.getElementById("btnCloseChart").addEventListener("click", () => {
    chartModal.classList.add("hidden");
  });
  chartModal.addEventListener("click", (e) => {
    if (e.target === chartModal) {
      chartModal.classList.add("hidden");
    }
  });

  syncFormModeUI();
  updateRwyUI();
}

document.addEventListener("DOMContentLoaded", initApp);
