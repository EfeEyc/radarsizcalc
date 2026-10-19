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
  selectedWpt: "BRONZ",
  selectedDist: 60,
  inputTimeRaw: "00",
  inputCallsign: "",
  approachMode: "auto", // 'auto' | 'normal' | 'straight'
  lookupTimeRaw: "10",
  aircraftList: [],
  nextId: 1,
};

// Load saved state from localStorage
function loadSavedState() {
  try {
    const saved = localStorage.getItem("ayt_radarsiz_state_v1");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.activeRwy) state.activeRwy = parsed.activeRwy;
      if (Array.isArray(parsed.aircraftList)) state.aircraftList = parsed.aircraftList;
      if (typeof parsed.nextId === "number") state.nextId = parsed.nextId;
    }
  } catch (err) {
    console.warn("Could not load state from localStorage:", err);
  }
}

function saveState() {
  try {
    localStorage.setItem(
      "ayt_radarsiz_state_v1",
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

// Parse flexible time input:
// Supports: "0", "5", "05", ":05", "10:05", "9:30", "1005"
function parseTimeInput(rawStr) {
  const s = String(rawStr ?? "").trim();
  if (!s) {
    return { valid: true, hasHour: false, totalMinutes: 0 };
  }

  // Case 1: Leading colon ":05" -> minutes only
  if (s.startsWith(":")) {
    const m = parseFloat(s.slice(1));
    if (!Number.isNaN(m)) {
      return { valid: true, hasHour: false, totalMinutes: m };
    }
  }

  // Case 2: Contains colon "HH:MM"
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

  // Case 3: Pure number
  const digitsOnly = /^\d{3,4}$/.test(s);
  const num = parseFloat(s);
  if (!Number.isNaN(num)) {
    // If 3 or 4 digits >= 100 (e.g. 1005 -> 10:05, 930 -> 09:30)
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

// Format minutes value into readable ATC time string
function formatTime(totalMins, hasHour = false) {
  if (totalMins === null || totalMins === undefined || Number.isNaN(totalMins)) {
    return "—";
  }

  // Round to nearest second to avoid floating point issues
  const totalSeconds = Math.round(totalMins * 60);
  const sign = totalSeconds < 0 ? "-" : "";
  const absSeconds = Math.abs(totalSeconds);
  const wholeMins = Math.floor(absSeconds / 60);
  const secs = absSeconds % 60;
  const secSuffix = secs > 0 ? `:${String(secs).padStart(2, "0")}s` : "";

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

// Determine if aircraft is Straight-In given active runway and mode override
function isAircraftStraightIn(wptId, mode, activeRwy) {
  if (mode === "straight") return true;
  if (mode === "normal") return false;
  if (activeRwy === "36" && wptId === "DERYA") return true;
  if (activeRwy === "18" && wptId === "KUMRU") return true;
  return false;
}

// Core Checkpoint Calculation
function calculateCheckpoints({ wptId, dist, timeRaw, mode, holdMins = 0 }, activeRwy) {
  const parsedTime = parseTimeInput(timeRaw);
  const tInit = parsedTime.totalMinutes;
  const hasHour = parsedTime.hasHour;
  const straightIn = isAircraftStraightIn(wptId, mode, activeRwy);
  const d = Number(dist) || 60;
  const hold = Number(holdMins) || 0;

  // Travel from Initial Distance to 25 NM and 10 NM at 5 NM / 1 min
  const deltaTo25 = d >= 25 ? (d - 25) / SPEED_NM_PER_MIN : null;
  const deltaTo10 = d >= 10 ? (d - 10) / SPEED_NM_PER_MIN : 0;

  const t25 = deltaTo25 !== null ? tInit + deltaTo25 : null;
  const t10 = tInit + deltaTo10;

  let tVor = null;
  let tFix = null;
  let tEst = null;

  if (straightIn) {
    // Straight-In rule (VA-16):
    // 60/50 NM -> 25 NM (Clear ILS) -> 10 NM (+3m from 25 NM, Full Established & Sent to TWR)
    tEst = t10 + hold;
  } else {
    // Normal Approach rule:
    // 60/50 NM -> 25 NM -> 10 NM (Clear ILS) -> +2m AYT VOR -> +2m 10 DME FIX -> +5m Full Established & TWR
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
    delta25: deltaTo25,
    delta10: deltaTo10,
  };
}

// Estimate exact position of an aircraft at query time T_q
function estimatePositionAtTime(acft, calc, queryMins) {
  const { d, tInit, t25, t10, tVor, tFix, tEst, straightIn, holdMins } = {
    d: calc.dist,
    ...calc,
  };

  if (queryMins < tInit) {
    const wait = +(tInit - queryMins).toFixed(1);
    return {
      phase: "pending",
      text: `Not yet reported (reports ${d} NM in ${wait}m)`,
      color: "var(--text-muted)",
    };
  }

  if (straightIn) {
    // Straight-in: inbound from d to 10 NM
    const tEffective10 = t10 + holdMins;
    if (queryMins < tEffective10) {
      const elapsed = Math.max(0, queryMins - tInit - holdMins);
      const currentDme = Math.max(10, +(d - elapsed * SPEED_NM_PER_MIN).toFixed(1));
      if (t25 !== null && Math.abs(queryMins - t25) < 0.05) {
        return {
          phase: "ils",
          text: `AT 25 NM — Clear for ILS (Straight-In)`,
          color: "var(--accent-amber)",
        };
      }
      return {
        phase: "inbound",
        text: `${currentDme} NM inbound on ${acft.wptId} (Straight-In)`,
        color: "var(--accent-blue)",
      };
    }
    if (Math.abs(queryMins - tEst) < 0.05) {
      return {
        phase: "est",
        text: `10 NM — FULL ESTABLISHED → Send to TWR (118.1)`,
        color: "var(--accent-green)",
      };
    }
    const afterEst = +(queryMins - tEst).toFixed(1);
    if (afterEst <= 2) {
      const finalDme = Math.max(0, +(10 - afterEst * SPEED_NM_PER_MIN).toFixed(1));
      return {
        phase: "twr",
        text: `With TWR on Short Final (${finalDme} NM to RWY ${state.activeRwy})`,
        color: "var(--accent-green)",
      };
    }
    return {
      phase: "landed",
      text: `Sent to TWR ${afterEst}m ago (Landed)`,
      color: "var(--text-muted)",
    };
  }

  // Normal Approach:
  // 1. Inbound from d NM to AYT VOR (0 NM)
  if (queryMins <= tVor) {
    const elapsed = queryMins - tInit;
    const currentDme = Math.max(0, +(d - elapsed * SPEED_NM_PER_MIN).toFixed(1));
    if (t25 !== null && Math.abs(queryMins - t25) < 0.05) {
      return {
        phase: "report25",
        text: `AT 25 NM (${acft.wptId}) — Instruct report 10 NM`,
        color: "var(--accent-blue)",
      };
    }
    if (Math.abs(queryMins - t10) < 0.05) {
      return {
        phase: "ils",
        text: `AT 10 NM (${acft.wptId}) — CLEAR FOR ILS`,
        color: "var(--accent-amber)",
      };
    }
    if (Math.abs(queryMins - tVor) < 0.05) {
      return {
        phase: "vor",
        text: `OVERHEAD AYT VOR (0 DME) → outbound to 10 DME FIX`,
        color: "var(--accent-amber)",
      };
    }
    return {
      phase: "inbound",
      text: `${currentDme} NM inbound on ${acft.wptId}`,
      color: "var(--accent-blue)",
    };
  }

  // 2. Outbound from AYT VOR to 10 DME FIX (takes 2 mins)
  const tArriveFix = tVor + 2;
  if (queryMins <= tArriveFix) {
    const outboundElapsed = queryMins - tVor;
    const outboundDme = +(outboundElapsed * SPEED_NM_PER_MIN).toFixed(1);
    if (Math.abs(queryMins - tArriveFix) < 0.05) {
      return {
        phase: "fix",
        text: `AT 10 DME FIX${holdMins > 0 ? ` (Holding ${holdMins}m)` : " → starting 5m procedure turn"}`,
        color: "var(--accent-amber)",
      };
    }
    return {
      phase: "outbound",
      text: `${outboundDme} NM outbound (AYT VOR → 10 DME FIX)`,
      color: "var(--accent-amber)",
    };
  }

  // 3. Holding at 10 DME FIX (if holdMins > 0)
  if (queryMins <= tFix) {
    const remHold = +(tFix - queryMins).toFixed(1);
    return {
      phase: "hold",
      text: `Holding at 10 DME FIX (${remHold}m remaining)`,
      color: "var(--accent-amber)",
    };
  }

  // 4. In 5-minute procedure turn from 10 DME FIX to Established
  if (queryMins < tEst) {
    const remTurn = +(tEst - queryMins).toFixed(1);
    return {
      phase: "turn",
      text: `In 5-min ILS procedure turn (${remTurn}m until Established)`,
      color: "var(--accent-purple)",
    };
  }

  if (Math.abs(queryMins - tEst) < 0.05) {
    return {
      phase: "est",
      text: `FULL ESTABLISHED → Send to TWR (118.1)`,
      color: "var(--accent-green)",
    };
  }

  const afterEst = +(queryMins - tEst).toFixed(1);
  return {
    phase: "twr",
    text: `Sent to TWR ${afterEst}m ago`,
    color: "var(--text-muted)",
  };
}

// Render Waypoint Buttons
function renderWaypointGrid() {
  const container = document.getElementById("wptGrid");
  container.innerHTML = "";

  WAYPOINTS.forEach((wpt) => {
    const isStraightForCurrentRwy = wpt.straightInRwy === state.activeRwy;
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

  const calc = calculateCheckpoints(
    {
      wptId: state.selectedWpt,
      dist: state.selectedDist,
      timeRaw: state.inputTimeRaw,
      mode: state.approachMode,
      holdMins: 0,
    },
    state.activeRwy
  );

  const callsignLabel = state.inputCallsign.trim()
    ? state.inputCallsign.trim().toUpperCase()
    : "PREVIEW";

  if (calc.straightIn) {
    previewEl.innerHTML = `
      <div class="preview-header">
        <div class="preview-title">
          <span class="badge badge-straight">⚡ STRAIGHT-IN (RWY ${state.activeRwy})</span>
          <span><strong>${callsignLabel}</strong> via <strong>${wptObj.name}</strong> (${wptObj.airway} • ${wptObj.radial} • ${wptObj.fl})</span>
        </div>
        <span class="step-delta">Total time to Established/TWR: <strong>+${calc.tEst - calc.tInit} min</strong></span>
      </div>
      <div class="preview-steps">
        <div class="step-box">
          <div class="step-label"><span>1. INITIAL (${calc.dist} NM)</span> <span class="step-delta">+0m</span></div>
          <div class="step-time">${formatTime(calc.tInit, calc.hasHour)}</div>
          <div class="step-note">Ask report 25 NM</div>
        </div>
        <div class="step-box highlight-ils">
          <div class="step-label"><span>2. 25 NM</span> <span class="step-delta">${calc.delta25 !== null ? `+${calc.delta25}m` : "—"}</span></div>
          <div class="step-time">${formatTime(calc.t25, calc.hasHour)}</div>
          <div class="step-note">⚡ CLEAR FOR ILS</div>
        </div>
        <div class="step-box highlight-est">
          <div class="step-label"><span>3. 10 NM</span> <span class="step-delta">+3m</span></div>
          <div class="step-time">${formatTime(calc.t10, calc.hasHour)}</div>
          <div class="step-note">✅ ESTABLISHED → TWR</div>
        </div>
        <div class="step-box step-bypassed">
          <div class="step-label"><span>AYT VOR</span></div>
          <div class="step-time">—</div>
          <div class="step-note">Bypassed (Straight-In)</div>
        </div>
        <div class="step-box step-bypassed">
          <div class="step-label"><span>10 DME FIX</span></div>
          <div class="step-time">—</div>
          <div class="step-note">No 5m procedure turn</div>
        </div>
        <div class="step-box highlight-est">
          <div class="step-label"><span>SENT TO TWR</span> <span class="step-delta">118.1</span></div>
          <div class="step-time">${formatTime(calc.tEst, calc.hasHour)}</div>
          <div class="step-note">At 10 NM (Straight-In)</div>
        </div>
      </div>
    `;
  } else {
    previewEl.innerHTML = `
      <div class="preview-header">
        <div class="preview-title">
          <span class="badge badge-normal">📐 NORMAL APPROACH (RWY ${state.activeRwy})</span>
          <span><strong>${callsignLabel}</strong> via <strong>${wptObj.name}</strong> (${wptObj.airway} • ${wptObj.radial} • ${wptObj.fl})</span>
        </div>
        <span class="step-delta">Total time to Established/TWR: <strong>+${calc.tEst - calc.tInit} min</strong></span>
      </div>
      <div class="preview-steps">
        <div class="step-box">
          <div class="step-label"><span>1. INITIAL (${calc.dist} NM)</span> <span class="step-delta">+0m</span></div>
          <div class="step-time">${formatTime(calc.tInit, calc.hasHour)}</div>
          <div class="step-note">Ask report 25 NM</div>
        </div>
        <div class="step-box">
          <div class="step-label"><span>2. 25 NM</span> <span class="step-delta">${calc.delta25 !== null ? `+${calc.delta25}m` : "—"}</span></div>
          <div class="step-time">${formatTime(calc.t25, calc.hasHour)}</div>
          <div class="step-note">Ask report 10 NM</div>
        </div>
        <div class="step-box highlight-ils">
          <div class="step-label"><span>3. 10 NM</span> <span class="step-delta">+3m</span></div>
          <div class="step-time">${formatTime(calc.t10, calc.hasHour)}</div>
          <div class="step-note">🔓 CLEAR FOR ILS</div>
        </div>
        <div class="step-box">
          <div class="step-label"><span>4. AYT VOR</span> <span class="step-delta">+2m</span></div>
          <div class="step-time">${formatTime(calc.tVor, calc.hasHour)}</div>
          <div class="step-note">Overhead VOR</div>
        </div>
        <div class="step-box">
          <div class="step-label"><span>5. 10 DME FIX</span> <span class="step-delta">+2m</span></div>
          <div class="step-time">${formatTime(calc.tFix, calc.hasHour)}</div>
          <div class="step-note">Start 5m turn</div>
        </div>
        <div class="step-box highlight-est">
          <div class="step-label"><span>6. ESTABLISHED</span> <span class="step-delta">+5m</span></div>
          <div class="step-time">${formatTime(calc.tEst, calc.hasHour)}</div>
          <div class="step-note">✅ SEND TO TWR (118.1)</div>
        </div>
      </div>
    `;
  }
}

// Render Scenario Table, Snapshot Lookup, and Chronological Feed
function renderScenarioBoard() {
  const tbody = document.getElementById("scenarioTableBody");
  const summaryText = document.getElementById("scenarioSummaryText");

  if (state.aircraftList.length === 0) {
    summaryText.textContent = "No aircraft added yet. Use the calculator above and press Enter or '+ Add Aircraft'.";
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="11">No aircraft in scenario sheet yet. Calculate above and click <strong>➕ Add Aircraft to Scenario Sheet</strong>.</td>
      </tr>
    `;
    renderPositionLookup([]);
    renderChronologicalFeed([]);
    return;
  }

  // Compute checkpoints for all aircraft
  const computedList = state.aircraftList.map((acft) => ({
    acft,
    wpt: WAYPOINTS.find((w) => w.id === acft.wptId) || WAYPOINTS[0],
    calc: calculateCheckpoints(acft, state.activeRwy),
  }));

  summaryText.textContent = `${computedList.length} aircraft in scenario • Active Runway: RWY ${state.activeRwy}`;

  tbody.innerHTML = "";

  computedList.forEach((item) => {
    const { acft, wpt, calc } = item;

    // Check if another aircraft has an Established time within < 3 minutes
    const conflicts = computedList.filter(
      (other) =>
        other.acft.id !== acft.id &&
        Math.abs((other.calc.tEst % 60) - (calc.tEst % 60)) < 3 &&
        Math.abs(other.calc.tEst - calc.tEst) < 3
    );

    const conflictHtml =
      conflicts.length > 0
        ? `<div class="conflict-tag">⚠️ ${conflicts
            .map((c) => `${Math.abs(c.calc.tEst - calc.tEst)}m w/ ${c.acft.callsign}`)
            .join(", ")}</div>`
        : "";

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td class="callsign-cell">${acft.callsign}</td>
      <td class="wpt-cell">
        ${wpt.name}
        <span class="wpt-sub">${wpt.airway} • ${wpt.radial} • ${wpt.fl}</span>
      </td>
      <td>
        <button type="button" class="badge ${
          calc.straightIn ? "badge-straight" : "badge-normal"
        }" data-toggle-mode="${acft.id}" title="Click to toggle Straight-In / Normal">
          ${calc.straightIn ? "⚡ STRAIGHT-IN" : "📐 NORMAL"}
        </button>
      </td>
      <td class="time-cell">
        ${formatTime(calc.tInit, calc.hasHour)}
        <span class="cell-action" style="color: var(--text-muted)">@ ${calc.dist} NM</span>
      </td>
      <td class="time-cell ${calc.straightIn ? "cell-ils" : ""}">
        ${formatTime(calc.t25, calc.hasHour)}
        <span class="cell-action ${calc.straightIn ? "cell-ils" : ""}">
          ${calc.straightIn ? "⚡ Clear ILS" : "Ask 10 NM"}
        </span>
      </td>
      <td class="time-cell ${calc.straightIn ? "cell-est" : "cell-ils"}">
        ${formatTime(calc.t10, calc.hasHour)}
        <span class="cell-action ${calc.straightIn ? "cell-est" : "cell-ils"}">
          ${calc.straightIn ? "✅ Established / TWR" : "🔓 Clear ILS"}
        </span>
      </td>
      <td class="time-cell">
        ${calc.straightIn ? `<span style="color:var(--text-muted)">—</span>` : formatTime(calc.tVor, calc.hasHour)}
        ${calc.straightIn ? "" : `<span class="cell-action" style="color: var(--text-muted)">Overhead (+2m)</span>`}
      </td>
      <td class="time-cell">
        ${calc.straightIn ? `<span style="color:var(--text-muted)">—</span>` : formatTime(calc.tFix, calc.hasHour)}
        ${
          calc.straightIn
            ? ""
            : `<span class="cell-action" style="color: var(--text-muted)">${
                calc.holdMins > 0 ? `+2m (+${calc.holdMins}m hold)` : "Start 5m turn"
              }</span>`
        }
      </td>
      <td class="time-cell cell-est">
        ${formatTime(calc.tEst, calc.hasHour)}
        <span class="cell-action cell-est">✅ TWR 118.1</span>
        ${conflictHtml}
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

    tbody.appendChild(tr);
  });

  // Wire up table buttons
  tbody.querySelectorAll("[data-del-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-del-id"));
      state.aircraftList = state.aircraftList.filter((a) => a.id !== id);
      saveState();
      renderScenarioBoard();
    });
  });

  tbody.querySelectorAll("[data-hold-id]").forEach((btn) => {
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

  tbody.querySelectorAll("[data-toggle-mode]").forEach((btn) => {
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

  renderPositionLookup(computedList);
  renderChronologicalFeed(computedList);
}

// Render "Where is every aircraft at time T?"
function renderPositionLookup(computedList) {
  const listEl = document.getElementById("positionSnapshotList");
  if (computedList.length === 0) {
    listEl.innerHTML = `<div class="snapshot-item" style="color:var(--text-muted)">Add aircraft to inspect their positions at any time.</div>`;
    return;
  }

  const parsedQuery = parseTimeInput(state.lookupTimeRaw);
  const queryMins = parsedQuery.totalMinutes;

  listEl.innerHTML = "";
  computedList.forEach(({ acft, wpt, calc }) => {
    // If aircraft uses HH:MM and user typed a 1-2 digit minute in lookup, match the aircraft's base hour
    let effectiveQuery = queryMins;
    if (calc.hasHour && !parsedQuery.hasHour) {
      const baseHour = Math.floor(calc.tInit / 60);
      effectiveQuery = baseHour * 60 + queryMins;
    }

    const pos = estimatePositionAtTime(acft, calc, effectiveQuery);
    const item = document.createElement("div");
    item.className = "snapshot-item";
    item.innerHTML = `
      <div class="snapshot-left">
        <span class="callsign-cell">${acft.callsign}</span>
        <span class="badge ${calc.straightIn ? "badge-straight" : "badge-normal"}">${wpt.name}</span>
      </div>
      <div class="snapshot-status" style="color: ${pos.color}">${pos.text}</div>
    `;
    listEl.appendChild(item);
  });
}

// Render Chronological Action Feed
function renderChronologicalFeed(computedList) {
  const feedEl = document.getElementById("chronologicalFeed");
  if (computedList.length === 0) {
    feedEl.innerHTML = `<div class="timeline-item" style="color:var(--text-muted)">Chronological timeline will appear here as you add aircraft.</div>`;
    return;
  }

  const events = [];

  computedList.forEach(({ acft, wpt, calc }) => {
    events.push({
      time: calc.tInit,
      hasHour: calc.hasHour,
      callsign: acft.callsign,
      label: `Reports <strong>${calc.dist} NM ${wpt.name}</strong> (${wpt.fl}) → Instruct report 25 NM`,
      color: "var(--text-main)",
    });

    if (calc.t25 !== null && calc.t25 > calc.tInit) {
      events.push({
        time: calc.t25,
        hasHour: calc.hasHour,
        callsign: acft.callsign,
        label: calc.straightIn
          ? `Reports <strong>25 NM ${wpt.name}</strong> → <span style="color:var(--accent-amber);font-weight:700">⚡ CLEAR FOR ILS (Straight-In RWY ${state.activeRwy})</span>`
          : `Reports <strong>25 NM ${wpt.name}</strong> → Instruct report 10 NM`,
        color: calc.straightIn ? "var(--accent-amber)" : "var(--accent-blue)",
      });
    }

    if (calc.straightIn) {
      events.push({
        time: calc.tEst,
        hasHour: calc.hasHour,
        callsign: acft.callsign,
        label: `At <strong>10 NM ${wpt.name}</strong> → <span style="color:var(--accent-green);font-weight:700">✅ FULL ESTABLISHED • Send to TWR (118.1)</span>`,
        color: "var(--accent-green)",
      });
    } else {
      events.push({
        time: calc.t10,
        hasHour: calc.hasHour,
        callsign: acft.callsign,
        label: `Reports <strong>10 NM ${wpt.name}</strong> → <span style="color:var(--accent-amber);font-weight:700">🔓 CLEAR FOR ILS</span>`,
        color: "var(--accent-amber)",
      });
      events.push({
        time: calc.tVor,
        hasHour: calc.hasHour,
        callsign: acft.callsign,
        label: `Overhead <strong>AYT VOR</strong> → Outbound to 10 DME FIX`,
        color: "var(--text-muted)",
      });
      events.push({
        time: calc.tFix,
        hasHour: calc.hasHour,
        callsign: acft.callsign,
        label: `At <strong>10 DME FIX</strong> → Begins 5-min ILS turn`,
        color: "var(--accent-purple)",
      });
      events.push({
        time: calc.tEst,
        hasHour: calc.hasHour,
        callsign: acft.callsign,
        label: `<span style="color:var(--accent-green);font-weight:700">✅ FULL ESTABLISHED • Send to TWR (118.1)</span>`,
        color: "var(--accent-green)",
      });
    }
  });

  // Sort chronologically by minute
  events.sort((a, b) => a.time - b.time);

  feedEl.innerHTML = "";
  events.forEach((ev) => {
    const div = document.createElement("div");
    div.className = "timeline-item";
    div.innerHTML = `
      <div class="timeline-time" style="color:${ev.color}">${formatTime(ev.time, ev.hasHour)}</div>
      <div class="timeline-desc"><strong>${ev.callsign}</strong>: ${ev.label}</div>
    `;
    feedEl.appendChild(div);
  });
}

// Initialize Event Listeners
function initApp() {
  loadSavedState();

  // Active Runway Toggle
  const btnRwy36 = document.getElementById("btnRwy36");
  const btnRwy18 = document.getElementById("btnRwy18");

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
    const callsign =
      state.inputCallsign.trim().toUpperCase() || `ACFT ${state.nextId}`;

    state.aircraftList.push({
      id: state.nextId++,
      callsign,
      wptId: state.selectedWpt,
      dist: Number(inputDist.value) || 60,
      timeRaw: inputTime.value.trim() || "00",
      mode: state.approachMode,
      holdMins: 0,
    });

    // Reset callsign field for quick next entry
    state.inputCallsign = "";
    inputCallsign.value = "";

    saveState();
    renderLivePreview();
    renderScenarioBoard();
  });

  // Scenario Sort & Clear Buttons
  document.getElementById("btnSortByEst").addEventListener("click", () => {
    state.aircraftList.sort((a, b) => {
      const ca = calculateCheckpoints(a, state.activeRwy);
      const cb = calculateCheckpoints(b, state.activeRwy);
      return ca.tEst - cb.tEst;
    });
    saveState();
    renderScenarioBoard();
  });

  document.getElementById("btnSortByInit").addEventListener("click", () => {
    state.aircraftList.sort((a, b) => {
      const ca = calculateCheckpoints(a, state.activeRwy);
      const cb = calculateCheckpoints(b, state.activeRwy);
      return ca.tInit - cb.tInit;
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

  updateRwyUI();
}

document.addEventListener("DOMContentLoaded", initApp);
