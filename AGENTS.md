# Boop agent rules

## Visual layout validation (2026-10-15)

Review the **whole rendered page**, not just isolated controls, before declaring
UI changes complete. Check desktop, tablet, phone, and either side of layout
breakpoints. Inspect screenshots for composition, text wrapping/clipping, useful
board size, and spacing; also assert actual selector widths, label fit, overflow,
and non-overlap in the browser. Passing DOM-presence tests is not visual approval.

Reserve space for the board and player pools together. Do not force a fixed-width
canvas into a narrower page while allowing the pools to flex-shrink. Change the
layout at a breakpoint rather than squeezing names and selectors.

Origin: the previous 896px page retained a 760px canvas and two shrinking player
pools. The selectors and player names were visibly squashed, but isolated element
checks were incorrectly reported as a successful UI review. Nick called it out:
"You can't do UI design without looking. Make it right."

## Animation/input handoff validation

Measure perceived handoff latency from actual rendered actor landing/settling to
the visible ghost and an accepted click, with the pointer stationary. Do not
start timing from input unlock or status disappearance: that hides stale timing
allowances. Include on-board boops and off-board cosmetic returns; preserve a
negative control that restores the old timing.
