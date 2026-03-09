# zCALC

A web-based financial calculator emulator inspired by the HP 12C. Runs entirely in the browser as a single-page PWA — no build system, bundler, or package manager required.

**Live demo:** https://fcalc.ltime.me

## Features

- **Financial functions** — TVM (n, i, PV, PMT, FV), amortization, NPV, IRR, bond price/yield
- **Depreciation** — straight-line, sum-of-years'-digits, declining balance
- **Statistics** — summation, mean, standard deviation, linear regression
- **Date arithmetic** — day-count between dates, future date calculation (M.DY and D.MY formats)
- **RPN entry** — 4-level stack with ENTER, R↓, x⇄y, LASTx
- **Programmable** — keystroke programming with branching (GTO, x≤y, x=0)
- **Storage registers** — STO/RCL with arithmetic operations
- **Persistent state** — calculator memory saved to localStorage
- **PWA** — installable, fullscreen, landscape-locked on supported devices

## Getting Started

No build step needed. Serve the files with any static HTTP server:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

## Keyboard Shortcuts

The calculator responds to physical keyboard input in addition to mouse/touch:

- `0`–`9`, `.` — digit entry
- `+`, `-`, `*`, `/` — arithmetic
- `Enter` — ENTER (push stack)
- `Backspace` — CLx
- `f`, `g` — modifier keys (orange/blue shift)
- `n`, `i`, `v` (PV), `m` (PMT), `u` (FV) — financial registers

## Project Structure

```
index.html        — application shell and calculator UI
style.css         — all styling (responsive scaling, key layout, LCD display)
src/
  main.js         — entry point, bootstraps calculator
  machine.js      — core state machine (modes, memory, stack, registers)
  keyboard.js     — key mapping and input handling
  display.js      — LCD rendering (7-segment digits)
  dispatcher.js   — maps key presses to calculator operations
  financial.js    — TVM, NPV, IRR, amortization, bonds
  statistics.js   — statistical accumulation and functions
  math-functions.js — scientific math operations
  date-utils.js   — date arithmetic
  program.js      — keystroke programming mode
  storage.js      — localStorage persistence
  constants.js    — shared constants and enumerations
  utils.js        — utility helpers
  debug.js        — debugging utilities
manifest.json     — PWA manifest (fullscreen, landscape)
sw.js             — service worker
```

## License

All rights reserved.
