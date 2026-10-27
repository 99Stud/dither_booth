---
title: "0003 — Logos are kept as they print"
description: "An uploaded logo is turned black and white at upload; the booth keeps only that PNG, never the original."
sidebar:
  order: 4
---

**An uploaded partner logo is turned into the black and white PNG the printer will print, and the booth keeps only that.**

Status: accepted, 2026-10-26

## Context

Staff upload partner logos as PNG or SVG, usually in colour. The printer has no grey: after the screenshot, every pixel darker than 210 (`GRAPHICS_BLACK_CUTOFF`) prints black and the rest disappear. A logo kept as uploaded would look one way in admin and another on paper, and a pale one could print as nothing without anyone noticing before the event.

An SVG is also a document: it can carry scripts and links to other files. Served as is, the booth would have to make sure it is only ever shown as an image.

## Decision

At upload, the engine (`prepareLogo`, `apps/engine/src/domains/logo-library/`) draws the file with sharp, flattens it on white, applies the printer's cutoff, trims the white margins, scales it to at most 144 px tall (the row's 72 px at the screenshot's 2×), applies the cutoff again, and writes a 1-bit PNG. Only that PNG is stored (`data/logos/<id>.png`). The original file, and any SVG, is dropped.

## Consequences

- Admin shows each logo exactly as it prints, so a logo that prints badly is caught when it is uploaded.
- The booth never serves an SVG or any file it didn't make itself.
- Every logo is trimmed to its ink, so logos sit at a similar size in the row without a size setting.
- A change to the conversion (another cutoff, dithering greys instead of cutting them) only reaches logos uploaded after it: older ones have to be uploaded again.
- A file that is all white or too light is refused, since it would print nothing.
