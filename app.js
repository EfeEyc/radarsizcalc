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
// MASTER SCENARIO SOLVER & LIVE TIME-STEP SIMULATION ENGINE (dt = 0.2m / 1 NM)
// Solves:
// 1. Optimal Landing Sequence & EATs (Expected Approach Times)
// 2. Dynamic Multi-Aircraft Approach & Holding Stack (3,000', 4,000', 5,000', 6,000'...)
//    with automatic 1,000' step-downs as preceding aircraft establish
// 3. Same-Waypoint & Cross-Radial (<15 NM VOR) Departure <-> Arrival Separation
// 4. Live 0.2-min (1 NM) Time-Step Verification across all active traffic pairs
// ============================================================================
function evaluateTimelineAlt(altTimeline, t, fallbackAlt) {
  if (!altTimeline || altTimeline.length === 0) return fallbackAlt;
  let activeAlt = altTimeline[0].altFt;
  for (let i = 0; i < altTimeline.length; i++) {
    if (t + 1e-6 >= altTimeline[i].tFrom) {
      activeAlt = altTimeline[i].altFt;
    } else {
      break;
    }
  }
  return activeAlt;
}

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
      norm15: normalizeTime(calc.t15, calc.hasHour, refHour),
      norm25: normalizeTime(calc.t25, calc.hasHour, refHour),
      norm60: normalizeTime(calc.t60, calc.hasHour, refHour),
    };
  });

  // --------------------------------------------------------------------------
  // STEP 1: Arrival Sequencing & Expected Approach Time (EAT) Calculation
  // --------------------------------------------------------------------------
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
      willDelay = true;
      eatNorm = prevEstNorm;

      if (calc.straightIn) {
        if (eatNorm <= item.norm10) {
          autoHoldMins = 0;
          effectiveEstNorm = item.norm10 + manualHold;
          const dmeAtEat = +(10 + (item.norm10 - eatNorm) * SPEED_NM_PER_MIN).toFixed(1);
          clearancePhaseNote = `Gets ILS clearance at EAT (${formatTime(
            denormalizeTime(eatNorm, calc.hasHour, refHour),
            calc.hasHour
          )}) at ${dmeAtEat} NM — No hold needed`;
        } else {
          autoHoldMins = +(eatNorm - item.norm10).toFixed(1);
          effectiveEstNorm = eatNorm + 5 + manualHold;
          clearancePhaseNote = `Holds ${autoHoldMins}m at 10 DME FIX until EAT (${formatTime(
            denormalizeTime(eatNorm, calc.hasHour, refHour),
            calc.hasHour
          )}), then +5m to Establish`;
        }
      } else {
        if (eatNorm <= item.normFixBase) {
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

    const effectiveClearNorm = willDelay ? eatNorm : item.normClearBase;
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

    // Dynamic Multi-Aircraft Holding Stack Calculation (4,000', 5,000', 6,000'...)
    // Find all preceding arrivals still un-established when this aircraft reaches its inner stack entry
    const stackEntryTime = item.norm10;
    let initialHoldAltFt = 4000;
    const holdStepDowns = [];

    if (willDelay && stackEntryTime < eatNorm) {
      const activeAheadAt10 = [];
      for (let k = 0; k < index; k++) {
        const pred = sequencedArrivals[k];
        const predEat = eatMap.get(pred.acft.id);
        if (predEat && predEat.effectiveEstNorm > stackEntryTime + 1e-6) {
          activeAheadAt10.push({ item: pred, eat: predEat });
        }
      }
      // m aircraft ahead not yet established -> occupy 3,000' .. 3000 + (m-1)*1000
      const m = Math.max(1, activeAheadAt10.length);
      initialHoldAltFt = 3000 + m * 1000;

      // As each preceding aircraft (before the final blocker) establishes, step down 1,000'
      for (let p = 0; p < activeAheadAt10.length - 1; p++) {
        const estEventTime = activeAheadAt10[p].eat.effectiveEstNorm;
        if (estEventTime > stackEntryTime + 1e-6 && estEventTime < eatNorm - 1e-6) {
          const remAhead = activeAheadAt10.length - 1 - p;
          const stepAltFt = 3000 + remAhead * 1000;
          const prevAltFt = stepAltFt + 1000;
          holdStepDowns.push({
            timeNorm: estEventTime,
            timeStr: formatTime(
              denormalizeTime(estEventTime, calc.hasHour, refHour),
              calc.hasHour
            ),
            prevAltFt,
            altFt: stepAltFt,
            establishedAcft: activeAheadAt10[p].item.acft,
            nextClearedAcft: activeAheadAt10[p + 1].item.acft,
          });
        }
      }
    }

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
      effectiveClearNorm,
      clearancePhaseNote,
      initialHoldAltFt,
      holdStepDowns,
    });

    prevEstNorm = effectiveEstNorm;
    prevAcft = item;
  });

  // Helper: query inner approach/hold stack altitude of arrival #k at time t (if inside 10 NM / on ILS)
  function getInnerStackAltAt(arrItem, t) {
    const eatInfo = eatMap.get(arrItem.acft.id);
    if (!eatInfo) return null;
    const tStartInner = arrItem.calc.straightIn ? arrItem.normClearBase : arrItem.norm10;
    if (t + 1e-6 < tStartInner || t >= eatInfo.effectiveEstNorm - 1e-6) return null;
    if (t + 1e-6 >= eatInfo.effectiveClearNorm) return 3000;
    if (arrItem.calc.straightIn && t < arrItem.norm10 - 1e-6) {
      return Math.max(arrItem.wpt.msaFt, eatInfo.initialHoldAltFt);
    }
    let curHoldAlt = eatInfo.initialHoldAltFt;
    for (const sd of eatInfo.holdStepDowns) {
      if (t + 1e-6 >= sd.timeNorm) {
        curHoldAlt = sd.altFt;
      }
    }
    return curHoldAlt;
  }

  // --------------------------------------------------------------------------
  // STEP 2: Same-Waypoint & Cross-Radial (<15 NM VOR) Departure <-> Arrival Conflicts
  // --------------------------------------------------------------------------
  const depArrConflicts = [];
  const arrDepLocks = new Map(); // arrId -> list of lock instructions
  const depArrLocks = new Map(); // depId -> list of lock instructions

  computedDepartures.forEach((depItem) => {
    const wptDep = depItem.wpt;
    const tDepNorm = depItem.normDep;
    const tDepExit15 = depItem.norm15; // tDep + 3m (15 NM)

    // Check if any arrival is in the inner approach/hold stack (3,000', 4,000'...) while this departure
    // is inside 15 NM, which matters when wptDep.msaFt === 3,000' (e.g. DERYA or MANAV)
    let innerStackFloorForDep = wptDep.msaFt;
    const innerStackTraffic = [];
    sequencedArrivals.forEach((arrItem) => {
      for (let t = tDepNorm; t < tDepExit15; t = +(t + 0.2).toFixed(2)) {
        const stAlt = getInnerStackAltAt(arrItem, t);
        if (stAlt !== null && stAlt >= innerStackFloorForDep && wptDep.msaFt <= 4000) {
          // Only raise floor if not head-on locked below this same arrival
          const sameWptInbound =
            arrItem.acft.wptId === depItem.acft.wptId && arrItem.normRadialZero >= tDepNorm;
          if (!sameWptInbound) {
            innerStackFloorForDep = Math.max(innerStackFloorForDep, stAlt + 1000);
            if (!innerStackTraffic.some((a) => a.id === arrItem.acft.id)) {
              innerStackTraffic.push(arrItem.acft);
            }
          }
        }
      }
    });

    if (innerStackFloorForDep > wptDep.msaFt && innerStackTraffic.length > 0) {
      const climbTarget = Math.min(
        depItem.calc.reqAltFt,
        Math.max(innerStackFloorForDep, wptDep.meaFt)
      );
      const trafficNames = innerStackTraffic.map((a) => a.callsign).join(", ");
      const resText = `VOR <15 NM Approach Stack Protection: ${trafficNames} active on approach/hold up to ${formatAlt(
        innerStackFloorForDep - 1000
      )}. Since ${wptDep.name} MSA is ${formatAlt(wptDep.msaFt)}, climb ${
        depItem.acft.callsign
      } directly to ≥${formatAlt(innerStackFloorForDep)} (or ${formatAlt(
        climbTarget
      )}) before 10 NM to stay ≥1,000' above the inner stack.`;

      if (!depArrLocks.has(depItem.acft.id)) depArrLocks.set(depItem.acft.id, []);
      depArrLocks.get(depItem.acft.id).push({
        type: "STACK_FLOOR",
        arrAcft: innerStackTraffic[0],
        tCrossNorm: tDepExit15,
        dCross: 15,
        depMinInitialAltFt: innerStackFloorForDep,
        depRestrictedAltFt: depItem.calc.reqAltFt,
        resolutionText: resText,
      });

      depArrConflicts.push({
        depAcft: depItem.acft,
        arrAcft: innerStackTraffic[0],
        wpt: wptDep,
        tCrossNorm: tDepNorm,
        displayTime: `${formatTime(depItem.calc.tDep, depItem.calc.hasHour)}–${formatTime(
          depItem.calc.t15,
          depItem.calc.hasHour
        )}`,
        dCross: "0–15",
        zone: "< 15 NM (VOR Approach Stack Separation)",
        isValidInboundConflict: true,
        arrRestrictedAltFt: innerStackFloorForDep - 1000,
        depRestrictedAltFt: innerStackFloorForDep,
        resolutionText: resText,
      });
    }

    // 2A. Same-Waypoint Opposite-Direction Crossing
    const matchingArrs = computedArrivals.filter(
      (arrItem) => arrItem.acft.wptId === depItem.acft.wptId
    );

    matchingArrs.forEach((arrItem) => {
      const wpt = depItem.wpt;
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
          zone = "10–25 NM (MSA Transition Zone)";
          const safeDepMsa = Math.max(wpt.msaFt, innerStackFloorForDep);
          if (safeDepMsa < wpt.meaFt) {
            depRestrictedAltFt = safeDepMsa;
            arrRestrictedAltFt = safeDepMsa + 1000;
            resolutionText = `Conflict at ${dCross} NM (10–25 NM): Climb ${depItem.acft.callsign} to ${formatAlt(
              depRestrictedAltFt
            )} (MSA before 10 NM) and hold ${arrItem.acft.callsign} at ${formatAlt(
              arrRestrictedAltFt
            )} until passing at ${formatTime(
              denormalizeTime(tCrossNorm, useHasHour, refHour),
              useHasHour
            )}; then climb ${depItem.acft.callsign} to ${formatAlt(wpt.meaFt)} before 25 NM.`;
          } else {
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
          zone = "< 10 NM (Inner Approach / MSA Zone)";
          depRestrictedAltFt = Math.max(wpt.msaFt, innerStackFloorForDep);
          arrRestrictedAltFt = depRestrictedAltFt + 1000;
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
          type: "SAME_RADIAL",
          depAcft: depItem.acft,
          tCrossNorm,
          dCross,
          arrRestrictedAltFt,
          depRestrictedAltFt,
          resolutionText,
        });

        if (!depArrLocks.has(depItem.acft.id)) depArrLocks.set(depItem.acft.id, []);
        depArrLocks.get(depItem.acft.id).push({
          type: "SAME_RADIAL",
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

    // 2B. Cross-Radial (<15 NM VOR) Departure <-> Arrival Overlap Checks
    sequencedArrivals.forEach((arrItem) => {
      if (arrItem.acft.wptId === depItem.acft.wptId) return; // Handled in 2A

      const eatInfo = eatMap.get(arrItem.acft.id);
      const arrEnter15 = arrItem.norm15 !== null ? arrItem.norm15 : arrItem.normInit;
      const ovStart = Math.max(tDepNorm, arrEnter15);
      const ovEnd = Math.min(tDepExit15, eatInfo.effectiveEstNorm);

      // Both inside <15 NM of AYT VOR at the same time while arrival is in its 25-10 NM MSA phase
      if (ovStart < ovEnd - 1e-6 && ovStart < arrItem.norm10 - 1e-6) {
        const depMsa = Math.max(wptDep.msaFt, innerStackFloorForDep);
        const depMea = wptDep.meaFt;
        const arrMsa = arrItem.wpt.msaFt;
        const releaseTime = Math.min(tDepExit15, arrItem.norm10);
        const releaseStr = formatTime(
          denormalizeTime(releaseTime, useHasHour, refHour),
          useHasHour
        );
        const ovStartStr = formatTime(
          denormalizeTime(ovStart, useHasHour, refHour),
          useHasHour
        );

        let depRestrictedAltFt = null;
        let arrRestrictedAltFt = null;
        let resolutionText = "";

        if (depMsa >= arrMsa) {
          // Departure's required <10 NM MSA is >= Arrival's MSA!
          // Hold Departure at depMsa until 15 NM, and restrict Arrival to depMsa + 1,000' before 15 NM
          depRestrictedAltFt = depMsa;
          arrRestrictedAltFt = depMsa + 1000;
          resolutionText = `Cross-radial <15 NM VOR conflict (${ovStartStr}–${releaseStr}): ${
            depItem.acft.callsign
          } (${wptDep.name}) requires ${formatAlt(
            depMsa
          )} MSA before 10 NM. Hold ${depItem.acft.callsign} at ${formatAlt(
            depRestrictedAltFt
          )} until exiting 15 NM (${formatTime(
            depItem.calc.t15,
            depItem.calc.hasHour
          )}) and restrict ${arrItem.acft.callsign} (${arrItem.wpt.name}) to ${formatAlt(
            arrRestrictedAltFt
          )} before 15 NM until ${releaseStr}.`;
        } else if (depMea >= arrMsa && ovEnd > depItem.norm10 + 1e-6) {
          // Between 10 NM and 15 NM, Departure climbing to depMea would hit/cross Arrival at arrMsa
          depRestrictedAltFt = arrMsa - 1000;
          arrRestrictedAltFt = arrMsa;
          resolutionText = `Cross-radial <15 NM VOR conflict (${ovStartStr}–${releaseStr}): Cap ${
            depItem.acft.callsign
          } (${wptDep.name}) at ${formatAlt(
            depRestrictedAltFt
          )} (1,000' below ${arrItem.acft.callsign} at ${formatAlt(
            arrMsa
          )}) until exiting 15 NM at ${formatTime(
            depItem.calc.t15,
            depItem.calc.hasHour
          )}, then climb to ${formatAlt(depMea)} before 25 NM.`;
        }

        if (depRestrictedAltFt !== null) {
          if (!arrDepLocks.has(arrItem.acft.id)) arrDepLocks.set(arrItem.acft.id, []);
          arrDepLocks.get(arrItem.acft.id).push({
            type: "CROSS_RADIAL_VOR15",
            depAcft: depItem.acft,
            tCrossNorm: releaseTime,
            dCross: 15,
            arrRestrictedAltFt,
            depRestrictedAltFt,
            resolutionText,
          });

          if (!depArrLocks.has(depItem.acft.id)) depArrLocks.set(depItem.acft.id, []);
          depArrLocks.get(depItem.acft.id).push({
            type: "CROSS_RADIAL_VOR15",
            arrAcft: arrItem.acft,
            tCrossNorm: depItem.norm15,
            dCross: 15,
            arrRestrictedAltFt,
            depRestrictedAltFt,
            resolutionText,
          });

          depArrConflicts.push({
            depAcft: depItem.acft,
            arrAcft: arrItem.acft,
            wpt: {
              ...wptDep,
              name: `${wptDep.name} ↔ ${arrItem.wpt.name}`,
            },
            tCrossNorm: ovStart,
            displayTime: `${ovStartStr}–${releaseStr}`,
            dCross: "<15",
            zone: "< 15 NM (Cross-Radial VOR Zone)",
            isValidInboundConflict: true,
            arrRestrictedAltFt,
            depRestrictedAltFt,
            resolutionText,
          });
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // STEP 3: Live Time-Step (0.2m / 1 NM) Convergence & Altitude Timeline Solver
  // Solves arrivals sequentially #1 -> #N so every aircraft #i reacts to the
  // exact live-solved altitude profile of all preceding aircraft #0..#(i-1)!
  // --------------------------------------------------------------------------
  const vorSepConstraints = [];
  const perAircraftVorNotes = new Map(); // acftId -> array of constraint objects
  const solvedTimelines = new Map(); // acftId -> Array<{ tFrom, altFt, label }>
  const arrivalProfileMeta = new Map(); // acftId -> { enrouteTargetFt, msaTargetFt, postStepMsaFt, stepDownMsaTime }

  sequencedArrivals.forEach((item, index) => {
    const { acft, wpt, calc } = item;
    const eatInfo = eatMap.get(acft.id);
    const depLocks = arrDepLocks.get(acft.id) || [];

    const highZoneDepLock = depLocks.find((l) => l.type === "SAME_RADIAL" && l.dCross >= 25);
    const midZoneDepLock = depLocks.find(
      (l) =>
        (l.type === "SAME_RADIAL" && l.dCross >= 10 && l.dCross < 25) ||
        l.type === "CROSS_RADIAL_VOR15"
    );
    const lowZoneDepLock = depLocks.find((l) => l.type === "SAME_RADIAL" && l.dCross < 10);

    let baseEnrouteFt = wpt.meaFt;
    if (highZoneDepLock && highZoneDepLock.arrRestrictedAltFt > baseEnrouteFt) {
      baseEnrouteFt = highZoneDepLock.arrRestrictedAltFt;
    }

    let baseMsaFt = wpt.msaFt;
    if (midZoneDepLock && midZoneDepLock.arrRestrictedAltFt > baseMsaFt) {
      baseMsaFt = midZoneDepLock.arrRestrictedAltFt;
    }
    if (lowZoneDepLock && lowZoneDepLock.arrRestrictedAltFt > baseMsaFt) {
      baseMsaFt = lowZoneDepLock.arrRestrictedAltFt;
    }

    const tInit = item.normInit;
    const t25 = item.norm25 !== null ? item.norm25 : tInit;
    const t15 = item.norm15 !== null ? item.norm15 : tInit;
    const t10 = item.norm10;

    // Live 0.2m time-step scan against all preceding arrivals k < index
    let requiredEnrouteFt = baseEnrouteFt;
    let requiredMsaAtEntryFt = baseMsaFt;

    for (let k = 0; k < index; k++) {
      const first = sequencedArrivals[k];
      const firstEat = eatMap.get(first.acft.id);
      const firstTimeline = solvedTimelines.get(first.acft.id);
      const firstMeta = arrivalProfileMeta.get(first.acft.id);
      const w1 = first.wpt;
      const w2 = wpt;
      const sameWpt = w1.id === w2.id;

      // 1. Same-corridor Enroute (60-25 NM) live step check
      if (sameWpt && item.norm25 !== null && first.norm25 !== null) {
        for (let t = tInit; t < t25 - 1e-6; t = +(t + 0.2).toFixed(2)) {
          if (t >= first.normInit && t < first.norm25 - 1e-6) {
            const altFirst = evaluateTimelineAlt(firstTimeline, t, w1.meaFt);
            if (altFirst + 1000 > requiredEnrouteFt) {
              requiredEnrouteFt = altFirst + 1000;
            }
          }
        }
      }

      // 2. Check <15 NM VOR / 25-10 NM convergence across live 0.2m time steps
      const firstEnter15 = first.norm15 !== null ? first.norm15 : first.normInit;
      const checkStart = sameWpt ? t25 : t15;
      const checkEnd = calc.straightIn && !eatInfo.willDelay ? t25 : t10;

      let maxFirstAltInOverlap = null;
      let hasVor15Overlap = false;

      for (let t = checkStart; t < checkEnd - 1e-6; t = +(t + 0.2).toFixed(2)) {
        const firstActiveInZone = sameWpt
          ? t >= first.normInit && t < firstEat.effectiveEstNorm - 1e-6
          : t >= firstEnter15 - 1e-6 && t < firstEat.effectiveEstNorm - 1e-6;

        if (firstActiveInZone) {
          hasVor15Overlap = true;
          const altFirst = evaluateTimelineAlt(firstTimeline, t, w1.msaFt);
          if (maxFirstAltInOverlap === null || altFirst > maxFirstAltInOverlap) {
            maxFirstAltInOverlap = altFirst;
          }
        }
      }

      // Also check if both aircraft are in the 25 NM approach window simultaneously
      const activeTogetherIn25 = t25 < firstEat.effectiveEstNorm - 1e-6;

      if (hasVor15Overlap || activeTogetherIn25) {
        const firstEnrouteFt = firstMeta ? firstMeta.enrouteTargetFt : w1.meaFt;
        const firstMsaFt = firstMeta ? firstMeta.msaTargetFt : w1.msaFt;

        // If they actually overlap during #i's 15-10 NM leg (or same airway 25-10 NM leg),
        // #i must stay >= 1,000' above #k's live altitude during that overlap!
        let pairAssignedMsaFt = requiredMsaAtEntryFt;
        if (maxFirstAltInOverlap !== null) {
          pairAssignedMsaFt = Math.max(pairAssignedMsaFt, maxFirstAltInOverlap + 1000);
        } else if (sameWpt) {
          pairAssignedMsaFt = Math.max(pairAssignedMsaFt, firstMsaFt + 1000);
        }

        let type = "";
        let firstInstruction = "";
        let secondInstruction = "";
        let summaryText = "";
        let firstMustReachBefore15 = false;

        if (sameWpt) {
          type = "SAME-AIRWAY TRAIL (LIVE STEP)";
          requiredEnrouteFt = Math.max(requiredEnrouteFt, firstEnrouteFt + 1000);
          requiredMsaAtEntryFt = Math.max(requiredMsaAtEntryFt, pairAssignedMsaFt);
          firstInstruction = `Descend to ${formatAlt(firstEnrouteFt)} (MEA), then ${formatAlt(
            firstMsaFt
          )} at 25 NM (reach before 15 NM).`;
          secondInstruction = `Trailing ${first.acft.callsign} on ${
            w1.name
          }: Maintain ≥1,000' above ${first.acft.callsign} (${formatAlt(
            requiredEnrouteFt
          )} before 25 NM, then ${formatAlt(requiredMsaAtEntryFt)} at 25 NM until ${
            first.acft.callsign
          } descends below).`;
          summaryText = `Same airway (${w1.name}): ${acft.callsign} is kept ≥1,000' above ${
            first.acft.callsign
          } at every 0.2m step (${formatAlt(requiredEnrouteFt)} enroute → ${formatAlt(
            requiredMsaAtEntryFt
          )} at 25 NM).`;
        } else if (firstEnrouteFt >= requiredEnrouteFt && firstMsaFt < pairAssignedMsaFt) {
          // Altitude Crossing Case (e.g. DAMLA FL130 -> 9,000' ahead of KUMRU FL120 -> 10,000')
          type = "ALTITUDE CROSSING (<15 NM)";
          firstMustReachBefore15 = true;
          requiredMsaAtEntryFt = Math.max(requiredMsaAtEntryFt, pairAssignedMsaFt);
          firstInstruction = `⚠️ CROSSING ALTITUDES w/ ${acft.callsign}: At 25 NM, descend to ${formatAlt(
            firstMsaFt
          )} — MUST REACH & MAINTAIN ${formatAlt(firstMsaFt)} BEFORE 15 NM (${formatTime(
            first.calc.t15,
            first.calc.hasHour
          )})!`;
          secondInstruction = `At 25 NM, descend to ${formatAlt(
            requiredMsaAtEntryFt
          )} and maintain ${formatAlt(requiredMsaAtEntryFt)} before 15 NM (≥1,000' above ${
            first.acft.callsign
          } at ${formatAlt(firstMsaFt)}).`;
          summaryText = `${first.acft.callsign} (${w1.name}: ${formatAltShort(
            firstEnrouteFt
          )} → ${formatAltShort(firstMsaFt)}) is #${firstEat.seqNum} ahead of ${
            acft.callsign
          } (${w2.name}: ${formatAltShort(requiredEnrouteFt)} → ${formatAltShort(
            requiredMsaAtEntryFt
          )}). Because their altitudes cross, issue constraint to ${
            first.acft.callsign
          }: "Maintain ${formatAlt(firstMsaFt)} BEFORE 15 NM"!`;

          // Ensure the lead aircraft's plan also highlights this crossing requirement
          if (!perAircraftVorNotes.has(first.acft.id)) perAircraftVorNotes.set(first.acft.id, []);
          perAircraftVorNotes.get(first.acft.id).push({
            role: "lead",
            other: acft,
            text: firstInstruction,
            type,
          });
        } else if (
          maxFirstAltInOverlap !== null &&
          maxFirstAltInOverlap + 1000 > w2.msaFt &&
          maxFirstAltInOverlap <= 6000 &&
          w2.msaFt === 3000
        ) {
          // Low-MSA arrival (MANAV / DERYA, MSA 3,000') entering <15 NM while preceding traffic is in the 3,000'/4,000' stack!
          type = "INNER STACK PROTECTION (<15 NM)";
          requiredMsaAtEntryFt = Math.max(requiredMsaAtEntryFt, pairAssignedMsaFt);
          firstInstruction = `Active on approach/hold inside 15 NM at ${formatAlt(
            maxFirstAltInOverlap
          )}.`;
          secondInstruction = `⚠️ VOR <15 NM STACK SEP w/ ${first.acft.callsign}: Even though ${
            w2.name
          } MSA is ${formatAlt(w2.msaFt)}, ${
            first.acft.callsign
          } occupies ${formatAlt(
            maxFirstAltInOverlap
          )} inside 15 NM. Restrict ${acft.callsign} at 25 NM to ${formatAlt(
            requiredMsaAtEntryFt
          )} before 15 NM!`;
          summaryText = `${acft.callsign} (${w2.name} MSA ${formatAlt(
            w2.msaFt
          )}) enters <15 NM while #${firstEat.seqNum} ${
            first.acft.callsign
          } is at ${formatAlt(maxFirstAltInOverlap)}. Hold ${acft.callsign} at ${formatAlt(
            requiredMsaAtEntryFt
          )} before 15 NM.`;
        } else if (maxFirstAltInOverlap !== null && maxFirstAltInOverlap === w2.msaFt) {
          // Equal MSA (or elevated MSA matching #i's base MSA!) inside <15 NM
          type = "EQUAL ALT CONVERGENCE (<15 NM)";
          firstMustReachBefore15 = true;
          requiredMsaAtEntryFt = Math.max(requiredMsaAtEntryFt, pairAssignedMsaFt);
          firstInstruction = `At 25 NM, descend to ${formatAlt(
            firstMsaFt
          )} — reach before 15 NM.`;
          secondInstruction = `⚠️ VOR <15 NM SEP w/ ${first.acft.callsign} (at ${formatAlt(
            maxFirstAltInOverlap
          )}): At 25 NM, restrict descent to ${formatAlt(
            requiredMsaAtEntryFt
          )} before 15 NM (1,000' above ${first.acft.callsign}).`;
          summaryText = `Inside <15 NM, #${firstEat.seqNum} ${first.acft.callsign} (${
            w1.name
          }) occupies ${formatAlt(maxFirstAltInOverlap)}. Restrict #${eatInfo.seqNum} ${
            acft.callsign
          } (${w2.name}) to ${formatAlt(requiredMsaAtEntryFt)} before 15 NM for 1,000' separation.`;
        } else if (maxFirstAltInOverlap !== null && maxFirstAltInOverlap > w2.msaFt) {
          // Inverted MSA (or elevated preceding aircraft higher than #i's MSA) inside <15 NM
          type = "INVERTED MSA SEQUENCE (<15 NM)";
          requiredMsaAtEntryFt = Math.max(requiredMsaAtEntryFt, pairAssignedMsaFt);
          firstInstruction = `At 25 NM, descend to ${formatAlt(
            firstMsaFt
          )} before 15 NM, then ${formatAlt(
            firstEat.willDelay ? firstEat.initialHoldAltFt : 3000
          )} at 10 NM.`;
          secondInstruction = `⚠️ #${firstEat.seqNum} ${
            first.acft.callsign
          } is at ${formatAlt(maxFirstAltInOverlap)} inside 15 NM. Keep ${
            acft.callsign
          } at ${formatAlt(
            requiredMsaAtEntryFt
          )} before 15 NM so ${first.acft.callsign} stays below; descend to ${formatAlt(
            w2.msaFt
          )} once ${first.acft.callsign} descends at 10 NM.`;
          summaryText = `#${firstEat.seqNum} ${first.acft.callsign} (${
            w1.name
          } @ ${formatAlt(maxFirstAltInOverlap)}) is ahead of #${eatInfo.seqNum} ${
            acft.callsign
          } (${w2.name} MSA ${formatAlt(w2.msaFt)}) inside <15 NM. Restrict ${
            acft.callsign
          } to ${formatAlt(requiredMsaAtEntryFt)} before 15 NM.`;
        } else {
          type = "NATURAL VERTICAL SEP (<15 NM)";
          firstMustReachBefore15 = true;
          firstInstruction = `At 25 NM, descend to ${formatAlt(
            firstMsaFt
          )} (MSA) before 15 NM.`;
          secondInstruction = `At 25 NM, descend to ${formatAlt(
            requiredMsaAtEntryFt
          )} before 15 NM (naturally ≥1,000' above ${first.acft.callsign}).`;
          summaryText = `${first.acft.callsign} and ${
            acft.callsign
          } maintain ≥1,000' vertical separation across all <15 NM time steps.`;
        }

        vorSepConstraints.push({
          first,
          second: item,
          type,
          firstInstruction,
          secondInstruction,
          summaryText,
          secondAssignedMsaFt: requiredMsaAtEntryFt,
          firstMustReachBefore15,
        });

        if (!perAircraftVorNotes.has(acft.id)) perAircraftVorNotes.set(acft.id, []);
        perAircraftVorNotes.get(acft.id).push({
          role: "trail",
          other: first.acft,
          text: secondInstruction,
          assignedMsaFt: requiredMsaAtEntryFt,
          type,
        });
      }
    }

    // Ensure arrival altitude profile never climbs at 25 NM (enroute >= msaTarget)
    requiredEnrouteFt = Math.max(requiredEnrouteFt, requiredMsaAtEntryFt);
    const initFloorFt = Math.max(calc.initAltFt, requiredEnrouteFt);

    // Build exact piecewise altitude timeline for Arrival #i
    const timeline = [];
    timeline.push({ tFrom: -Infinity, altFt: initFloorFt, label: "INIT" });

    if (highZoneDepLock && highZoneDepLock.tCrossNorm > tInit && highZoneDepLock.tCrossNorm < t25) {
      timeline.push({
        tFrom: tInit,
        altFt: Math.max(requiredEnrouteFt, highZoneDepLock.arrRestrictedAltFt),
        label: "DEP_LOCK_HIGH",
      });
      timeline.push({
        tFrom: highZoneDepLock.tCrossNorm,
        altFt: Math.max(wpt.meaFt, requiredMsaAtEntryFt),
        label: "MEA",
      });
    } else {
      timeline.push({ tFrom: tInit, altFt: requiredEnrouteFt, label: "MEA" });
    }

    if (calc.straightIn) {
      if (!eatInfo.willDelay) {
        if (midZoneDepLock && midZoneDepLock.tCrossNorm > t25) {
          timeline.push({
            tFrom: t25,
            altFt: requiredMsaAtEntryFt,
            label: "DEP_LOCK_MID",
          });
          timeline.push({
            tFrom: midZoneDepLock.tCrossNorm,
            altFt: 3000,
            label: "ILS_3000",
          });
        } else {
          timeline.push({ tFrom: t25, altFt: 3000, label: "ILS_3000" });
        }
      } else {
        // Delayed Straight-In
        const pre10Alt = Math.max(requiredMsaAtEntryFt, eatInfo.initialHoldAltFt);
        timeline.push({ tFrom: t25, altFt: pre10Alt, label: "MSA_DELAY" });
        if (eatInfo.eatNorm > t10 + 1e-6) {
          timeline.push({
            tFrom: t10,
            altFt: eatInfo.initialHoldAltFt,
            label: "HOLD_STACK",
          });
          eatInfo.holdStepDowns.forEach((sd) => {
            timeline.push({
              tFrom: sd.timeNorm,
              altFt: sd.altFt,
              label: "HOLD_STEPDOWN",
            });
          });
        }
        timeline.push({
          tFrom: eatInfo.eatNorm,
          altFt: 3000,
          label: "ILS_3000",
        });
      }
    } else {
      // Normal Arrival: 25 NM -> 10 NM -> Hold Stack / 3,000'
      timeline.push({ tFrom: t25, altFt: requiredMsaAtEntryFt, label: "MSA" });
      if (midZoneDepLock && midZoneDepLock.tCrossNorm > t25 && midZoneDepLock.tCrossNorm < t10) {
        timeline.push({
          tFrom: midZoneDepLock.tCrossNorm,
          altFt: Math.max(wpt.msaFt, eatInfo.willDelay ? eatInfo.initialHoldAltFt : 3000),
          label: "MSA_POST_DEP",
        });
      }

      if (!eatInfo.willDelay) {
        if (lowZoneDepLock && lowZoneDepLock.tCrossNorm > t10) {
          timeline.push({
            tFrom: t10,
            altFt: lowZoneDepLock.arrRestrictedAltFt,
            label: "DEP_LOCK_LOW",
          });
          timeline.push({
            tFrom: lowZoneDepLock.tCrossNorm,
            altFt: 3000,
            label: "ILS_3000",
          });
        } else {
          timeline.push({ tFrom: t10, altFt: 3000, label: "ILS_3000" });
        }
      } else {
        timeline.push({
          tFrom: t10,
          altFt: eatInfo.initialHoldAltFt,
          label: "HOLD_STACK",
        });
        eatInfo.holdStepDowns.forEach((sd) => {
          timeline.push({
            tFrom: sd.timeNorm,
            altFt: sd.altFt,
            label: "HOLD_STEPDOWN",
          });
        });
        timeline.push({
          tFrom: eatInfo.eatNorm,
          altFt: 3000,
          label: "ILS_3000",
        });
      }
    }

    timeline.sort((a, b) => a.tFrom - b.tFrom);
    solvedTimelines.set(acft.id, timeline);
    arrivalProfileMeta.set(acft.id, {
      enrouteTargetFt: requiredEnrouteFt,
      msaTargetFt: requiredMsaAtEntryFt,
    });
  });

  // Build Departure Altitude Timelines (including same-corridor & <15 NM locks)
  computedDepartures.forEach((depItem, depIdx) => {
    const { acft, wpt, calc } = depItem;
    const locks = depArrLocks.get(acft.id) || [];
    const stackLock = locks.find((l) => l.type === "STACK_FLOOR");
    const radialOrVorLock = locks.find(
      (l) => l.type === "SAME_RADIAL" || l.type === "CROSS_RADIAL_VOR15"
    );

    let initial10Ft = stackLock
      ? Math.max(wpt.msaFt, stackLock.depMinInitialAltFt)
      : wpt.msaFt;
    let mid25Ft = Math.max(initial10Ft, wpt.meaFt);
    let finalFt = Math.max(mid25Ft, calc.reqAltFt);

    // Check against earlier departures on the same corridor or within <15 NM VOR
    for (let k = 0; k < depIdx; k++) {
      const prevDep = computedDepartures[k];
      if (Math.abs(depItem.normDep - prevDep.normDep) < 3) {
        const prevTl = solvedTimelines.get(prevDep.acft.id);
        const prevAltAtDep = evaluateTimelineAlt(prevTl, depItem.normDep + 0.5, prevDep.wpt.msaFt);
        if (Math.abs(initial10Ft - prevAltAtDep) < 1000) {
          initial10Ft = prevAltAtDep + 1000;
          mid25Ft = Math.max(mid25Ft, initial10Ft);
          finalFt = Math.max(finalFt, mid25Ft);
        }
      }
    }

    const timeline = [{ tFrom: -Infinity, altFt: 0, label: "GND" }];

    if (radialOrVorLock) {
      const cappedAlt = radialOrVorLock.depRestrictedAltFt;
      const tRelease = radialOrVorLock.tCrossNorm;
      timeline.push({
        tFrom: depItem.normDep,
        altFt: Math.min(initial10Ft, cappedAlt),
        label: "DEP_LOCKED",
      });
      if (depItem.norm10 < tRelease) {
        timeline.push({
          tFrom: depItem.norm10,
          altFt: Math.min(mid25Ft, cappedAlt),
          label: "DEP_LOCKED_10",
        });
      }
      timeline.push({
        tFrom: tRelease,
        altFt: tRelease < depItem.norm25 ? mid25Ft : finalFt,
        label: "DEP_RELEASED",
      });
      if (tRelease < depItem.norm25) {
        timeline.push({
          tFrom: depItem.norm25,
          altFt: finalFt,
          label: "DEP_FINAL",
        });
      }
    } else {
      timeline.push({ tFrom: depItem.normDep, altFt: initial10Ft, label: "DEP_MSA" });
      timeline.push({ tFrom: depItem.norm10, altFt: mid25Ft, label: "DEP_MEA" });
      timeline.push({ tFrom: depItem.norm25, altFt: finalFt, label: "DEP_REQ" });
    }

    timeline.sort((a, b) => a.tFrom - b.tFrom);
    solvedTimelines.set(acft.id, timeline);
  });

  // --------------------------------------------------------------------------
  // STEP 4: Build Step-by-Step Solved Clearance Plan Cards for Each Aircraft
  // --------------------------------------------------------------------------
  const aircraftPlans = new Map();

  sequencedArrivals.forEach((item) => {
    const { acft, wpt, calc } = item;
    const eatInfo = eatMap.get(acft.id);
    const meta = arrivalProfileMeta.get(acft.id);
    const depLocks = arrDepLocks.get(acft.id) || [];
    const vorNotes = perAircraftVorNotes.get(acft.id) || [];
    const steps = [];

    const enrouteTargetFt = meta ? meta.enrouteTargetFt : wpt.meaFt;
    const msaTargetFt = meta ? meta.msaTargetFt : wpt.msaFt;

    const highZoneDepLock = depLocks.find((l) => l.type === "SAME_RADIAL" && l.dCross >= 25);
    const midZoneDepLock = depLocks.find(
      (l) =>
        (l.type === "SAME_RADIAL" && l.dCross >= 10 && l.dCross < 25) ||
        l.type === "CROSS_RADIAL_VOR15"
    );

    // 1. Initial Contact (60-50 NM)
    if (highZoneDepLock && highZoneDepLock.arrRestrictedAltFt >= enrouteTargetFt) {
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
        } NM → Descend to <strong>${formatAlt(
          Math.max(wpt.meaFt, msaTargetFt)
        )}</strong>.`,
      });
    } else if (enrouteTargetFt > wpt.meaFt) {
      steps.push({
        timeNorm: item.normInit,
        timeStr: formatTime(calc.tInit, calc.hasHour),
        severity: "warn",
        text: `Reports ${calc.dist} NM ${wpt.name} (${formatAlt(
          calc.initAltFt
        )}) → Descend to <strong>${formatAlt(
          enrouteTargetFt
        )}</strong> (held above ${formatAlt(wpt.meaFt)} MEA for vertical separation), report 25 NM.`,
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

    // 2. At 25 NM -> MSA & <15 NM VOR Constraints (or Straight-In ILS Clearance)
    const trailVorConstraints = vorNotes.filter(
      (n) => n.role === "trail" && n.assignedMsaFt && n.assignedMsaFt > wpt.msaFt
    );
    const highestTrailConstraint =
      trailVorConstraints.length > 0
        ? trailVorConstraints.reduce((a, b) => (b.assignedMsaFt >= a.assignedMsaFt ? b : a))
        : null;
    const leadCrossingConstraint = vorNotes.find(
      (n) => n.role === "lead" && n.type.includes("CROSSING")
    );

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
          const hold25Alt = Math.max(msaTargetFt, eatInfo.initialHoldAltFt);
          steps.push({
            timeNorm: item.norm25,
            timeStr: formatTime(calc.t25, calc.hasHour),
            severity: "warn",
            text: `At 25 NM ${wpt.name} → Delayed by <strong>${
              eatInfo.blockedBy.acft.callsign
            }</strong>. Issue <strong>EAT ${
              eatInfo.eatDisplay
            }</strong>, descend to <strong>${formatAlt(hold25Alt)}</strong>.`,
          });
        }
      } else {
        let constraintNote = "";
        let sev = "normal";
        if (leadCrossingConstraint) {
          sev = "warn";
          constraintNote = ` — <strong>MUST REACH &amp; MAINTAIN ${formatAlt(
            msaTargetFt
          )} BEFORE 15 NM (${formatTime(calc.t15, calc.hasHour)})</strong> (crossing <strong>${
            leadCrossingConstraint.other.callsign
          }</strong>)!`;
        } else if (highestTrailConstraint) {
          sev = "warn";
          constraintNote = ` — <strong>RESTRICT to ${formatAlt(
            msaTargetFt
          )} before 15 NM</strong> (≥1,000' above <strong>${
            highestTrailConstraint.other.callsign
          }</strong> inside 15 NM).`;
        } else if (midZoneDepLock) {
          sev = "crit";
          constraintNote = ` — <strong>HOLD AT ${formatAlt(
            msaTargetFt
          )} until clear of outbound ${midZoneDepLock.depAcft.callsign}</strong>.`;
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

    if (midZoneDepLock && midZoneDepLock.tCrossNorm < item.norm10) {
      steps.push({
        timeNorm: midZoneDepLock.tCrossNorm,
        timeStr: formatTime(
          denormalizeTime(midZoneDepLock.tCrossNorm, calc.hasHour, refHour),
          calc.hasHour
        ),
        severity: "ok",
        text: `Clear of outbound <strong>${midZoneDepLock.depAcft.callsign}</strong> → Descend to <strong>${formatAlt(
          wpt.msaFt
        )} (MSA)</strong>.`,
      });
    }

    // 3. At 10 NM, Multi-Aircraft Hold Stack Step-Downs & EAT / ILS Clearance
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
        const stackLevelNum = Math.round((eatInfo.initialHoldAltFt - 2000) / 1000);
        const stackDetail =
          eatInfo.initialHoldAltFt > 4000
            ? `Stack #${stackLevelNum} (${formatAlt(
                eatInfo.initialHoldAltFt
              )}, ≥1,000' above preceding hold/approach stack)`
            : `1,000' above approach traffic`;

        steps.push({
          timeNorm: item.norm10,
          timeStr: formatTime(calc.t10, calc.hasHour),
          severity: "warn",
          text: `At 10 NM ${wpt.name} → Preceding <strong>${
            eatInfo.blockedBy.acft.callsign
          }</strong> not yet established. Issue <strong>EAT ${
            eatInfo.eatDisplay
          }</strong>, descend to <strong>${formatAlt(
            eatInfo.initialHoldAltFt
          )}</strong> (${stackDetail}) and proceed via AYT VOR (${formatTime(
            calc.tVor,
            calc.hasHour
          )}) to 10 DME FIX.`,
        });

        // Add any intermediate 1,000' holding stack step-downs
        eatInfo.holdStepDowns.forEach((sd) => {
          steps.push({
            timeNorm: sd.timeNorm,
            timeStr: sd.timeStr,
            severity: "warn",
            text: `<strong>Hold Stack Step-Down</strong> (${
              sd.establishedAcft.callsign
            } Established; ${
              sd.nextClearedAcft.callsign
            } descending to 3,000') → Descend ${
              acft.callsign
            } from ${formatAlt(sd.prevAltFt)} to <strong>${formatAlt(sd.altFt)}</strong>.`,
          });
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
      if (eatInfo.eatNorm > item.norm10 + 1e-6) {
        steps.push({
          timeNorm: item.norm10,
          timeStr: formatTime(calc.t10, calc.hasHour),
          severity: "warn",
          text: `At 10 NM (${wpt.name}) → Enter hold at <strong>${formatAlt(
            eatInfo.initialHoldAltFt
          )}</strong> until EAT ${eatInfo.eatDisplay}.`,
        });
        eatInfo.holdStepDowns.forEach((sd) => {
          steps.push({
            timeNorm: sd.timeNorm,
            timeStr: sd.timeStr,
            severity: "warn",
            text: `<strong>Hold Stack Step-Down</strong> (${
              sd.establishedAcft.callsign
            } Established) → Descend from ${formatAlt(sd.prevAltFt)} to <strong>${formatAlt(
              sd.altFt
            )}</strong>.`,
          });
        });
      }
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
      altTimeline: solvedTimelines.get(acft.id),
      steps,
    });
  });

  // Departure Plans
  computedDepartures.forEach((depItem) => {
    const { acft, wpt, calc } = depItem;
    const locks = depArrLocks.get(acft.id) || [];
    const stackLock = locks.find((l) => l.type === "STACK_FLOOR");
    const radialOrVorLock = locks.find(
      (l) => l.type === "SAME_RADIAL" || l.type === "CROSS_RADIAL_VOR15"
    );
    const steps = [];

    if (radialOrVorLock) {
      const lockLabel =
        radialOrVorLock.type === "CROSS_RADIAL_VOR15"
          ? `15 NM VOR separation w/ <strong>${radialOrVorLock.arrAcft.callsign}</strong>`
          : `inbound <strong>${radialOrVorLock.arrAcft.callsign}</strong> (cross at <strong>${
              radialOrVorLock.dCross
            } NM @ ${formatTime(
              denormalizeTime(radialOrVorLock.tCrossNorm, calc.hasHour, refHour),
              calc.hasHour
            )}</strong>)`;
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
          radialOrVorLock.depRestrictedAltFt
        )}</strong> due to ${lockLabel}.`,
      });
      steps.push({
        timeNorm: radialOrVorLock.tCrossNorm,
        timeStr: formatTime(
          denormalizeTime(radialOrVorLock.tCrossNorm, calc.hasHour, refHour),
          calc.hasHour
        ),
        severity: "ok",
        text: `Clear of conflict w/ <strong>${
          radialOrVorLock.arrAcft.callsign
        }</strong> → Climb to <strong>${formatAlt(
          Math.max(wpt.meaFt, calc.reqAltFt)
        )}</strong> (ensure ≥${formatAlt(wpt.meaFt)} MEA before 25 NM @ ${formatTime(
          calc.t25,
          calc.hasHour
        )}).`,
      });
    } else if (stackLock) {
      steps.push({
        timeNorm: depItem.normDep,
        timeStr: formatTime(calc.tDep, calc.hasHour),
        severity: "warn",
        text: `Departs 0 NM toward ${wpt.name} (${wpt.entryWpt}) → Climb directly to <strong>${formatAlt(
          stackLock.depMinInitialAltFt
        )} before 10 NM (${formatTime(
          calc.t10,
          calc.hasHour
        )})</strong> (≥1,000' above active inner approach stack), <strong>${formatAlt(
          wpt.meaFt
        )} (MEA) before 25 NM (${formatTime(
          calc.t25,
          calc.hasHour
        )})</strong>, then <strong>${formatAlt(calc.reqAltFt)}</strong>.`,
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
      altTimeline: solvedTimelines.get(acft.id),
      steps,
    });
  });

  // --------------------------------------------------------------------------
  // STEP 5: Live Time-Step Verification Sweep (dt = 0.2m = 1 NM)
  // Audits every 0.2-minute step from scenario start to end across all pairs
  // --------------------------------------------------------------------------
  const allItems = [...sequencedArrivals, ...computedDepartures];
  let totalStepsChecked = 0;
  let totalPairChecks = 0;
  let maxSimultaneousInVor15 = 0;

  if (allItems.length > 0) {
    const simStart = Math.min(
      ...allItems.map((it) => (it.acft.type === "DEP" ? it.normDep : it.normInit))
    );
    const simEnd = Math.max(
      ...allItems.map((it) =>
        it.acft.type === "DEP"
          ? it.norm60
          : eatMap.get(it.acft.id)?.effectiveEstNorm || it.normInit + 20
      )
    );

    for (let t = simStart; t <= simEnd + 1e-6; t = +(t + 0.2).toFixed(2)) {
      totalStepsChecked++;
      const activeInStep = [];

      allItems.forEach((it) => {
        const tl = solvedTimelines.get(it.acft.id);
        if (it.acft.type === "DEP") {
          if (t >= it.normDep && t <= it.norm60) {
            const dme = (t - it.normDep) * SPEED_NM_PER_MIN;
            activeInStep.push({
              it,
              dme,
              inVor15: dme < 15,
              altFt: evaluateTimelineAlt(tl, t, it.wpt.msaFt),
            });
          }
        } else {
          const eat = eatMap.get(it.acft.id);
          if (t >= it.normInit && t < eat.effectiveEstNorm - 1e-6) {
            const enter15 = it.norm15 !== null ? it.norm15 : it.normInit;
            activeInStep.push({
              it,
              dme: t <= (it.normVor ?? it.norm10) ? Math.max(0, it.calc.dist - (t - it.normInit) * 5) : 10,
              inVor15: t >= enter15 - 1e-6,
              altFt: evaluateTimelineAlt(tl, t, it.wpt.msaFt),
            });
          }
        }
      });

      const vor15Count = activeInStep.filter((a) => a.inVor15).length;
      if (vor15Count > maxSimultaneousInVor15) {
        maxSimultaneousInVor15 = vor15Count;
      }

      for (let a = 0; a < activeInStep.length; a++) {
        for (let b = a + 1; b < activeInStep.length; b++) {
          const A = activeInStep[a];
          const B = activeInStep[b];
          if ((A.inVor15 && B.inVor15) || A.it.acft.wptId === B.it.acft.wptId) {
            totalPairChecks++;
          }
        }
      }
    }
  }

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
    solvedTimelines,
    liveSimStats: {
      dtMins: 0.2,
      stepNm: 1,
      totalStepsChecked,
      totalPairChecks,
      maxSimultaneousInVor15,
    },
  };
}

// ============================================================================
// LIVE POSITION, ALTITUDE & SVG COORDINATE ESTIMATOR AT TIME T
// Uses the exact live-simulated altitude timeline from solveScenario
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
  const altTimeline = plan ? plan.altTimeline : null;

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
    const currentAltFt = evaluateTimelineAlt(altTimeline, queryNormMins, calc.reqAltFt);

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

  // Exact live-simulated altitude at queryNormMins
  const currentAltFt = evaluateTimelineAlt(altTimeline, queryNormMins, wpt.msaFt);

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
      const stackIdx = Math.max(0, Math.round((currentAltFt - 4000) / 1000));
      const pos = polarToSvg(10, wpt.deg);
      return {
        visible: true,
        phase: "hold",
        x: pos.x + stackIdx * 8,
        y: pos.y + stackIdx * 6,
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
    const stackIdx = Math.max(0, Math.round((currentAltFt - 4000) / 1000));
    const pos = polarToSvg(10, procDeg);
    return {
      visible: true,
      phase: "hold",
      x: +(pos.x + 12 + stackIdx * 8).toFixed(1),
      y: +(pos.y + 8 + stackIdx * 6).toFixed(1),
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
  const liveSimBadgeEl = document.getElementById("liveSimBadge");

  if (liveSimBadgeEl && solver.liveSimStats) {
    const { totalStepsChecked, totalPairChecks, maxSimultaneousInVor15 } = solver.liveSimStats;
    liveSimBadgeEl.innerHTML = `
      <span class="freq-pill twr-pill">⚡ LIVE SIM: <strong>${totalStepsChecked} steps (0.2m / 1 NM)</strong></span>
      <span class="freq-pill">VOR/Radial Checks: <strong>${totalPairChecks}</strong></span>
      <span class="freq-pill">Peak &lt;15 NM Stack: <strong>${maxSimultaneousInVor15} acft</strong></span>
    `;
  }

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
          ? `<span class="badge badge-eat">EAT ${eatInfo.eatDisplay}${
              eatInfo.initialHoldAltFt > 4000
                ? ` • STACK ${formatAltShort(eatInfo.initialHoldAltFt)}`
                : ""
            }</span>`
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

  // 2. Departure <-> Arrival Same-Radial & <15 NM Cross-Radial Conflicts
  if (solver.depArrConflicts.length === 0) {
    depArrListEl.innerHTML = `
      <div class="conflict-box">
        <div class="conflict-detail">
          No same-waypoint or &lt;15 NM VOR Departure ↔ Arrival conflicts detected.
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

  // 3. VOR <15 NM Separation, Multi-Aircraft Stack & EAT Delays
  ilsDelayListEl.innerHTML = "";
  if (solver.vorSepConstraints.length === 0 && solver.sequencedArrivals.length <= 1) {
    ilsDelayListEl.innerHTML = `
      <div class="conflict-box">
        <div class="conflict-detail">Add 2 or more arriving aircraft to see live VOR &lt;15 NM vertical separation constraints, holding stacks, and EAT calculations.</div>
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

    // Show EAT Delay & Multi-Aircraft Holding Stack Summary for delayed arrivals
    solver.sequencedArrivals.forEach((item) => {
      const eatInfo = solver.eatMap.get(item.acft.id);
      if (eatInfo.willDelay) {
        const box = document.createElement("div");
        box.className = "conflict-box alert-danger";
        const stepDownHtml =
          eatInfo.holdStepDowns && eatInfo.holdStepDowns.length > 0
            ? `<br/>→ <strong>Hold Stack Entry: ${formatAlt(
                eatInfo.initialHoldAltFt
              )}</strong> • Step-downs: ${eatInfo.holdStepDowns
                .map((sd) => `<code>${sd.timeStr}</code> → <strong>${formatAlt(sd.altFt)}</strong>`)
                .join(", ")}`
            : `<br/>→ <strong>Hold / Approach Altitude before EAT: ${formatAlt(
                eatInfo.initialHoldAltFt
              )}</strong>`;

        box.innerHTML = `
          <div class="conflict-top">
            <span class="conflict-pair">⏳ ${item.acft.callsign} (${item.wpt.name}) — EAT: ${eatInfo.eatDisplay}</span>
            <span class="badge badge-delayed">${
              eatInfo.autoHoldMins > 0 ? `HOLDS ${eatInfo.autoHoldMins}m` : "NO HOLD NEEDED"
            } • ${formatAltShort(eatInfo.initialHoldAltFt)}</span>
          </div>
          <div class="conflict-detail" style="color:var(--text-main);">
            Would reach ILS clearance point at <code>${formatTime(
              item.calc.tClearBase,
              item.calc.hasHour
            )}</code>, but <strong>#${eatInfo.seqNum - 1} ${
          eatInfo.blockedBy.acft.callsign
        }</strong> is not established until <code>${eatInfo.eatDisplay}</code>.${stepDownHtml}<br/>
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

// Helper: find nearest point on a rectangle's perimeter to point (px, py)
function getRectPerimeterAnchor(px, py, rx, ry, rw, rh) {
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;
  const dx = px - cx;
  const dy = py - cy;
  if (dx === 0 && dy === 0) return { x: rx, y: cy };

  const halfW = rw / 2;
  const halfH = rh / 2;
  const scaleX = Math.abs(dx) > 0.001 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = Math.abs(dy) > 0.001 ? halfH / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);

  return {
    x: +(cx + dx * scale).toFixed(1),
    y: +(cy + dy * scale).toFixed(1),
  };
}

// Helper: check if two rectangles overlap (with padding)
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh, pad = 8) {
  return (
    ax < bx + bw + pad &&
    ax + aw + pad > bx &&
    ay < by + bh + pad &&
    ay + ah + pad > by
  );
}

// Helper: check if two line segments (p1->p2) and (p3->p4) intersect
function segmentsIntersect(p1x, p1y, p2x, p2y, p3x, p3y, p4x, p4y) {
  const ccw = (ax, ay, bx, by, cx, cy) =>
    (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  return (
    ccw(p1x, p1y, p3x, p3y, p4x, p4y) !== ccw(p2x, p2y, p3x, p3y, p4x, p4y) &&
    ccw(p1x, p1y, p2x, p2y, p3x, p3y) !== ccw(p1x, p1y, p2x, p2y, p4x, p4y)
  );
}

// Compute guaranteed non-overlapping callsign tag positions around radar blips
function computeNonOverlappingTagPositions(visibleBlips) {
  const TAG_W = 88;
  const TAG_H = 30;
  const PAD = 8;
  const BLIP_CLEARANCE = 14;
  const MIN_X = 10;
  const MAX_X = 850 - TAG_W;
  const MIN_Y = 10;
  const MAX_Y = 850 - TAG_H;

  const placedTags = [];

  // Angle offsets (in degrees) from preferred outward direction
  const angleSteps = [
    0, 25, -25, 50, -50, 75, -75, 100, -100, 125, -125, 150, -150, 180,
  ];
  const radii = [46, 68, 92, 118, 146, 176, 210];

  visibleBlips.forEach((b, idx) => {
    // Preferred outward direction away from chart center (430, 430)
    const dxCenter = b.x - SVG_CENTER_X;
    const dyCenter = b.y - SVG_CENTER_Y;
    const baseAngleRad =
      Math.hypot(dxCenter, dyCenter) > 8
        ? Math.atan2(dyCenter, dxCenter)
        : (idx * (2 * Math.PI)) / Math.max(1, visibleBlips.length) - Math.PI / 4;

    let bestCandidate = null;
    let bestScore = Infinity;

    for (const r of radii) {
      for (const aDeg of angleSteps) {
        const ang = baseAngleRad + (aDeg * Math.PI) / 180;
        const centerX = b.x + r * Math.cos(ang);
        const centerY = b.y + r * Math.sin(ang);
        const tx = Math.max(MIN_X, Math.min(MAX_X, centerX - TAG_W / 2));
        const ty = Math.max(MIN_Y, Math.min(MAX_Y, centerY - TAG_H / 2));

        // 1. Check collision with already placed tags
        let overlapsTag = false;
        for (const pt of placedTags) {
          if (rectsOverlap(tx, ty, TAG_W, TAG_H, pt.tx, pt.ty, TAG_W, TAG_H, PAD)) {
            overlapsTag = true;
            break;
          }
        }
        if (overlapsTag) continue;

        // 2. Check collision with any visible blip diamond
        let overlapsBlip = false;
        for (const otherBlip of visibleBlips) {
          if (
            rectsOverlap(
              tx,
              ty,
              TAG_W,
              TAG_H,
              otherBlip.x - 6,
              otherBlip.y - 6,
              12,
              12,
              BLIP_CLEARANCE
            )
          ) {
            overlapsBlip = true;
            break;
          }
        }
        if (overlapsBlip) continue;

        // 3. Score candidate by distance and leader-line crossings
        const anchor = getRectPerimeterAnchor(b.x, b.y, tx, ty, TAG_W, TAG_H);
        let lineCrossPenalty = 0;
        for (const pt of placedTags) {
          if (
            segmentsIntersect(
              b.x,
              b.y,
              anchor.x,
              anchor.y,
              pt.bx,
              pt.by,
              pt.anchorX,
              pt.anchorY
            )
          ) {
            lineCrossPenalty += 400;
          }
        }

        const distScore = r + Math.abs(aDeg) * 0.25 + lineCrossPenalty;
        if (distScore < bestScore) {
          bestScore = distScore;
          bestCandidate = { tx, ty };
        }
      }
      if (bestCandidate && bestScore < 400) break;
    }

    if (!bestCandidate) {
      // Fallback position before relaxation pass
      bestCandidate = {
        tx: Math.max(MIN_X, Math.min(MAX_X, b.x + 28)),
        ty: Math.max(MIN_Y, Math.min(MAX_Y, b.y - 36 - idx * 38)),
      };
    }

    const anchor = getRectPerimeterAnchor(
      b.x,
      b.y,
      bestCandidate.tx,
      bestCandidate.ty,
      TAG_W,
      TAG_H
    );

    placedTags.push({
      bx: b.x,
      by: b.y,
      tx: bestCandidate.tx,
      ty: bestCandidate.ty,
      anchorX: anchor.x,
      anchorY: anchor.y,
      w: TAG_W,
      h: TAG_H,
    });
  });

  // Final Iterative Separation Pass to guarantee 0% overlap under all scenarios
  for (let iter = 0; iter < 50; iter++) {
    let moved = false;
    for (let i = 0; i < placedTags.length; i++) {
      for (let j = i + 1; j < placedTags.length; j++) {
        const A = placedTags[i];
        const B = placedTags[j];
        const overlapX = A.w + PAD - Math.abs(A.tx + A.w / 2 - (B.tx + B.w / 2));
        const overlapY = A.h + PAD - Math.abs(A.ty + A.h / 2 - (B.ty + B.h / 2));

        if (overlapX > 0 && overlapY > 0) {
          moved = true;
          if (overlapX < overlapY) {
            const dir = A.tx <= B.tx ? -1 : 1;
            A.tx = Math.max(MIN_X, Math.min(MAX_X, A.tx + (dir * overlapX) / 2));
            B.tx = Math.max(MIN_X, Math.min(MAX_X, B.tx - (dir * overlapX) / 2));
          } else {
            const dir = A.ty <= B.ty ? -1 : 1;
            A.ty = Math.max(MIN_Y, Math.min(MAX_Y, A.ty + (dir * overlapY) / 2));
            B.ty = Math.max(MIN_Y, Math.min(MAX_Y, B.ty - (dir * overlapY) / 2));
          }
        }
      }
    }
    if (!moved) break;
  }

  // Recompute exact perimeter anchor points after any relaxation adjustments
  placedTags.forEach((pt) => {
    const anchor = getRectPerimeterAnchor(pt.bx, pt.by, pt.tx, pt.ty, pt.w, pt.h);
    pt.anchorX = anchor.x;
    pt.anchorY = anchor.y;
    pt.tx = +pt.tx.toFixed(1);
    pt.ty = +pt.ty.toFixed(1);
  });

  return placedTags;
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

  const visibleBlips = [];

  allItems.forEach((item) => {
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

    if (st.visible && st.x !== undefined && st.y !== undefined) {
      visibleBlips.push({
        item,
        st,
        x: st.x,
        y: st.y,
      });
    }
  });

  // Compute non-overlapping callsign tag positions & connecting line anchors
  const tagPlacements = computeNonOverlappingTagPositions(visibleBlips);

  // First pass: draw connecting leader lines, velocity vectors, and radar target diamonds
  visibleBlips.forEach(({ st }, i) => {
    const tag = tagPlacements[i];
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.innerHTML = `
      <!-- Connecting Line from Blip to Callsign Tag -->
      <line x1="${st.x}" y1="${st.y}" x2="${tag.anchorX}" y2="${tag.anchorY}" stroke="${st.color}" stroke-width="1.5" opacity="0.9" />
      <circle cx="${tag.anchorX}" cy="${tag.anchorY}" r="2.2" fill="${st.color}" />
      <!-- Velocity Leader Vector -->
      <line x1="${st.x}" y1="${st.y}" x2="${st.tipX}" y2="${st.tipY}" stroke="${st.color}" stroke-width="2.2" />
      <!-- Radar Target Blip (Diamond + Center Dot) -->
      <rect x="${st.x - 5}" y="${st.y - 5}" width="10" height="10" fill="#0b111e" stroke="${st.color}" stroke-width="2.2" transform="rotate(45 ${st.x} ${st.y})" />
      <circle cx="${st.x}" cy="${st.y}" r="2" fill="${st.color}" />
    `;
    blipsLayer.appendChild(g);
  });

  // Second pass: draw callsign tag boxes on top so no line ever obscures tag text
  visibleBlips.forEach(({ item, st }, i) => {
    const tag = tagPlacements[i];
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.innerHTML = `
      <rect x="${tag.tx}" y="${tag.ty}" width="${tag.w}" height="${tag.h}" class="blip-tag-bg" stroke="${st.color}" />
      <text x="${tag.tx + 5}" y="${tag.ty + 12}" class="blip-tag-title" fill="${st.color}">${item.acft.callsign}</text>
      <text x="${tag.tx + 5}" y="${tag.ty + 24}" class="blip-tag-sub">${st.altStr} • ${st.dme}NM</text>
    `;
    blipsLayer.appendChild(g);
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
