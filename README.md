# AYT TMA Radarless Approach Calculator (`radarlesscalc`)

Live Web App: **https://efeeyc.github.io/radarlesscalc/**

Quick pre-scenario and live calculator for **AYT TMA Radarless Approach** classes (`5 NM / 1 min` = 300 kt GS).

## Calculation Rules
- **Speed**: `5 NM / 1 minute`
- **Normal Approach**:
  1. **First Report (`60 NM` or `50 NM`)** → Instruct to report `25 NM` (`+7 min` from 60 NM, `+5 min` from 50 NM)
  2. **`25 NM`** → Instruct to report `10 NM` (`+3 min`)
  3. **`10 NM`** → **Clear for ILS**
  4. **`AYT VOR`** → `+2 min` after 10 NM
  5. **`10 DME FIX`** → `+2 min` after AYT VOR
  6. **Full Established & Sent to TWR (`118.1`)** → `+5 min` after 10 DME FIX
- **Straight-In Exceptions (`VA-16`)**:
  - **RWY 36 Active + South (`DERYA` / `R-170`)**: Straight-In to RWY 36
  - **RWY 18 Active + North (`KUMRU` / `R-350`)**: Straight-In to RWY 18
  - Flow: First Report (`60/50 NM`) → `25 NM` (**Clear for ILS**) → `10 NM` (`+3 min`, **Full Established & Sent to TWR `118.1`**, no 5-min procedure turn).
