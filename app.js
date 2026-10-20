// AYT TMA Radarless Approach Calculator & Master Scenario Solver
// Hardcoded speed: 5 NM / 1 minute (300 kt GS)
// Chart scale: 4.2 px per NM from center (430, 430)

const SPEED_NM_PER_MIN = 5;
const SVG_CENTER_X = 430;
const SVG_CENTER_Y = 430;
const PX_PER_NM = 4.2;

const WAYPOINTS = [
  {
    id: "DERYA",
    name: "DERYA",
    entryWpt: "TOMBİ",
    airway: "VA-16",
    radial: "R-170",
    deg: 170,
    fl: "FL070",
    meaFt: 7000,
    msaFt: 3000,
    defaultArrFl: 90,
    defaultDepFl: 110,
    straightInRwy: "36",
  },
  {
    id: "KUMRU",
    name: "KUMRU",
    entryWpt: "KFK",
    airway: "VA-16",
    radial: "R-350",
    deg: 350,
    fl: "FL120",
    meaFt: 12000,
    msaFt: 10000,
    defaultArrFl: 140,
    defaultDepFl: 140,
    straightInRwy: "18",
  },
  {
    id: "BRONZ",
    name: "BRONZ",
    entryWpt: "CRD",
    airway: "R-55",
    radial: "R-310",
    deg: 310,
    fl: "FL110",
    meaFt: 11000,
    msaFt: 10000,
    defaultArrFl: 130,
    defaultDepFl: 130,
    straightInRwy: null,
  },
  {
    id: "ALPAY",
    name: "ALPAY",
    entryWpt: "W-79",
    airway: "W-79",
    radial: "R-270",
    deg: 270,
    fl: "FL120",
    meaFt: 12000,
    msaFt: 12000,
    defaultArrFl: 140,
    defaultDepFl: 140,
    straightInRwy: null,
  },
  {
    id: "DAMLA",
    name: "DAMLA",
    entryWpt: "HİSAR",
    airway: "W-77",
    radial: "R-030",
    deg: 30,
    fl: "FL130",
    meaFt: 13000,
    msaFt: 9000,
    defaultArrFl: 150,
    defaultDepFl: 150,
    straightInRwy: null,
  },
  {
    id: "KONAK",
    name: "KONAK",
    entryWpt: "MUT",
    airway: "R-55",
    radial: "R-090",
    deg: 90,
    fl: "FL130",
    meaFt: 13000,
    msaFt: 9000,
    defaultArrFl: 150,
    defaultDepFl: 150,
    straightInRwy: null,
  },
  {
    id: "MANAV",
    name: "MANAV",
    entryWpt: "DOREN",
    airway: "W-83",
    radial: "R-130",
    deg: 130,
    fl: "FL070",
    meaFt: 7000,
    msaFt: 3000,
    defaultArrFl: 90,
    defaultDepFl: 110,
    straightInRwy: null,
  },
];

// Application State
const state = {
  activeView: "calc", // 'calc' | 'chart' | 'timeline'
  activeRwy: "36",
  flightType: "ARR", // 'ARR' | 'DEP'
  selectedWpt: "BRONZ",
  selectedDist: 60,
  selectedFl: 130,
  inputTimeRaw: "00",
  inputCallsign: "",
  approachMode: "auto", // 'auto' | 'normal' | 'straight'
  lookupTimeRaw: "00",
  aircraftList: [],
  nextId: 1,
  playInterval: null,
};

