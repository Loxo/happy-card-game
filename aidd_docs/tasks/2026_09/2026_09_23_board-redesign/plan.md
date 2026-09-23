---
objective: "The game board (and the theme tokens it sits on) matches the 'Happy Card Game — Board' Claude Design artifact, with no server/protocol change and the existing test suite green."
status: pending
---

# Plan: Board redesign — dark-wood theme

## Overview

| Field      | Value                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| **Goal**   | Implement the redesigned game board (dark-wood/felt theme, category color+icon system, fanned hand, felt table) into the Angular client. |
| **Source** | Claude Design artifact "Happy Card Game — Board", https://claude.ai/artifact/K6ZXzpnzS39iQkkw6QEBGH, version `1790170234-eca1` — plus user request in-thread. |

## Phases

| #   | Phase                          | File                          |
| --- | ------------------------------- | ----------------------------- |
| 1   | Design system foundations      | [`phase-1.md`](./phase-1.md)  |
| 2   | Shared card-face component     | [`phase-2.md`](./phase-2.md)  |
| 3   | Board chrome & felt table      | [`phase-3.md`](./phase-3.md)  |
| 4   | Opponent seats                 | [`phase-4.md`](./phase-4.md)  |
| 5   | Player panel & tableau         | [`phase-5.md`](./phase-5.md)  |
| 6   | Fanned hand & action bar       | [`phase-6.md`](./phase-6.md)  |

## Resources

| Source                                                                 | Verified                                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| https://claude.ai/artifact/K6ZXzpnzS39iQkkw6QEBGH (v1790170234-eca1)    | Full markup read; source of every color/spacing/icon decision below.     |
| `client/angular.json`                                                  | `anyComponentStyle` budget caps at 8kB/component — constrains card-face.css. |
| `client/src/index.html`                                                | Currently loads Fraunces 500/600 + Karla 400/500/700; design needs 600/700/900 + 700/800. |
| `client/src/app/game/game-board.spec.ts`                               | Load-bearing selectors identified: `.seat`, `.disconnected`, `.card`, `.menu .btn-outline`, `.reason`, `.hint`, `.played-row`, `.played-slot`, `.error`, `.game-over`, `app-tableau` text content. All must survive the restyle. |

## Decisions

| Decision                                                                                          | Why                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep UI chrome (buttons, status lines) in English; render category **labels** (Emploi, Flirt…) in French. | User call: matching the mockup's French chrome would touch every template plus rewrite ~6 test assertions. Category labels sit next to already-French card content, not action chrome — low-risk exception. |
| Extract a shared `card-face` component (size: `mini`\|`tableau`\|`hand`) instead of tripling the card markup. | The design repeats the same card anatomy (icon header, illustration placeholder, name/description/footer) at three call sites; one component keeps `anyComponentStyle`'s 8kB budget sane and avoids drift between the three copies. |
| Remap `styles.css` root tokens (`--color-bg`, `--color-surface`, …) to the dark-wood palette instead of adding board-only tokens. | `home.css` / `room.css` already consume these same `var()` names — this reskins the lobby/home pages for free with zero edits to their files, without expanding this plan into a full lobby redesign. |
| Player-panel header (avatar, resource pills) lives in `game-board.html` around `<app-tableau>`, not inside `Tableau` itself. | Keeps `Tableau`'s responsibility to "render the category grid" — matches its current single-purpose shape. |
| No new icon library — one closed-set `Icon` component with a `@switch` over a fixed name union. | Finite, enumerable icon set (7 categories + 3 resources + ~5 chrome icons); avoids `[innerHTML]` sanitization and keeps every icon diffable/typed. |
