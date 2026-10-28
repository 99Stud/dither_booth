---
title: "0007 — The code is published under FSL-1.1-ALv2"
description: "Dither Booth's source is public under the Functional Source License: free to use except to compete, Apache 2.0 two years after each release."
sidebar:
  order: 8
---

**The repository is licensed under FSL-1.1-ALv2 (`LICENSE.md`). Anyone may read, run, change and share the code, except to offer a product or service that competes with Dither Booth. Each version becomes Apache 2.0 two years after it is released.**

Status: accepted, 2026-10-28

## Context

- The repository is public on GitHub and had no licence, so by default nobody else could legally use, copy or change it.
- We sell Dither Booth: the booths, the software on them, the Hub and Studio. A permissive licence (MIT, Apache 2.0) would let anyone sell the same booth with our software.
- We still want the code open to read, audit, fork for one's own use, and to contribute to.
- AGPL-3.0 keeps the code open but lets a competitor sell it as is. Dual-licensing on top of it would need a contributor licence agreement from everyone.
- BUSL-1.1 does what we need, but each release must name its own allowed uses and change date.
- FSL-1.1 is a fixed text that does the same with nothing to configure.

## Decision

- `LICENSE.md` holds FSL-1.1-ALv2, unchanged except its copyright line: `Copyright 2026 99Stud`.
- The root `package.json` declares `"license": "FSL-1.1-ALv2"` (its SPDX id). The workspaces stay `private` and unpublished.
- The README names the licence and links here.

## Consequences

- The code is "fair source", not open source by the OSI definition. It must not be described as "open source" without that nuance.
- A competing photo booth product or service can't use this code for two years after each release. After that, each version is Apache 2.0, as a licence fixed at release.
- Contributions are accepted under the same licence: a contributor licence agreement isn't needed.
- The name **Dither Booth**, its mark and the kits' artwork are not licensed for reuse by this choice; protecting the name is a trademark matter.
- Third-party code and fonts in the repository keep their own licences (for example the fonts' OFL).
- Changing the licence later only affects new versions: published versions keep the licence they were released under.