function loadSavedState() {
  try {
    const saved = localStorage.getItem("ayt_radarsiz_state_v3") || localStorage.getItem("ayt_radarsiz_state_v2");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.activeRwy) state.activeRwy = parsed.activeRwy;
      if (Array.isArray(parsed.aircraftList)) {
        state.aircraftList = parsed.aircraftList.map((a) => {
          const wpt = WAYPOINTS.find((w) => w.id === a.wptId) || WAYPOINTS[0];
          return {
            ...a,
            type: a.type || "ARR",
            fl: a.fl || (a.type === "DEP" ? wpt.defaultDepFl : wpt.defaultArrFl),
          };
        });
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
      "ayt_radarsiz_state_v3",
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

// Convert user FL or altitude number to feet
function flInputToFeet(val) {
  const n = Number(val) || 0;
  if (n <= 0) return 10000;
  if (n <= 25) return n * 1000; // e.g. 3 -> 3000', 9 -> 9000', 12 -> 12000'
  if (n <= 500) return n * 100; // e.g. 70 -> 7000', 120 -> 12000', 130 -> 13000'
  return n; // e.g. 9000 -> 9000'
}

// Format feet as ATC altitude / Flight Level string
function formatAlt(feet) {
  const f = Math.round(Number(feet) || 0);
  if (f >= 11000) {
    return `FL${Math.round(f / 100)}`;
  }
  if (f === 7000) {
    return `FL070 (7,000')`;
  }
  return `${f.toLocaleString("en-US")}'`;
}

function formatAltShort(feet) {
  const f = Math.round(Number(feet) || 0);
  if (f >= 11000) return `FL${Math.round(f / 100)}`;
  return `${f}'`;
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

function denormalizeTime(normMins, hasHour, refHour) {
  if (!hasHour && refHour !== null && normMins >= refHour * 60) {
    return normMins - refHour * 60;
  }
  return normMins;
}

// Base Arrival Checkpoints (before EAT sequencing)
function calculateArrivalCheckpoints({ wptId, dist, timeRaw, mode, holdMins = 0, fl }, activeRwy) {
  const wpt = WAYPOINTS.find((w) => w.id === wptId) || WAYPOINTS[0];
  const parsedTime = parseTimeInput(timeRaw);
  const tInit = parsedTime.totalMinutes;
  const hasHour = parsedTime.hasHour;
  const straightIn = isAircraftStraightIn(wptId, mode, activeRwy);
  const d = Number(dist) || 60;
  const hold = Number(holdMins) || 0;
  const initAltFt = flInputToFeet(fl || wpt.defaultArrFl);

  const t25 = d >= 25 ? tInit + (d - 25) / SPEED_NM_PER_MIN : null;
  const t15 = d >= 15 ? tInit + (d - 15) / SPEED_NM_PER_MIN : null;
  const t10 = d >= 10 ? tInit + (d - 10) / SPEED_NM_PER_MIN : tInit;
  const tRadialZero = tInit + d / SPEED_NM_PER_MIN;

  let tVor = null;
  let tFixBase = null;
  let tFix = null;
  let tEstBase = null;
  let tEst = null;
  let tClearBase = null;

  if (straightIn) {
    tClearBase = t25 !== null ? t25 : tInit;
    tEstBase = t10;
    tEst = t10 + hold;
  } else {
    tClearBase = t10;
    tVor = t10 + 2;
    tFixBase = tVor + 2;
    tFix = tFixBase + hold;
    tEstBase = tFixBase + 5;
    tEst = tFix + 5;
  }

  return {
    wptId,
    dist: d,
    hasHour,
    straightIn,
    holdMins: hold,
    initAltFt,
    tInit,
    t25,
    t15,
    t10,
    tVor,
    tFixBase,
    tFix,
    tEstBase,
    tEst,
    tClearBase,
    tRadialZero,
  };
}

// Departure Checkpoints Calculation (Starts at 0 NM at depTime, flies outbound at 5 NM / 1 min)
function calculateDepartureCheckpoints({ wptId, timeRaw, fl }) {
  const wpt = WAYPOINTS.find((w) => w.id === wptId) || WAYPOINTS[0];
  const parsedTime = parseTimeInput(timeRaw);
  const tDep = parsedTime.totalMinutes;
  const hasHour = parsedTime.hasHour;
  const reqAltFt = flInputToFeet(fl || wpt.defaultDepFl);

  return {
    wptId,
    hasHour,
    reqAltFt,
    tDep,
    t10: tDep + 2, // 10 NM (+2m) -> Must reach >= MSA before 10 NM
    t15: tDep + 3, // 15 NM (+3m)
    t25: tDep + 5, // 25 NM (+5m) -> Must reach >= MEA before 25 NM
    t50: tDep + 10,
    t60: tDep + 12,
  };
}

// ============================================================================
// MASTER SCENARIO SOLVER ENGINE
// Solves:
// 1. Optimal Landing Sequence & EATs (Expected Approach Times)
// 2. Opposite-Direction Departure <-> Arrival Crossing & Altitude Locks
// 3. VOR <15 NM Convergence 1,000 ft Separation & Altitude Crossing Constraints
// ============================================================================
function solveScenario(aircraftList, activeRwy) {
  const refHour = getReferenceBaseHour(aircraftList);
  const useHasHour = refHour !== null;

  const arrivalsRaw = aircraftList.filter((a) => a.type !== "DEP");
  const departuresRaw = aircraftList.filter((a) => a.type === "DEP");

  const computedArrivals = arrivalsRaw.map((acft) => {
    const wpt = WAYPOINTS.find((w) => w.id === acft.wptId) || WAYPOINTS[0];
    const calc = calculateArrivalCheckpoints(acft, activeRwy);
    return {
      acft,
      wpt,
      calc,
      normInit: normalizeTime(calc.tInit, calc.hasHour, refHour),
      norm25: calc.t25 !== null ? normalizeTime(calc.t25, calc.hasHour, refHour) : null,
      norm15: calc.t15 !== null ? normalizeTime(calc.t15, calc.hasHour, refHour) : null,
      norm10: normalizeTime(calc.t10, calc.hasHour, refHour),
      normVor: calc.tVor !== null ? normalizeTime(calc.tVor, calc.hasHour, refHour) : null,
      normFixBase: calc.tFixBase !== null ? normalizeTime(calc.tFixBase, calc.hasHour, refHour) : null,
      normClearBase: normalizeTime(calc.tClearBase, calc.hasHour, refHour),
      normRadialZero: normalizeTime(calc.tRadialZero, calc.hasHour, refHour),
    };
  });

  const computedDepartures = departuresRaw.map((acft) => {
    const wpt = WAYPOINTS.find((w) => w.id === acft.wptId) || WAYPOINTS[0];
    const calc = calculateDepartureCheckpoints(acft);
    return {
      acft,
      wpt,
      calc,
      normDep: normalizeTime(calc.tDep, calc.hasHour, refHour),
      norm10: normalizeTime(calc.t10, calc.hasHour, refHour),
      norm25: normalizeTime(calc.t25, calc.hasHour, refHour),
      norm60: normalizeTime(calc.t60, calc.hasHour, refHour),
    };
  });

  // --------------------------------------------------------------------------
  // STEP 1: Opposite-Direction Departure <-> Arrival Conflicts (Same Waypoint)
  // --------------------------------------------------------------------------
  const depArrConflicts = [];
  const arrDepLocks = new Map(); // arrId -> list of lock instructions
  const depArrLocks = new Map(); // depId -> list of lock instructions

  computedDepartures.forEach((depItem) => {
    const matchingArrs = computedArrivals.filter(
      (arrItem) => arrItem.acft.wptId === depItem.acft.wptId
    );

    matchingArrs.forEach((arrItem) => {
      const wpt = depItem.wpt;
      const tDepNorm = depItem.normDep;
      const tArrZeroNorm = arrItem.normRadialZero;

      const tCrossNorm = (tDepNorm + tArrZeroNorm) / 2;
      const dCross = +(SPEED_NM_PER_MIN * (tCrossNorm - tDepNorm)).toFixed(1);
      const isValidInboundConflict = dCross >= 0 && dCross <= Math.max(arrItem.calc.dist, 60);

      let resolutionText = "";
      let arrRestrictedAltFt = null;
      let depRestrictedAltFt = null;
      let zone = "";

      if (isValidInboundConflict) {
        if (dCross >= 25) {
          // Conflict at or outside 25 NM (e.g. 30 NM):
          // Dep must be at MEA before 25 NM -> Dep climbs to MEA, Arr descends only to MEA + 1000'
          zone = "≥ 25 NM (Enroute / MEA Zone)";
          depRestrictedAltFt = wpt.meaFt;
          arrRestrictedAltFt = wpt.meaFt + 1000;
          resolutionText = `Conflict at ${dCross} NM (≥25 NM): Climb ${depItem.acft.callsign} to ${formatAlt(
            depRestrictedAltFt
          )} (MEA before 25 NM) and descend ${arrItem.acft.callsign} only to ${formatAlt(
            arrRestrictedAltFt
          )}. After passing at ${formatTime(
            denormalizeTime(tCrossNorm, useHasHour, refHour),
            useHasHour
          )}, continue climb/descent.`;
        } else if (dCross >= 10) {
          // Conflict between 10 NM and 25 NM:
          zone = "10–25 NM (MSA Transition Zone)";
          if (wpt.msaFt < wpt.meaFt) {
            depRestrictedAltFt = wpt.msaFt;
            arrRestrictedAltFt = wpt.msaFt + 1000;
            resolutionText = `Conflict at ${dCross} NM (10–25 NM): Climb ${depItem.acft.callsign} to ${formatAlt(
              depRestrictedAltFt
            )} (MSA before 10 NM) and hold ${arrItem.acft.callsign} at ${formatAlt(
              arrRestrictedAltFt
            )} until passing at ${formatTime(
              denormalizeTime(tCrossNorm, useHasHour, refHour),
              useHasHour
            )}; then climb ${depItem.acft.callsign} to ${formatAlt(wpt.meaFt)} before 25 NM.`;
          } else {
            // e.g. ALPAY where MSA = 12,000' and MEA = FL120
            depRestrictedAltFt = wpt.meaFt;
            arrRestrictedAltFt = wpt.meaFt + 1000;
            resolutionText = `Conflict at ${dCross} NM (MSA = MEA = ${formatAlt(
              wpt.meaFt
            )}): Climb ${depItem.acft.callsign} to ${formatAlt(
              depRestrictedAltFt
            )} before 10 NM and hold ${arrItem.acft.callsign} at ${formatAlt(
              arrRestrictedAltFt
            )} until passing at ${formatTime(
              denormalizeTime(tCrossNorm, useHasHour, refHour),
              useHasHour
            )}.`;
          }
        } else {
          // Conflict inside 10 NM (<10 NM)
          zone = "< 10 NM (Inner Approach / MSA Zone)";
          depRestrictedAltFt = wpt.msaFt;
          arrRestrictedAltFt = wpt.msaFt + 1000;
          resolutionText = `Conflict at ${dCross} NM (<10 NM): Keep ${arrItem.acft.callsign} at ${formatAlt(
            arrRestrictedAltFt
          )} and ${depItem.acft.callsign} at ${formatAlt(
            depRestrictedAltFt
          )} until passing at ${formatTime(
            denormalizeTime(tCrossNorm, useHasHour, refHour),
            useHasHour
          )}.`;
        }

        if (!arrDepLocks.has(arrItem.acft.id)) arrDepLocks.set(arrItem.acft.id, []);
        arrDepLocks.get(arrItem.acft.id).push({
          depAcft: depItem.acft,
          tCrossNorm,
          dCross,
          arrRestrictedAltFt,
          depRestrictedAltFt,
          resolutionText,
        });

        if (!depArrLocks.has(depItem.acft.id)) depArrLocks.set(depItem.acft.id, []);
        depArrLocks.get(depItem.acft.id).push({
          arrAcft: arrItem.acft,
          tCrossNorm,
          dCross,
          arrRestrictedAltFt,
          depRestrictedAltFt,
          resolutionText,
        });
      }

      depArrConflicts.push({
        depAcft: depItem.acft,
        arrAcft: arrItem.acft,
        wpt,
        tCrossNorm,
        displayTime: formatTime(denormalizeTime(tCrossNorm, useHasHour, refHour), useHasHour),
        dCross,
        zone,
        isValidInboundConflict,
        arrRestrictedAltFt,
        depRestrictedAltFt,
        resolutionText,
        tDepFormatted: formatTime(depItem.calc.tDep, depItem.calc.hasHour),
        tArrZeroFormatted: formatTime(arrItem.calc.tRadialZero, arrItem.calc.hasHour),
        tArrInitFormatted: formatTime(arrItem.calc.tInit, arrItem.calc.hasHour),
        arrDist: arrItem.calc.dist,
      });
    });
  });

  // --------------------------------------------------------------------------
  // STEP 2: Arrival Sequencing & Expected Approach Time (EAT) Calculation
  // --------------------------------------------------------------------------
  // Order arrivals by their natural ILS clearance point (tie-breaker: lower MSA first to avoid altitude crossing, then id)
  const sequencedArrivals = [...computedArrivals].sort((a, b) => {
    if (a.normClearBase !== b.normClearBase) return a.normClearBase - b.normClearBase;
    if (a.wpt.msaFt !== b.wpt.msaFt) return a.wpt.msaFt - b.wpt.msaFt;
    return a.acft.id - b.acft.id;
  });

  const eatMap = new Map();
  let prevEstNorm = null;
  let prevAcft = null;

  sequencedArrivals.forEach((item, index) => {
    const { acft, calc } = item;
    const manualHold = calc.holdMins || 0;

    let willDelay = false;
    let eatNorm = null;
    let autoHoldMins = 0;
    let effectiveFixNorm = item.normFixBase;
    let effectiveEstNorm = null;
    let clearancePhaseNote = "";

    if (prevEstNorm !== null && item.normClearBase < prevEstNorm) {
      // Another plane is already cleared and NOT YET ESTABLISHED!
      willDelay = true;
      eatNorm = prevEstNorm;

      if (calc.straightIn) {
        if (eatNorm <= item.norm10) {
          // Cleared before reaching 10 NM, no holding needed
          autoHoldMins = 0;
          effectiveEstNorm = item.norm10 + manualHold;
          const dmeAtEat = +(10 + (item.norm10 - eatNorm) * SPEED_NM_PER_MIN).toFixed(1);
          clearancePhaseNote = `Gets ILS clearance at EAT (${formatTime(
            denormalizeTime(eatNorm, calc.hasHour, refHour),
            calc.hasHour
          )}) at ${dmeAtEat} NM — No hold needed`;
        } else {
          // Holds at 10 NM (10 DME FIX) until EAT, then +5m to establish
          autoHoldMins = +(eatNorm - item.norm10).toFixed(1);
          effectiveEstNorm = eatNorm + 5 + manualHold;
          clearancePhaseNote = `Holds ${autoHoldMins}m at 10 DME FIX until EAT (${formatTime(
            denormalizeTime(eatNorm, calc.hasHour, refHour),
            calc.hasHour
          )}), then +5m to Establish`;
        }
      } else {
        // Normal Approach:
        // Compare EAT with unheld 10 DME FIX time (t10 + 4)
        if (eatNorm <= item.normFixBase) {
          // Like the DAMLA @ 10:08 + Straight-in @ 10:10 example!
          // Plane gets cleared at EAT while inbound to VOR or outbound to 10 DME FIX -> NO HOLD occurs!
          autoHoldMins = 0;
          effectiveFixNorm = item.normFixBase + manualHold;
          effectiveEstNorm = effectiveFixNorm + 5;
          if (eatNorm <= item.normVor) {
            const dmeToVor = +((item.normVor - eatNorm) * SPEED_NM_PER_MIN).toFixed(1);
            clearancePhaseNote = `EAT is ${formatTime(
              denormalizeTime(eatNorm, calc.hasHour, refHour),
              calc.hasHour
            )} (at ${
              dmeToVor === 0 ? "AYT VOR" : `${dmeToVor} NM inbound to VOR`
            }) — No hold occurs!`;
          } else {
            const dmeOut = +((eatNorm - item.normVor) * SPEED_NM_PER_MIN).toFixed(1);
            clearancePhaseNote = `EAT is ${formatTime(
              denormalizeTime(eatNorm, calc.hasHour, refHour),
              calc.hasHour
            )} (at ${dmeOut} NM outbound to 10 DME FIX) — No hold occurs!`;
          }
        } else {
          // EAT > normFixBase -> Holds at 10 DME FIX until EAT, then takes 5 mins after clearance to full establish!
          autoHoldMins = +(eatNorm - item.normFixBase).toFixed(1);
          effectiveFixNorm = eatNorm + manualHold;
          effectiveEstNorm = effectiveFixNorm + 5;
          clearancePhaseNote = `Holds ${autoHoldMins}m at 10 DME FIX until EAT (${formatTime(
            denormalizeTime(eatNorm, calc.hasHour, refHour),
            calc.hasHour
          )}), then +5m to full establish`;
        }
      }
    } else {
      // No EAT delay from preceding aircraft
      willDelay = false;
      eatNorm = null;
      autoHoldMins = 0;
      if (calc.straightIn) {
        effectiveEstNorm = item.norm10 + manualHold;
        clearancePhaseNote = `Cleared Straight-In ILS at 25 NM`;
      } else {
        effectiveFixNorm = item.normFixBase + manualHold;
        effectiveEstNorm = effectiveFixNorm + 5;
        clearancePhaseNote = `Cleared ILS at 10 NM`;
      }
    }

    const eatDisplay =
      eatNorm !== null
        ? formatTime(denormalizeTime(eatNorm, calc.hasHour, refHour), calc.hasHour)
        : "—";
    const effectiveFixDisplay =
      effectiveFixNorm !== null
        ? formatTime(denormalizeTime(effectiveFixNorm, calc.hasHour, refHour), calc.hasHour)
        : "—";
    const effectiveEstDisplay = formatTime(
      denormalizeTime(effectiveEstNorm, calc.hasHour, refHour),
      calc.hasHour
    );

    eatMap.set(acft.id, {
      seqNum: index + 1,
      willDelay,
      blockedBy: willDelay ? prevAcft : null,
      eatNorm,
      eatDisplay,
      autoHoldMins,
      effectiveFixNorm,
      effectiveFixDisplay,
      effectiveEstNorm,
      effectiveEstDisplay,
      clearancePhaseNote,
    });

    prevEstNorm = effectiveEstNorm;
    prevAcft = item;
  });

  // --------------------------------------------------------------------------
  // STEP 3: VOR <15 NM Convergence & Altitude Crossing Separation Constraints
  // --------------------------------------------------------------------------
  const vorSepConstraints = [];
  const perAircraftVorNotes = new Map(); // acftId -> array of constraint objects

  for (let i = 0; i < sequencedArrivals.length; i++) {
    for (let j = i + 1; j < sequencedArrivals.length; j++) {
      const first = sequencedArrivals[i];
      const second = sequencedArrivals[j];
      const firstEat = eatMap.get(first.acft.id);
      const secondEat = eatMap.get(second.acft.id);

      // Check if both aircraft are active in the approach/convergence zone around the same time:
      // Specifically, if second reaches 25 NM before first is Established
      const secondAt25 = second.norm25 ?? second.normInit;
      if (secondAt25 < firstEat.effectiveEstNorm) {
        const w1 = first.wpt;
        const w2 = second.wpt;
        const sameWpt = w1.id === w2.id;

        let type = "";
        let firstInstruction = "";
        let secondInstruction = "";
        let summaryText = "";
        let secondAssignedMsaFt = w2.msaFt;
        let firstMustReachBefore15 = false;

        if (sameWpt) {
          // Following on the SAME airway: must keep 1,000 ft vertical separation at all times
          type = "SAME-AIRWAY TRAIL";
          secondAssignedMsaFt = Math.max(w2.msaFt, w1.msaFt + 1000);
          firstInstruction = `Descend to ${formatAlt(w1.meaFt)} (MEA), then ${formatAlt(
            w1.msaFt
          )} (MSA) at 25 NM (reach before 15 NM).`;
          secondInstruction = `Trailing ${first.acft.callsign} on ${
            w1.name
          }: Maintain ≥1,000' above ${first.acft.callsign} (${formatAlt(
            w2.meaFt + 1000
          )} before 25 NM, then ${formatAlt(secondAssignedMsaFt)} at 25 NM until ${
            first.acft.callsign
          } descends to 3,000').`;
          summaryText = `Same airway (${w1.name}): ${second.acft.callsign} must stay ≥1,000' above ${first.acft.callsign} (${formatAlt(
            secondAssignedMsaFt
          )} at 25 NM).`;
        } else if (w1.meaFt >= w2.meaFt && w1.msaFt < w2.msaFt) {
          // ALTITUDE CROSSING CASE! (Exact DAMLA #1 [130 -> 9000'] vs KUMRU #2 [120 -> 10000'] case!)
          type = "ALTITUDE CROSSING (<15 NM)";
          firstMustReachBefore15 = true;
          firstInstruction = `⚠️ CROSSING ALTITUDES w/ ${second.acft.callsign}: At 25 NM, descend to ${formatAlt(
            w1.msaFt
          )} — MUST REACH & MAINTAIN ${formatAlt(w1.msaFt)} BEFORE 15 NM (${formatTime(
            first.calc.t15,
            first.calc.hasHour
          )})!`;
          secondInstruction = `At 25 NM, descend to ${formatAlt(
            w2.msaFt
          )} (MSA) and maintain ${formatAlt(w2.msaFt)} before 15 NM (1,000' above ${
            first.acft.callsign
          } at ${formatAlt(w1.msaFt)}).`;
          summaryText = `${first.acft.callsign} (${w1.name}: MEA ${formatAltShort(
            w1.meaFt
          )} → MSA ${formatAltShort(w1.msaFt)}) is #${firstEat.seqNum} ahead of ${
            second.acft.callsign
          } (${w2.name}: MEA ${formatAltShort(w2.meaFt)} → MSA ${formatAltShort(
            w2.msaFt
          )}). Because their altitudes cross, issue constraint to ${
            first.acft.callsign
          }: "Maintain ${formatAlt(w1.msaFt)} BEFORE 15 NM"!`;
        } else if (w1.msaFt === w2.msaFt) {
          // Equal MSA on converging radials (e.g. DAMLA 9000' & KONAK 9000', or KUMRU 10000' & BRONZ 10000')
          type = "EQUAL MSA CONVERGENCE (<15 NM)";
          firstMustReachBefore15 = true;
          secondAssignedMsaFt = w1.msaFt + 1000;
          firstInstruction = `At 25 NM, descend to ${formatAlt(
            w1.msaFt
          )} (MSA) — reach before 15 NM.`;
          secondInstruction = `⚠️ VOR <15 NM SEP w/ ${first.acft.callsign}: Both waypoints have ${formatAlt(
            w1.msaFt
          )} MSA. At 25 NM, restrict descent to ${formatAlt(
            secondAssignedMsaFt
          )} before 15 NM (1,000' above ${first.acft.callsign}); descend to ${formatAlt(
            w2.msaFt
          )} / 4,000' after ${first.acft.callsign} descends to 3,000'.`;
          summaryText = `${first.acft.callsign} (${w1.name}) & ${second.acft.callsign} (${
            w2.name
          }) share ${formatAlt(w1.msaFt)} MSA. Hold ${second.acft.callsign} at ${formatAlt(
            secondAssignedMsaFt
          )} before 15 NM for 1,000' VOR separation.`;
        } else if (w1.msaFt > w2.msaFt) {
          // #1 has higher MSA than #2 (e.g. KUMRU #1 [10,000'] ahead of DAMLA #2 [9,000'])
          type = "INVERTED MSA SEQUENCE (<15 NM)";
          secondAssignedMsaFt = w1.msaFt + 1000;
          firstInstruction = `At 25 NM, descend to ${formatAlt(
            w1.msaFt
          )} (MSA) before 15 NM, then 3,000' at 10 NM ILS clearance.`;
          secondInstruction = `⚠️ #${firstEat.seqNum} ${first.acft.callsign} has higher MSA (${formatAlt(
            w1.msaFt
          )}). Keep ${second.acft.callsign} at ${formatAlt(
            secondAssignedMsaFt
          )} before 15 NM so ${first.acft.callsign} stays below; descend ${
            second.acft.callsign
          } to ${formatAlt(w2.msaFt)} once ${first.acft.callsign} is cleared ILS to 3,000'.`;
          summaryText = `#${firstEat.seqNum} ${first.acft.callsign} (${w1.name} MSA ${formatAlt(
            w1.msaFt
          )}) is ahead of #${secondEat.seqNum} ${second.acft.callsign} (${w2.name} MSA ${formatAlt(
            w2.msaFt
          )}). Restrict ${second.acft.callsign} to ${formatAlt(
            secondAssignedMsaFt
          )} before 15 NM until ${first.acft.callsign} descends to 3,000'.`;
        } else {
          // Naturally separated (w1.msaFt < w2.msaFt and w1.meaFt <= w2.meaFt)
          type = "NATURAL VERTICAL SEP (<15 NM)";
          firstMustReachBefore15 = true;
          firstInstruction = `At 25 NM, descend to ${formatAlt(
            w1.msaFt
          )} (MSA) before 15 NM.`;
          secondInstruction = `At 25 NM, descend to ${formatAlt(
            w2.msaFt
          )} (MSA) before 15 NM (naturally ≥1,000' above ${first.acft.callsign} at ${formatAlt(
            w1.msaFt
          )}).`;
          summaryText = `${first.acft.callsign} (${formatAlt(
            w1.msaFt
          )}) and ${second.acft.callsign} (${formatAlt(
            w2.msaFt
          )}) are naturally separated by ≥1,000' once ${first.acft.callsign} reaches ${formatAlt(
            w1.msaFt
          )} before 15 NM.`;
        }

        const constraintObj = {
          first,
          second,
          type,
          firstInstruction,
          secondInstruction,
          summaryText,
          secondAssignedMsaFt,
          firstMustReachBefore15,
        };

        vorSepConstraints.push(constraintObj);

        if (!perAircraftVorNotes.has(first.acft.id)) perAircraftVorNotes.set(first.acft.id, []);
        perAircraftVorNotes.get(first.acft.id).push({
          role: "lead",
          other: second.acft,
          text: firstInstruction,
          type,
        });

        if (!perAircraftVorNotes.has(second.acft.id)) perAircraftVorNotes.set(second.acft.id, []);
        perAircraftVorNotes.get(second.acft.id).push({
          role: "trail",
          other: first.acft,
          text: secondInstruction,
          assignedMsaFt: secondAssignedMsaFt,
          type,
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // STEP 4: Build Step-by-Step Solved Clearance Plan for Each Aircraft
  // --------------------------------------------------------------------------
  const aircraftPlans = new Map();

  sequencedArrivals.forEach((item) => {
    const { acft, wpt, calc } = item;
    const eatInfo = eatMap.get(acft.id);
    const depLocks = arrDepLocks.get(acft.id) || [];
    const vorNotes = perAircraftVorNotes.get(acft.id) || [];
    const steps = [];

    // 1. Initial Contact (60-50 NM) -> Descent to MEA (or restricted by Dep conflict >=25 NM)
    const highZoneDepLock = depLocks.find((l) => l.dCross >= 25);
    const midZoneDepLock = depLocks.find((l) => l.dCross >= 10 && l.dCross < 25);

    let enrouteTargetFt = wpt.meaFt;
    if (highZoneDepLock && highZoneDepLock.arrRestrictedAltFt > enrouteTargetFt) {
      enrouteTargetFt = highZoneDepLock.arrRestrictedAltFt;
      steps.push({
        timeNorm: item.normInit,
        timeStr: formatTime(calc.tInit, calc.hasHour),
        severity: "crit",
        text: `Reports ${calc.dist} NM ${wpt.name} (${formatAlt(
          calc.initAltFt
        )}): Descend only to <strong>${formatAlt(
          enrouteTargetFt
        )}</strong> (traffic <strong>${
          highZoneDepLock.depAcft.callsign
        }</strong> climbing to ${formatAlt(
          highZoneDepLock.depRestrictedAltFt
        )}; cross at <strong>${highZoneDepLock.dCross} NM @ ${formatTime(
          denormalizeTime(highZoneDepLock.tCrossNorm, calc.hasHour, refHour),
          calc.hasHour
        )}</strong>). Report 25 NM.`,
      });
      steps.push({
        timeNorm: highZoneDepLock.tCrossNorm,
        timeStr: formatTime(
          denormalizeTime(highZoneDepLock.tCrossNorm, calc.hasHour, refHour),
          calc.hasHour
        ),
        severity: "ok",
        text: `Passed outbound <strong>${highZoneDepLock.depAcft.callsign}</strong> at ${
          highZoneDepLock.dCross
        } NM → Descend to <strong>${formatAlt(wpt.meaFt)} (MEA)</strong>.`,
      });
    } else {
      steps.push({
        timeNorm: item.normInit,
        timeStr: formatTime(calc.tInit, calc.hasHour),
        severity: "normal",
        text: `Reports ${calc.dist} NM ${wpt.name} (${formatAlt(
          calc.initAltFt
        )}) → Descend to <strong>${formatAlt(wpt.meaFt)} (MEA)</strong>, report 25 NM.`,
      });
    }

    // 2. At 25 NM -> MSA & 15 NM VOR Constraints (or Straight-In ILS Clearance)
    const trailVorConstraint = vorNotes.find(
      (n) => n.role === "trail" && n.assignedMsaFt && n.assignedMsaFt > wpt.msaFt
    );
    const leadCrossingConstraint = vorNotes.find(
      (n) => n.role === "lead" && n.type.includes("CROSSING")
    );

    let msaTargetFt = wpt.msaFt;
    if (trailVorConstraint) {
      msaTargetFt = Math.max(msaTargetFt, trailVorConstraint.assignedMsaFt);
    }
    if (midZoneDepLock && midZoneDepLock.arrRestrictedAltFt > msaTargetFt) {
      msaTargetFt = midZoneDepLock.arrRestrictedAltFt;
    }

    if (calc.t25 !== null) {
      if (calc.straightIn) {
        if (!eatInfo.willDelay) {
          steps.push({
            timeNorm: item.norm25,
            timeStr: formatTime(calc.t25, calc.hasHour),
            severity: "ok",
            text: `At 25 NM ${wpt.name} → <strong>Clear Straight-In ILS RWY ${activeRwy}</strong>, descend to <strong>3,000'</strong>, report Established at 10 NM.`,
          });
        } else {
          steps.push({
            timeNorm: item.norm25,
            timeStr: formatTime(calc.t25, calc.hasHour),
            severity: "warn",
            text: `At 25 NM ${wpt.name} → Delayed by <strong>${
              eatInfo.blockedBy.acft.callsign
            }</strong>. Issue <strong>EAT ${
              eatInfo.eatDisplay
            }</strong>, descend to <strong>${formatAlt(
               Math.max(msaTargetFt, 4000)
            )}</strong>.`,
          });
        }
      } else {
        // Normal Approach at 25 NM
        let constraintNote = "";
        let sev = "normal";
        if (leadCrossingConstraint) {
          sev = "warn";
          constraintNote = ` — <strong>MUST REACH &amp; MAINTAIN ${formatAlt(
            msaTargetFt
          )} BEFORE 15 NM (${formatTime(calc.t15, calc.hasHour)})</strong> (crossing <strong>${
            leadCrossingConstraint.other.callsign
          }</strong>)!`;
        } else if (trailVorConstraint) {
          sev = "warn";
          constraintNote = ` — <strong>RESTRICT to ${formatAlt(
            msaTargetFt
          )} before 15 NM</strong> (1,000' above <strong>${
            trailVorConstraint.other.callsign
          }</strong>).`;
        } else if (midZoneDepLock) {
          sev = "crit";
          constraintNote = ` — <strong>HOLD AT ${formatAlt(
            msaTargetFt
          )} until passing outbound ${midZoneDepLock.depAcft.callsign} at ${
            midZoneDepLock.dCross
          } NM</strong>.`;
        } else {
          constraintNote = ` (reach before 15 NM @ ${formatTime(calc.t15, calc.hasHour)}).`;
        }

        steps.push({
          timeNorm: item.norm25,
          timeStr: formatTime(calc.t25, calc.hasHour),
          severity: sev,
          text: `At 25 NM ${wpt.name} → Descend to <strong>${formatAlt(
            msaTargetFt
          )}</strong>${constraintNote} Report 10 NM.`,
        });
      }
    }

    if (midZoneDepLock) {
      steps.push({
        timeNorm: midZoneDepLock.tCrossNorm,
        timeStr: formatTime(
          denormalizeTime(midZoneDepLock.tCrossNorm, calc.hasHour, refHour),
          calc.hasHour
        ),
        severity: "ok",
        text: `Passed outbound <strong>${midZoneDepLock.depAcft.callsign}</strong> at ${
          midZoneDepLock.dCross
        } NM → Descend to <strong>${formatAlt(wpt.msaFt)} (MSA)</strong>.`,
      });
    }

    // 3. At 10 NM & EAT / ILS Clearance
    if (!calc.straightIn) {
      if (!eatInfo.willDelay) {
        steps.push({
          timeNorm: item.norm10,
          timeStr: formatTime(calc.t10, calc.hasHour),
          severity: "ok",
          text: `At 10 NM ${wpt.name} → <strong>Clear ILS RWY ${activeRwy}</strong>, descend to <strong>3,000'</strong> (AYT VOR @ ${formatTime(
            calc.tVor,
            calc.hasHour
          )} → 10 DME FIX @ ${eatInfo.effectiveFixDisplay}).`,
        });
      } else {
        // Delayed: receives EAT at 10 NM
        steps.push({
          timeNorm: item.norm10,
          timeStr: formatTime(calc.t10, calc.hasHour),
          severity: "warn",
          text: `At 10 NM ${wpt.name} → Preceding <strong>${
            eatInfo.blockedBy.acft.callsign
          }</strong> not yet established. Issue <strong>EAT ${
            eatInfo.eatDisplay
          }</strong>, descend to <strong>4,000'</strong> (1,000' above approach traffic) and proceed via AYT VOR (${formatTime(
            calc.tVor,
            calc.hasHour
          )}) to 10 DME FIX.`,
        });

        steps.push({
          timeNorm: eatInfo.eatNorm,
          timeStr: eatInfo.eatDisplay,
          severity: "ok",
          text: `<strong>EAT ${eatInfo.eatDisplay} Reached</strong> (${
            eatInfo.blockedBy.acft.callsign
          } Established) → <strong>Clear ${
            acft.callsign
          } for ILS RWY ${activeRwy}</strong>, descend to <strong>3,000'</strong>! (${
            eatInfo.clearancePhaseNote
          })`,
        });
      }
    } else if (eatInfo.willDelay) {
      steps.push({
        timeNorm: eatInfo.eatNorm,
        timeStr: eatInfo.eatDisplay,
        severity: "ok",
        text: `<strong>EAT ${eatInfo.eatDisplay} Reached</strong> → <strong>Clear ${acft.callsign} Straight-In ILS RWY ${activeRwy}</strong>, descend to <strong>3,000'</strong>.`,
      });
    }

    // 4. Full Established -> Send to TWR
    steps.push({
      timeNorm: eatInfo.effectiveEstNorm,
      timeStr: eatInfo.effectiveEstDisplay,
      severity: "ok",
      text: `<strong>FULL ESTABLISHED ILS RWY ${activeRwy}</strong> → Contact <strong>AYT TWR 118.1</strong>.`,
    });

    aircraftPlans.set(acft.id, {
      seqNum: eatInfo.seqNum,
      acft,
      wpt,
      eatInfo,
      enrouteTargetFt,
      msaTargetFt,
      steps,
    });
  });

  // Departure Plans
  computedDepartures.forEach((depItem) => {
    const { acft, wpt, calc } = depItem;
    const locks = depArrLocks.get(acft.id) || [];
    const steps = [];

    if (locks.length > 0) {
      const firstLock = locks[0];
      steps.push({
        timeNorm: depItem.normDep,
        timeStr: formatTime(calc.tDep, calc.hasHour),
        severity: "crit",
        text: `Departs 0 NM toward ${wpt.name} (${wpt.entryWpt}): Reach <strong>≥${formatAlt(
          wpt.msaFt
        )} (MSA) before 10 NM (${formatTime(
          calc.t10,
          calc.hasHour
        )})</strong>. Stop climb at <strong>${formatAlt(
          firstLock.depRestrictedAltFt
        )}</strong> due to inbound <strong>${
          firstLock.arrAcft.callsign
        }</strong> (cross at <strong>${firstLock.dCross} NM @ ${formatTime(
          denormalizeTime(firstLock.tCrossNorm, calc.hasHour, refHour),
          calc.hasHour
        )}</strong>).`,
      });
      steps.push({
        timeNorm: firstLock.tCrossNorm,
        timeStr: formatTime(
          denormalizeTime(firstLock.tCrossNorm, calc.hasHour, refHour),
          calc.hasHour
        ),
        severity: "ok",
        text: `Passed inbound <strong>${firstLock.arrAcft.callsign}</strong> at ${
          firstLock.dCross
        } NM → Climb to <strong>${formatAlt(
          Math.max(wpt.meaFt, calc.reqAltFt)
        )}</strong> (ensure ≥${formatAlt(wpt.meaFt)} MEA before 25 NM @ ${formatTime(
          calc.t25,
          calc.hasHour
        )}).`,
      });
    } else {
      steps.push({
        timeNorm: depItem.normDep,
        timeStr: formatTime(calc.tDep, calc.hasHour),
        severity: "normal",
        text: `Departs 0 NM toward ${wpt.name} (${wpt.entryWpt}) → Climb to <strong>${formatAlt(
          wpt.msaFt
        )} (MSA) before 10 NM (${formatTime(
          calc.t10,
          calc.hasHour
        )})</strong>, <strong>${formatAlt(
          wpt.meaFt
        )} (MEA) before 25 NM (${formatTime(
          calc.t25,
          calc.hasHour
        )})</strong>, then <strong>${formatAlt(calc.reqAltFt)}</strong>.`,
      });
    }

    aircraftPlans.set(acft.id, {
      seqNum: "DEP",
      acft,
      wpt,
      steps,
    });
  });

  return {
    refHour,
    useHasHour,
    computedArrivals,
    computedDepartures,
    sequencedArrivals,
    eatMap,
    depArrConflicts,
    vorSepConstraints,
    aircraftPlans,
  };
}

// ============================================================================
// LIVE POSITION, ALTITUDE & SVG COORDINATE ESTIMATOR AT TIME T
// ============================================================================
function polarToSvg(dmeNm, deg) {
  const rad = (deg * Math.PI) / 180;
  const rPx = dmeNm * PX_PER_NM;
  return {
    x: +(SVG_CENTER_X + rPx * Math.sin(rad)).toFixed(1),
    y: +(SVG_CENTER_Y - rPx * Math.cos(rad)).toFixed(1),
  };
}

function getAircraftStateAtTime(item, solverData, queryNormMins) {
  const { acft, wpt, calc } = item;
  const plan = solverData.aircraftPlans.get(acft.id);

  if (acft.type === "DEP") {
    const tDep = item.normDep;
    if (queryNormMins < tDep) {
      const wait = +(tDep - queryNormMins).toFixed(1);
      return {
        visible: false,
        phase: "ground",
        dme: 0,
        altFt: 0,
        altStr: "GND",
        text: `On ground (Departs in ${wait}m)`,
        color: "var(--text-muted)",
      };
    }

    const elapsed = queryNormMins - tDep;
    const dme = +(elapsed * SPEED_NM_PER_MIN).toFixed(1);
    const locks = solverData.depArrConflicts.filter(
      (c) => c.depAcft.id === acft.id && c.isValidInboundConflict
    );

    let currentAltFt = calc.reqAltFt;
    if (dme < 10) {
      currentAltFt = wpt.msaFt;
    } else if (dme < 25) {
      currentAltFt = wpt.meaFt;
    }
    locks.forEach((lk) => {
      if (queryNormMins < lk.tCrossNorm) {
        currentAltFt = Math.min(currentAltFt, lk.depRestrictedAltFt);
      }
    });

    const pos = polarToSvg(Math.min(dme, 72), wpt.deg);
    const tip = polarToSvg(Math.min(dme + 4, 76), wpt.deg);

    return {
      visible: dme <= 72,
      phase: "outbound",
      x: pos.x,
      y: pos.y,
      tipX: tip.x,
      tipY: tip.y,
      dme,
      altFt: currentAltFt,
      altStr: formatAltShort(currentAltFt),
      text: `${dme} NM outbound on ${wpt.name} @ ${formatAltShort(currentAltFt)}`,
      color: "#fbbf24",
    };
  }

  // Arrival State at queryNormMins
  const eatInfo = solverData.eatMap.get(acft.id);
  const tInit = item.normInit;
  const d0 = calc.dist;

  if (queryNormMins < tInit) {
    const wait = +(tInit - queryNormMins).toFixed(1);
    return {
      visible: false,
      phase: "pending",
      dme: d0,
      altFt: calc.initAltFt,
      altStr: formatAltShort(calc.initAltFt),
      text: `Reports ${d0} NM in ${wait}m (@ ${formatAltShort(calc.initAltFt)})`,
      color: "var(--text-muted)",
    };
  }

  // Determine current solved altitude for Arrival
  let currentAltFt = plan ? plan.enrouteTargetFt : wpt.meaFt;
  const locks = solverData.depArrConflicts.filter(
    (c) => c.arrAcft.id === acft.id && c.isValidInboundConflict
  );
  locks.forEach((lk) => {
    if (queryNormMins >= lk.tCrossNorm && lk.dCross >= 25) {
      currentAltFt = wpt.meaFt;
    }
  });

  if (item.norm25 !== null && queryNormMins >= item.norm25) {
    currentAltFt = plan ? plan.msaTargetFt : wpt.msaFt;
  }

  const effectiveClearTime = eatInfo.willDelay ? eatInfo.eatNorm : item.normClearBase;
  if (queryNormMins >= item.norm10 && eatInfo.willDelay && queryNormMins < eatInfo.eatNorm) {
    currentAltFt = Math.min(currentAltFt, 4000);
  }
  if (queryNormMins >= effectiveClearTime) {
    currentAltFt = 3000;
  }

  // Straight-In Arrival Geometry
  if (calc.straightIn) {
    if (queryNormMins <= item.norm10) {
      const elapsed = queryNormMins - tInit;
      const dme = Math.max(10, +(d0 - elapsed * SPEED_NM_PER_MIN).toFixed(1));
      const pos = polarToSvg(dme, wpt.deg);
      const tip = polarToSvg(Math.max(0, dme - 4), wpt.deg);
      return {
        visible: true,
        phase: "inbound",
        x: pos.x,
        y: pos.y,
        tipX: tip.x,
        tipY: tip.y,
        dme,
        altFt: currentAltFt,
        altStr: formatAltShort(currentAltFt),
        text: `${dme} NM inbound ${wpt.name} (Str-In) @ ${formatAltShort(currentAltFt)}`,
        color: "#c084fc",
      };
    }

    if (queryNormMins <= eatInfo.effectiveEstNorm) {
      const pos = polarToSvg(10, wpt.deg);
      return {
        visible: true,
        phase: "hold",
        x: pos.x,
        y: pos.y,
        tipX: pos.x,
        tipY: pos.y,
        dme: 10,
        altFt: currentAltFt,
        altStr: formatAltShort(currentAltFt),
        text: `10 NM (${wpt.name}) — Holding/Establishing @ ${formatAltShort(currentAltFt)}`,
        color: "#34d399",
      };
    }

    const afterEst = +(queryNormMins - eatInfo.effectiveEstNorm).toFixed(1);
    if (afterEst <= 2) {
      const finalDme = Math.max(0, +(10 - afterEst * SPEED_NM_PER_MIN).toFixed(1));
      const pos = polarToSvg(finalDme, wpt.deg);
      const tip = polarToSvg(Math.max(0, finalDme - 3), wpt.deg);
      return {
        visible: true,
        phase: "twr",
        x: pos.x,
        y: pos.y,
        tipX: tip.x,
        tipY: tip.y,
        dme: finalDme,
        altFt: 1500,
        altStr: "TWR",
        text: `Established w/ TWR (${finalDme} NM final)`,
        color: "#34d399",
      };
    }

    return {
      visible: false,
      phase: "landed",
      dme: 0,
      altFt: 0,
      altStr: "LND",
      text: `Established ${afterEst}m ago (Landed)`,
      color: "var(--text-muted)",
    };
  }

  // Normal Arrival Geometry:
  // 1. Inbound from d0 to AYT VOR (0 NM)
  if (queryNormMins <= item.normVor) {
    const elapsed = queryNormMins - tInit;
    const dme = Math.max(0, +(d0 - elapsed * SPEED_NM_PER_MIN).toFixed(1));
    const pos = polarToSvg(dme, wpt.deg);
    const tip = polarToSvg(Math.max(0, dme - 4), wpt.deg);
    return {
      visible: true,
      phase: "inbound",
      x: pos.x,
      y: pos.y,
      tipX: tip.x,
      tipY: tip.y,
      dme,
      altFt: currentAltFt,
      altStr: formatAltShort(currentAltFt),
      text: `${dme} NM inbound ${wpt.name} @ ${formatAltShort(currentAltFt)}`,
      color: "#38bdf8",
    };
  }

  // Outbound radial for procedure: R-170 (170 deg) for RWY 36, R-350 (350 deg) for RWY 18
  const procDeg = state.activeRwy === "36" ? 170 : 350;

  // 2. Outbound from AYT VOR to 10 DME FIX (takes 2 mins)
  if (queryNormMins <= item.normFixBase) {
    const outElapsed = queryNormMins - item.normVor;
    const dme = +(outElapsed * SPEED_NM_PER_MIN).toFixed(1);
    const pos = polarToSvg(dme, procDeg);
    const tip = polarToSvg(dme + 3.5, procDeg);
    return {
      visible: true,
      phase: "outbound-fix",
      x: pos.x,
      y: pos.y,
      tipX: tip.x,
      tipY: tip.y,
      dme,
      altFt: currentAltFt,
      altStr: formatAltShort(currentAltFt),
      text: `${dme} NM outbound to 10 DME FIX @ ${formatAltShort(currentAltFt)}`,
      color: "#fbbf24",
    };
  }

  // 3. Holding at 10 DME FIX (if eatInfo.effectiveFixNorm > item.normFixBase)
  if (queryNormMins <= eatInfo.effectiveFixNorm) {
    const remHold = +(eatInfo.effectiveFixNorm - queryNormMins).toFixed(1);
    const pos = polarToSvg(10, procDeg);
    return {
      visible: true,
      phase: "hold",
      x: pos.x + 12,
      y: pos.y + 8,
      tipX: pos.x,
      tipY: pos.y,
      dme: 10,
      altFt: currentAltFt,
      altStr: `${formatAltShort(currentAltFt)} HLD`,
      text: `HOLDING at 10 DME FIX (${remHold}m to EAT/Clearance) @ ${formatAltShort(currentAltFt)}`,
      color: "#f87171",
    };
  }

  // 4. In 5-minute ILS procedure turn from 10 DME FIX to Established (10 NM final)
  if (queryNormMins <= eatInfo.effectiveEstNorm) {
    const turnProgress = (queryNormMins - eatInfo.effectiveFixNorm) / 5; // 0 to 1
    const remTurn = +(eatInfo.effectiveEstNorm - queryNormMins).toFixed(1);
    // Smooth teardrop arc around 10–13 DME returning to 10 DME on final
    const arcDme = 10 + 3 * Math.sin(turnProgress * Math.PI);
    const arcDeg = procDeg + 12 * Math.sin(turnProgress * Math.PI);
    const pos = polarToSvg(arcDme, arcDeg);
    const tip = polarToSvg(Math.max(0, arcDme - 3), procDeg);
    return {
      visible: true,
      phase: "turn",
      x: pos.x,
      y: pos.y,
      tipX: tip.x,
      tipY: tip.y,
      dme: +arcDme.toFixed(1),
      altFt: 3000,
      altStr: "3000' ILS",
      text: `In 5-min ILS turn (${remTurn}m to Establish) @ 3,000'`,
      color: "#34d399",
    };
  }

  const afterEst = +(queryNormMins - eatInfo.effectiveEstNorm).toFixed(1);
  if (afterEst <= 2) {
    const finalDme = Math.max(0, +(10 - afterEst * SPEED_NM_PER_MIN).toFixed(1));
    const pos = polarToSvg(finalDme, procDeg);
    const tip = polarToSvg(Math.max(0, finalDme - 3), procDeg);
    return {
      visible: true,
      phase: "twr",
      x: pos.x,
      y: pos.y,
      tipX: tip.x,
      tipY: tip.y,
      dme: finalDme,
      altFt: 1500,
      altStr: "EST/TWR",
      text: `Established w/ TWR 118.1 (${finalDme} NM final)`,
      color: "#34d399",
    };
  }

  return {
    visible: false,
    phase: "landed",
    dme: 0,
    altFt: 0,
    altStr: "LND",
    text: `Established ${afterEst}m ago (Sent to TWR)`,
    color: "var(--text-muted)",
  };
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

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
        <span>MEA ${wpt.fl} • MSA ${wpt.msaFt / 1000}k</span>
        ${isStraightForCurrentRwy ? `<span class="wpt-tag">STR-IN</span>` : `<span>${wpt.radial}</span>`}
      </div>
    `;

    btn.addEventListener("click", () => {
      state.selectedWpt = wpt.id;
      const flInput = document.getElementById("inputFl");
      state.selectedFl =
        state.flightType === "DEP" ? wpt.defaultDepFl : wpt.defaultArrFl;
      if (flInput) flInput.value = state.selectedFl;

      renderWaypointGrid();
      renderLivePreview();
    });

    container.appendChild(btn);
  });
}

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
      fl: state.selectedFl,
    });

    previewEl.innerHTML = `
      <div class="preview-header">
        <div class="preview-title">
          <span class="badge badge-dep">🛫 OUTBOUND DEPARTURE</span>
          <span><strong>${callsignLabel}</strong> → <strong>${wptObj.name} (${wptObj.entryWpt})</strong> • Req ${formatAlt(
      depCalc.reqAltFt
    )}</span>
        </div>
        <span class="step-delta">MSA ${formatAlt(wptObj.msaFt)} &lt;10 NM • MEA ${formatAlt(
      wptObj.meaFt
    )} &lt;25 NM</span>
      </div>
      <div class="preview-steps dep-steps">
        <div class="step-box">
          <div class="step-label"><span>0 NM (DEP)</span> <span class="step-delta">GND</span></div>
          <div class="step-time">${formatTime(depCalc.tDep, depCalc.hasHour)}</div>
        </div>
        <div class="step-box">
          <div class="step-label"><span>10 NM</span> <span class="step-delta">≥${formatAltShort(
            wptObj.msaFt
          )}</span></div>
          <div class="step-time">${formatTime(depCalc.t10, depCalc.hasHour)}</div>
        </div>
        <div class="step-box">
          <div class="step-label"><span>25 NM</span> <span class="step-delta">≥${formatAltShort(
            wptObj.meaFt
          )}</span></div>
          <div class="step-time">${formatTime(depCalc.t25, depCalc.hasHour)}</div>
        </div>
        <div class="step-box">
          <div class="step-label"><span>50 NM</span> <span class="step-delta">${formatAltShort(
            depCalc.reqAltFt
          )}</span></div>
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
      fl: state.selectedFl,
    },
    state.activeRwy
  );

  previewEl.innerHTML = `
    <div class="preview-header">
      <div class="preview-title">
        <span class="badge ${calc.straightIn ? "badge-straight" : "badge-normal"}">
          ${calc.straightIn ? `⚡ STRAIGHT-IN (RWY ${state.activeRwy})` : `📐 NORMAL (RWY ${state.activeRwy})`}
        </span>
        <span><strong>${callsignLabel}</strong> via <strong>${wptObj.name} (${wptObj.entryWpt})</strong> • Entry ${formatAlt(
    calc.initAltFt
  )} → MEA ${formatAlt(wptObj.meaFt)} → MSA ${formatAlt(wptObj.msaFt)}</span>
      </div>
      <span class="step-delta">15 NM VOR Sep @ <strong>${formatTime(calc.t15, calc.hasHour)}</strong></span>
    </div>
    <div class="preview-steps">
      <div class="step-box">
        <div class="step-label"><span>INIT (${calc.dist} NM)</span> <span class="step-delta">→${formatAltShort(
    wptObj.meaFt
  )}</span></div>
        <div class="step-time">${formatTime(calc.tInit, calc.hasHour)}</div>
      </div>
      <div class="step-box">
        <div class="step-label"><span>25 NM</span> <span class="step-delta">→${formatAltShort(
          wptObj.msaFt
        )}</span></div>
        <div class="step-time">${formatTime(calc.t25, calc.hasHour)}</div>
      </div>
      <div class="step-box">
        <div class="step-label"><span>10 NM</span> <span class="step-delta">→3000'</span></div>
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

function buildWaypointOptionsHtml(selectedWptId) {
  return WAYPOINTS.map(
    (w) =>
      `<option value="${w.id}" ${w.id === selectedWptId ? "selected" : ""}>${w.name} (${w.entryWpt})</option>`
  ).join("");
}

// Refresh calculated values in-place without losing input focus
function refreshCalculatedValuesOnly() {
  const solver = solveScenario(state.aircraftList, state.activeRwy);

  solver.computedArrivals.forEach(({ acft, calc }) => {
    const tr = document.querySelector(`tr[data-row-id="${acft.id}"]`);
    if (!tr) return;

    const eatInfo = solver.eatMap.get(acft.id);
    const modeBtn = tr.querySelector("[data-toggle-mode]");
    if (modeBtn) {
      modeBtn.className = `badge ${calc.straightIn ? "badge-straight" : "badge-normal"}`;
      modeBtn.textContent = calc.straightIn ? "STR-IN" : "NORMAL";
    }

    const setCell = (col, val) => {
      const el = tr.querySelector(`[data-col="${col}"]`);
      if (el) el.innerHTML = val;
    };

    setCell("t25", formatTime(calc.t25, calc.hasHour));
    setCell("t15", formatTime(calc.t15, calc.hasHour));
    setCell("t10", formatTime(calc.t10, calc.hasHour));
    setCell(
      "tVor",
      calc.straightIn ? `<span style="color:var(--text-muted)">—</span>` : formatTime(calc.tVor, calc.hasHour)
    );
    setCell(
      "tFix",
      calc.straightIn ? `<span style="color:var(--text-muted)">—</span>` : eatInfo.effectiveFixDisplay
    );
    setCell("tEat", eatInfo.eatDisplay);
    setCell("tEst", eatInfo.effectiveEstDisplay);
    setCell(
      "willDelay",
      eatInfo.willDelay
        ? `<span class="badge ${eatInfo.autoHoldMins > 0 ? "badge-delayed" : "badge-eat"}">${
            eatInfo.autoHoldMins > 0 ? `HOLD ${eatInfo.autoHoldMins}m` : "EAT DELAY"
          }</span>`
        : `<span class="badge badge-nodelay">ON TIME</span>`
    );
  });

  solver.computedDepartures.forEach(({ acft, calc }) => {
    const tr = document.querySelector(`tr[data-row-id="${acft.id}"]`);
    if (!tr) return;

    const setCell = (col, val) => {
      const el = tr.querySelector(`[data-col="${col}"]`);
      if (el) el.textContent = val;
    };

    setCell("dep10", formatTime(calc.t10, calc.hasHour));
    setCell("dep25", formatTime(calc.t25, calc.hasHour));
    setCell("dep50", formatTime(calc.t50, calc.hasHour));
    setCell("dep60", formatTime(calc.t60, calc.hasHour));
  });

  renderSolverPanels(solver);
  renderRadarChartView(solver);
  renderTimelineView(solver);
}

// Render Scenario Sheet + Master Solver + Chart + Timeline
function renderScenarioBoard() {
  const arrTbody = document.getElementById("scenarioTableBody");
  const depSection = document.getElementById("departuresSection");
  const depTbody = document.getElementById("departuresTableBody");
  const summaryText = document.getElementById("scenarioSummaryText");

  const solver = solveScenario(state.aircraftList, state.activeRwy);
  const { computedArrivals, computedDepartures, eatMap } = solver;

  summaryText.textContent = `${computedArrivals.length} Arrival(s), ${computedDepartures.length} Departure(s) • All fields editable. EAT & holds auto-computed.`;

  if (computedArrivals.length === 0) {
    arrTbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="16">No arriving aircraft added yet.</td>
      </tr>
    `;
  } else {
    arrTbody.innerHTML = "";
    computedArrivals.forEach(({ acft, calc }) => {
      const eatInfo = eatMap.get(acft.id);
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
          />
        </td>
        <td>
          <select
            class="inline-select inline-wpt"
            data-edit-field="wptId"
            data-id="${acft.id}"
          >
            ${buildWaypointOptionsHtml(acft.wptId)}
          </select>
        </td>
        <td>
          <input
            type="number"
            class="inline-input inline-fl"
            data-edit-field="fl"
            data-id="${acft.id}"
            value="${acft.fl || 130}"
            step="10"
            title="Initial Flight Level"
          />
        </td>
        <td>
          <button type="button" class="badge ${
            calc.straightIn ? "badge-straight" : "badge-normal"
          }" data-toggle-mode="${acft.id}" title="Click to toggle Straight-In / Normal">
            ${calc.straightIn ? "STR-IN" : "NORMAL"}
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
          />
        </td>
        <td>
          <input
            type="text"
            class="inline-input inline-time"
            data-edit-field="timeRaw"
            data-id="${acft.id}"
            value="${acft.timeRaw}"
          />
        </td>
        <td class="time-cell" data-col="t25">${formatTime(calc.t25, calc.hasHour)}</td>
        <td class="time-cell" data-col="t15">${formatTime(calc.t15, calc.hasHour)}</td>
        <td class="time-cell" data-col="t10">${formatTime(calc.t10, calc.hasHour)}</td>
        <td class="time-cell" data-col="tVor">${
          calc.straightIn ? `<span style="color:var(--text-muted)">—</span>` : formatTime(calc.tVor, calc.hasHour)
        }</td>
        <td class="time-cell" data-col="tFix">${
          calc.straightIn ? `<span style="color:var(--text-muted)">—</span>` : eatInfo.effectiveFixDisplay
        }</td>
        <td class="time-cell eat-cell" data-col="tEat">${eatInfo.eatDisplay}</td>
        <td class="time-cell" data-col="tEst">${eatInfo.effectiveEstDisplay}</td>
        <td data-col="willDelay">
          ${
            eatInfo.willDelay
              ? `<span class="badge ${eatInfo.autoHoldMins > 0 ? "badge-delayed" : "badge-eat"}">${
                  eatInfo.autoHoldMins > 0 ? `HOLD ${eatInfo.autoHoldMins}m` : "EAT DELAY"
                }</span>`
              : `<span class="badge badge-nodelay">ON TIME</span>`
          }
        </td>
        <td>
          <div class="hold-controls">
            <button type="button" class="hold-btn" data-hold-id="${acft.id}" data-hold-delta="-1">-1</button>
            <input
              type="number"
              class="inline-input inline-hold"
              data-edit-field="holdMins"
              data-id="${acft.id}"
              value="${calc.holdMins}"
              step="1"
            />
            <button type="button" class="hold-btn" data-hold-id="${acft.id}" data-hold-delta="1">+1</button>
          </div>
        </td>
        <td>
          <button type="button" class="row-del-btn" data-del-id="${acft.id}" title="Remove aircraft">✕</button>
        </td>
      `;

      arrTbody.appendChild(tr);
    });
  }

  // Departures Sub-Table
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
          />
        </td>
        <td>
          <select
            class="inline-select inline-wpt"
            data-edit-field="wptId"
            data-id="${acft.id}"
          >
            ${buildWaypointOptionsHtml(acft.wptId)}
          </select>
        </td>
        <td>
          <input
            type="number"
            class="inline-input inline-fl"
            data-edit-field="fl"
            data-id="${acft.id}"
            value="${acft.fl || 140}"
            step="10"
            title="Requested Flight Level"
          />
        </td>
        <td>
          <input
            type="text"
            class="inline-input inline-time"
            data-edit-field="timeRaw"
            data-id="${acft.id}"
            value="${acft.timeRaw}"
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

  // Wire up inline editable fields
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
      } else if (field === "fl") {
        target.fl = Number(inputEl.value) || 100;
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

  renderSolverPanels(solver);
  renderRadarChartView(solver);
  renderTimelineView(solver);
}

// Render Master Solver Cards, Dep<->Arr Conflicts, and VOR <15 NM + EAT Analysis
function renderSolverPanels(solver) {
  const plansGridEl = document.getElementById("solverAircraftPlans");
  const depArrListEl = document.getElementById("depArrConflictList");
  const ilsDelayListEl = document.getElementById("ilsDelayList");

  // 1. Per-Aircraft Solved Clearance Plans
  if (solver.aircraftPlans.size === 0) {
    plansGridEl.innerHTML = `
      <div class="conflict-box">
        <div class="conflict-detail">Add arrivals and/or departures above to generate the complete solved ATC altitude &amp; clearance plan.</div>
      </div>
    `;
  } else {
    plansGridEl.innerHTML = "";
    solver.aircraftPlans.forEach((plan) => {
      const { acft, wpt, seqNum, eatInfo, steps } = plan;
      const card = document.createElement("div");
      card.className = "solver-plan-card";

      const badgeHtml =
        acft.type === "DEP"
          ? `<span class="badge badge-dep">DEPARTURE</span>`
          : `<span class="solver-seq-badge">LANDING #${seqNum}</span>`;

      const eatBadge =
        eatInfo && eatInfo.willDelay
          ? `<span class="badge badge-eat">EAT ${eatInfo.eatDisplay}</span>`
          : "";

      card.innerHTML = `
        <div class="solver-plan-header">
          <div>
            <strong style="font-family:var(--font-mono);font-size:0.96rem;">${acft.callsign}</strong>
            <span style="font-size:0.78rem;color:var(--text-muted);margin-left:0.35rem;">
              ${wpt.name} (${wpt.entryWpt}) • MEA ${formatAltShort(wpt.meaFt)} / MSA ${formatAltShort(wpt.msaFt)}
            </span>
          </div>
          <div style="display:flex;gap:0.35rem;align-items:center;">
            ${eatBadge}
            ${badgeHtml}
          </div>
        </div>
        <div class="solver-steps-list">
          ${steps
            .map(
              (s) => `
            <div class="solver-step-item ${
              s.severity === "crit"
                ? "step-crit"
                : s.severity === "warn"
                ? "step-warn"
                : s.severity === "ok"
                ? "step-ok"
                : ""
            }">
              <span class="solver-step-time">${s.timeStr}</span>
              <span class="solver-step-text">${s.text}</span>
            </div>
          `
            )
            .join("")}
        </div>
      `;
      plansGridEl.appendChild(card);
    });
  }

  // 2. Departure <-> Arrival Head-On Conflicts
  if (solver.depArrConflicts.length === 0) {
    depArrListEl.innerHTML = `
      <div class="conflict-box">
        <div class="conflict-detail">
          No Arrival &amp; Departure pair on the same waypoint.
        </div>
      </div>
    `;
  } else {
    depArrListEl.innerHTML = "";
    solver.depArrConflicts.forEach((c) => {
      const box = document.createElement("div");
      if (c.isValidInboundConflict) {
        box.className = "conflict-box alert-danger";
        box.innerHTML = `
          <div class="conflict-top">
            <span class="conflict-pair">🛫 ${c.depAcft.callsign} ↔ 🛬 ${c.arrAcft.callsign}</span>
            <span class="badge badge-delayed">${c.wpt.name} (${c.zone})</span>
          </div>
          <div class="conflict-metrics">
            <div class="metric-pill where-pill">📍 WHERE: <strong>${c.dCross} NM (${c.wpt.name})</strong></div>
            <div class="metric-pill when-pill">⏰ WHEN: <strong>${c.displayTime}</strong></div>
          </div>
          <div class="conflict-detail" style="color:var(--text-main);">
            <strong>Solved Action:</strong> ${c.resolutionText}
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
            No inbound radial crossing within ${c.arrDist} NM.
          </div>
        `;
      }
      depArrListEl.appendChild(box);
    });
  }

  // 3. VOR <15 NM Separation & EAT Delays
  ilsDelayListEl.innerHTML = "";
  if (solver.vorSepConstraints.length === 0 && solver.sequencedArrivals.length <= 1) {
    ilsDelayListEl.innerHTML = `
      <div class="conflict-box">
        <div class="conflict-detail">Add 2 or more arriving aircraft to see VOR &lt;15 NM vertical separation constraints and EAT calculations.</div>
      </div>
    `;
  } else {
    // Show VOR <15 NM constraints
    solver.vorSepConstraints.forEach((vc) => {
      const box = document.createElement("div");
      const isAlert = !vc.type.includes("NATURAL");
      box.className = `conflict-box ${isAlert ? "alert-warn" : "alert-safe"}`;
      box.innerHTML = `
        <div class="conflict-top">
          <span class="conflict-pair">🛬 ${vc.first.acft.callsign} &amp; 🛬 ${vc.second.acft.callsign}</span>
          <span class="badge ${isAlert ? "badge-eat" : "badge-nodelay"}">${vc.type}</span>
        </div>
        <div class="conflict-detail" style="color:var(--text-main);">
          ${vc.summaryText}
        </div>
      `;
      ilsDelayListEl.appendChild(box);
    });

    // Show EAT Delay Summary for delayed arrivals
    solver.sequencedArrivals.forEach((item) => {
      const eatInfo = solver.eatMap.get(item.acft.id);
      if (eatInfo.willDelay) {
        const box = document.createElement("div");
        box.className = "conflict-box alert-danger";
        box.innerHTML = `
          <div class="conflict-top">
            <span class="conflict-pair">⏳ ${item.acft.callsign} (${item.wpt.name}) — EAT: ${eatInfo.eatDisplay}</span>
            <span class="badge badge-delayed">${
              eatInfo.autoHoldMins > 0 ? `HOLDS ${eatInfo.autoHoldMins}m` : "NO HOLD NEEDED"
            }</span>
          </div>
          <div class="conflict-detail" style="color:var(--text-main);">
            Would reach ILS clearance point at <code>${formatTime(
              item.calc.tClearBase,
              item.calc.hasHour
            )}</code>, but <strong>#${eatInfo.seqNum - 1} ${
          eatInfo.blockedBy.acft.callsign
        }</strong> is not established until <code>${eatInfo.eatDisplay}</code>.<br/>
            → <strong>EAT = ${eatInfo.eatDisplay}</strong> (${
          eatInfo.clearancePhaseNote
        }) → Established at <code>${eatInfo.effectiveEstDisplay}</code>.
          </div>
        `;
        ilsDelayListEl.appendChild(box);
      }
    });
  }
}

// ============================================================================
// VIEW 2: STATIC SVG CORRIDORS + DYNAMIC LIVE AIRCRAFT BLIPS
// ============================================================================
function renderStaticSvgCorridors() {
  const layer = document.getElementById("svgCorridorsLayer");
  if (!layer) return;
  layer.innerHTML = "";

  WAYPOINTS.forEach((wpt) => {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "chart-corridor");
    g.setAttribute("data-wpt", wpt.id);

    const pOuter = polarToSvg(72, wpt.deg);
    const pTma = polarToSvg(50, wpt.deg);
    const pVorEdge = polarToSvg(6, wpt.deg);
    const pLabelOuter = polarToSvg(80, wpt.deg);
    const pLabelMain = polarToSvg(54, wpt.deg + 7);
    const pSpec = polarToSvg(62, wpt.deg - 5);

    g.innerHTML = `
      <line x1="${pOuter.x}" y1="${pOuter.y}" x2="${pTma.x}" y2="${pTma.y}" class="airway-dashed" />
      <line x1="${pTma.x}" y1="${pTma.y}" x2="${pVorEdge.x}" y2="${pVorEdge.y}" class="inbound-track" marker-end="url(#arrowRed)" />
      <polygon points="${pOuter.x},${pOuter.y - 6} ${pOuter.x - 5},${pOuter.y + 4} ${pOuter.x + 5},${pOuter.y + 4}" class="wpt-triangle-outer" />
      <text x="${pLabelOuter.x}" y="${pLabelOuter.y}" class="chart-wpt-outer">${wpt.entryWpt}</text>
      <polygon points="${pTma.x},${pTma.y - 6} ${pTma.x - 5},${pTma.y + 4} ${pTma.x + 5},${pTma.y + 4}" class="wpt-triangle" />
      <text x="${pLabelMain.x}" y="${pLabelMain.y}" class="chart-wpt-main">${wpt.name}</text>
      <text x="${pSpec.x}" y="${pSpec.y}" class="chart-spec">${wpt.radial} • ${wpt.fl}</text>
    `;

    g.addEventListener("click", () => {
      state.selectedWpt = wpt.id;
      renderWaypointGrid();
      renderLivePreview();
    });

    layer.appendChild(g);
  });
}

function renderRadarChartView(solver) {
  const blipsLayer = document.getElementById("svgBlipsLayer");
  const listEl = document.getElementById("positionSnapshotList");
  const sidebarTimeLabel = document.getElementById("sidebarTimeLabel");
  const slider = document.getElementById("radarTimeSlider");

  if (!blipsLayer || !listEl) return;

  const allItems = [...solver.computedArrivals, ...solver.computedDepartures];

  // Update slider bounds based on scenario start/end times
  if (allItems.length > 0 && slider) {
    const minT = Math.min(
      ...allItems.map((it) => (it.acft.type === "DEP" ? it.normDep : it.normInit))
    );
    const maxT = Math.max(
      ...allItems.map((it) =>
        it.acft.type === "DEP"
          ? it.norm60
          : solver.eatMap.get(it.acft.id)?.effectiveEstNorm + 2 || it.normInit + 25
      )
    );
    slider.min = Math.floor(minT);
    slider.max = Math.ceil(maxT);
  }

  const parsedQuery = parseTimeInput(state.lookupTimeRaw);
  let queryNorm = parsedQuery.totalMinutes;
  if (solver.refHour !== null && !parsedQuery.hasHour && queryNorm < 120) {
    queryNorm = solver.refHour * 60 + queryNorm;
  }

  if (sidebarTimeLabel) {
    sidebarTimeLabel.textContent = formatTime(
      denormalizeTime(queryNorm, solver.useHasHour, solver.refHour),
      solver.useHasHour
    );
  }

  blipsLayer.innerHTML = "";
  listEl.innerHTML = "";

  if (allItems.length === 0) {
    listEl.innerHTML = `<div class="snapshot-item" style="color:var(--text-muted)">Add aircraft in the Calculator tab to visualize them as live radar blips.</div>`;
    return;
  }

  allItems.forEach((item, idx) => {
    const st = getAircraftStateAtTime(item, solver, queryNorm);

    // 1. Add to Sidebar list
    const row = document.createElement("div");
    row.className = "snapshot-item";
    row.innerHTML = `
      <div class="snapshot-top">
        <span class="callsign-cell">${item.acft.callsign}</span>
        <span class="badge ${
          item.acft.type === "DEP"
            ? "badge-dep"
            : item.calc.straightIn
            ? "badge-straight"
            : "badge-normal"
        }">${item.wpt.name} • ${st.altStr}</span>
      </div>
      <div class="snapshot-status" style="color: ${st.color}">${st.text}</div>
    `;
    listEl.appendChild(row);

    // 2. Draw Radar Blip on SVG Chart if visible
    if (st.visible && st.x !== undefined && st.y !== undefined) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");

      // Offset data tag slightly based on index to avoid overlapping labels
      const offsetX = idx % 2 === 0 ? 14 : -92;
      const offsetY = idx % 3 === 0 ? -28 : 8;
      const tagX = st.x + offsetX;
      const tagY = st.y + offsetY;

      g.innerHTML = `
        <!-- Velocity Leader Line -->
        <line x1="${st.x}" y1="${st.y}" x2="${st.tipX}" y2="${st.tipY}" stroke="${st.color}" stroke-width="2" />
        <!-- Tag Connector Line -->
        <line x1="${st.x}" y1="${st.y}" x2="${tagX + 38}" y2="${tagY + 14}" stroke="${st.color}" stroke-width="1" stroke-dasharray="2 2" opacity="0.75" />
        <!-- Radar Target Blip (Diamond + Center Dot) -->
        <rect x="${st.x - 5}" y="${st.y - 5}" width="10" height="10" fill="#0b111e" stroke="${st.color}" stroke-width="2.2" transform="rotate(45 ${st.x} ${st.y})" />
        <circle cx="${st.x}" cy="${st.y}" r="2" fill="${st.color}" />
        <!-- ATC Data Block -->
        <rect x="${tagX}" y="${tagY}" width="82" height="29" class="blip-tag-bg" stroke="${st.color}" />
        <text x="${tagX + 5}" y="${tagY + 12}" class="blip-tag-title" fill="${st.color}">${item.acft.callsign}</text>
        <text x="${tagX + 5}" y="${tagY + 24}" class="blip-tag-sub">${st.altStr} • ${st.dme}NM</text>
      `;

      blipsLayer.appendChild(g);
    }
  });
}

// ============================================================================
// VIEW 3: SCENARIO TIME VIEW (GANTT + CHRONOLOGICAL ATC CLEARANCE SCRIPT)
// ============================================================================
function renderTimelineView(solver) {
  const ganttEl = document.getElementById("ganttContainer");
  const scriptEl = document.getElementById("masterTimelineScript");
  if (!ganttEl || !scriptEl) return;

  const allItems = [...solver.computedArrivals, ...solver.computedDepartures];
  if (allItems.length === 0) {
    ganttEl.innerHTML = `<div style="color:var(--text-muted);font-size:0.84rem;">Add traffic in the Calculator tab to view the visual timeline and master ATC script.</div>`;
    scriptEl.innerHTML = "";
    return;
  }

  // 1. Visual Gantt Chart
  const minT = Math.min(
    ...allItems.map((it) => (it.acft.type === "DEP" ? it.normDep : it.normInit))
  );
  const maxT = Math.max(
    ...allItems.map((it) =>
      it.acft.type === "DEP"
        ? it.norm60
        : solver.eatMap.get(it.acft.id)?.effectiveEstNorm || it.normInit + 20
    )
  );
  const span = Math.max(10, maxT - minT);

  const pct = (t) => Math.max(0, Math.min(100, ((t - minT) / span) * 100));

  ganttEl.innerHTML = "";
  solver.sequencedArrivals.forEach((item) => {
    const eatInfo = solver.eatMap.get(item.acft.id);
    const tInit = item.normInit;
    const tClear = eatInfo.willDelay ? eatInfo.eatNorm : item.normClearBase;
    const tEst = eatInfo.effectiveEstNorm;

    const row = document.createElement("div");
    row.className = "gantt-row";

    const leftEnroute = pct(tInit);
    const widthEnroute = Math.max(1, pct(tClear) - leftEnroute);
    const leftIls = pct(tClear);
    const widthIls = Math.max(2, pct(tEst) - leftIls);

    row.innerHTML = `
      <div class="gantt-label">#${eatInfo.seqNum} ${item.acft.callsign} <span style="color:var(--text-muted);font-weight:500;">(${item.wpt.name})</span></div>
      <div class="gantt-track">
        <div class="gantt-seg" style="left:${leftEnroute}%;width:${widthEnroute}%;background:#38bdf8;" title="Inbound (${formatTime(
      item.calc.tInit,
      item.calc.hasHour
    )} → ${
      eatInfo.willDelay ? eatInfo.eatDisplay : formatTime(item.calc.tClearBase, item.calc.hasHour)
    })">
          Inbound
        </div>
        <div class="gantt-seg" style="left:${leftIls}%;width:${widthIls}%;background:#34d399;" title="ILS Cleared → Established (${
      eatInfo.effectiveEstDisplay
    })">
          ILS (${eatInfo.effectiveEstDisplay})
        </div>
      </div>
    `;
    ganttEl.appendChild(row);
  });

  solver.computedDepartures.forEach((dep) => {
    const leftDep = pct(dep.normDep);
    const widthDep = Math.max(2, pct(dep.norm60) - leftDep);
    const row = document.createElement("div");
    row.className = "gantt-row";
    row.innerHTML = `
      <div class="gantt-label">🛫 ${dep.acft.callsign} <span style="color:var(--text-muted);font-weight:500;">(${dep.wpt.name})</span></div>
      <div class="gantt-track">
        <div class="gantt-seg" style="left:${leftDep}%;width:${widthDep}%;background:#fbbf24;" title="Outbound 0→60 NM">
          Outbound 0→60 NM
        </div>
      </div>
    `;
    ganttEl.appendChild(row);
  });

  // 2. Collect all solved steps across all aircraft and sort chronologically
  const allScriptEvents = [];
  solver.aircraftPlans.forEach((plan) => {
    plan.steps.forEach((st) => {
      allScriptEvents.push({
        timeNorm: st.timeNorm,
        timeStr: st.timeStr,
        severity: st.severity,
        callsign: plan.acft.callsign,
        wptName: plan.wpt.name,
        text: st.text,
      });
    });
  });

  allScriptEvents.sort((a, b) => a.timeNorm - b.timeNorm);

  scriptEl.innerHTML = "";
  allScriptEvents.forEach((ev) => {
    const row = document.createElement("div");
    row.className = "script-row";
    const color =
      ev.severity === "crit"
        ? "var(--accent-red)"
        : ev.severity === "warn"
        ? "var(--accent-amber)"
        : ev.severity === "ok"
        ? "var(--accent-green)"
        : "var(--accent-blue)";

    row.innerHTML = `
      <div class="script-time" style="color:${color}">${ev.timeStr}</div>
      <div class="script-body"><strong>${ev.callsign} (${ev.wptName})</strong>: ${ev.text}</div>
    `;
    scriptEl.appendChild(row);
  });
}

// ============================================================================
// INITIALIZE APP & EVENT LISTENERS
// ============================================================================
function initApp() {
  loadSavedState();
  renderStaticSvgCorridors();

  // Main View Tabs (Calculator & Solver | Chart & Blips | Scenario Time View)
  const viewTabs = document.querySelectorAll(".view-tab");
  const viewCalc = document.getElementById("viewCalc");
  const viewChart = document.getElementById("viewChart");
  const viewTimeline = document.getElementById("viewTimeline");

  viewTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetView = tab.getAttribute("data-view");
      state.activeView = targetView;
      viewTabs.forEach((t) => {
        t.classList.toggle("active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });
      viewCalc.classList.toggle("hidden", targetView !== "calc");
      viewChart.classList.toggle("hidden", targetView !== "chart");
      viewTimeline.classList.toggle("hidden", targetView !== "timeline");
      renderScenarioBoard();
    });
  });

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
  const inputFl = document.getElementById("inputFl");

  function syncFormModeUI() {
    const isDep = state.flightType === "DEP";
    const wptObj = WAYPOINTS.find((w) => w.id === state.selectedWpt) || WAYPOINTS[0];
    tabArrival.classList.toggle("active", !isDep);
    tabDeparture.classList.toggle("active", isDep);

    distFieldGroup.classList.toggle("hidden", isDep);
    approachOverrideGroup.classList.toggle("hidden", isDep);

    state.selectedFl = isDep ? wptObj.defaultDepFl : wptObj.defaultArrFl;
    if (inputFl) inputFl.value = state.selectedFl;

    metaFieldLabel.textContent = isDep
      ? "1. Callsign & Requested FL"
      : "1. Callsign, Initial FL & Approach Type";
    wptFieldLabel.textContent = isDep
      ? "2. Departure Waypoint / Exit Fix"
      : "2. Waypoint / Entry Fix (MEA & MSA)";
    timeFieldLabel.innerHTML = isDep
      ? `3. Departure Time at 0 NM <span class="hint">(e.g. <code>04</code> or <code>10:04</code>)</span>`
      : `4. Report Time <span class="hint">(e.g. <code>0</code>, <code>05</code>, or <code>10:05</code>)</span>`;

    btnSubmitAircraft.classList.toggle("dep-mode", isDep);
    btnSubmitAircraft.innerHTML = isDep
      ? `<span>🛫 Add Departure to Scenario (Enter)</span>`
      : `<span>➕ Add Arrival to Scenario (Enter)</span>`;

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

  // Flight Level Input
  inputFl.addEventListener("input", () => {
    state.selectedFl = Number(inputFl.value) || 100;
    renderLivePreview();
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
      fl: Number(inputFl.value) || 130,
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

  // Auto-Sequence by Solver Button
  document.getElementById("btnApplySolverOrder").addEventListener("click", () => {
    const solver = solveScenario(state.aircraftList, state.activeRwy);
    const orderedIds = solver.sequencedArrivals.map((s) => s.acft.id);
    state.aircraftList.sort((a, b) => {
      if (a.type !== b.type) return a.type === "ARR" ? -1 : 1;
      if (a.type === "ARR") {
        return orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id);
      }
      return a.id - b.id;
    });
    saveState();
    renderScenarioBoard();
  });

  document.getElementById("btnSortByEst").addEventListener("click", () => {
    const solver = solveScenario(state.aircraftList, state.activeRwy);
    state.aircraftList.sort((a, b) => {
      if (a.type !== b.type) return a.type === "ARR" ? -1 : 1;
      if (a.type === "ARR") {
        const ea = solver.eatMap.get(a.id)?.effectiveEstNorm || 0;
        const eb = solver.eatMap.get(b.id)?.effectiveEstNorm || 0;
        return ea - eb;
      }
      return a.id - b.id;
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

  // Radar Chart Time Lookup, Slider & Play Animation
  const lookupTimeInput = document.getElementById("lookupTimeInput");
  const radarTimeSlider = document.getElementById("radarTimeSlider");
  const btnPlayRadar = document.getElementById("btnPlayRadar");

  function setRadarTimeFromMinutes(normMins) {
    const solver = solveScenario(state.aircraftList, state.activeRwy);
    const disp = denormalizeTime(normMins, solver.useHasHour, solver.refHour);
    if (solver.useHasHour) {
      lookupTimeInput.value = formatTime(disp, true);
    } else {
      lookupTimeInput.value = String(Math.round(disp)).padStart(2, "0");
    }
    state.lookupTimeRaw = lookupTimeInput.value;
    if (radarTimeSlider) radarTimeSlider.value = normMins;
    renderRadarChartView(solver);
  }

  lookupTimeInput.addEventListener("input", () => {
    state.lookupTimeRaw = lookupTimeInput.value;
    const solver = solveScenario(state.aircraftList, state.activeRwy);
    const p = parseTimeInput(state.lookupTimeRaw);
    const norm = normalizeTime(p.totalMinutes, p.hasHour, solver.refHour);
    if (radarTimeSlider) radarTimeSlider.value = norm;
    renderRadarChartView(solver);
  });

  if (radarTimeSlider) {
    radarTimeSlider.addEventListener("input", () => {
      setRadarTimeFromMinutes( parseFloat(radarTimeSlider.value) );
    });
  }

  document.querySelectorAll(".lookup-step").forEach((btn) => {
    btn.addEventListener("click", () => {
      const step = Number(btn.getAttribute("data-step"));
      const solver = solveScenario(state.aircraftList, state.activeRwy);
      const parsed = parseTimeInput(lookupTimeInput.value);
      const norm = normalizeTime(parsed.totalMinutes, parsed.hasHour, solver.refHour);
      setRadarTimeFromMinutes(Math.max(0, norm + step));
    });
  });

  if (btnPlayRadar) {
    btnPlayRadar.addEventListener("click", () => {
      if (state.playInterval) {
        clearInterval(state.playInterval);
        state.playInterval = null;
        btnPlayRadar.textContent = "▶ Play";
        return;
      }
      btnPlayRadar.textContent = "⏸ Pause";
      state.playInterval = setInterval(() => {
        const cur = parseFloat(radarTimeSlider.value) || 0;
        const max = parseFloat(radarTimeSlider.max) || 40;
        if (cur >= max) {
          setRadarTimeFromMinutes(parseFloat(radarTimeSlider.min) || 0);
        } else {
          setRadarTimeFromMinutes(+(cur + 0.25).toFixed(2));
        }
      }, 220);
    });
  }

  syncFormModeUI();
  updateRwyUI();
}

document.addEventListener("DOMContentLoaded", initApp);
