---
objective: "The client renders every UX/UI string and every card's name/description in either French or English, switchable at runtime. Server-originated messages (rejection reasons, errors) are out of scope — they stay as generic English text, not treated as a translation surface."
status: implemented
---

# Plan: i18n translations (FR/EN)

## Overview

| Field      | Value                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| **Goal**   | Add French + English translations for UI copy and card content, switchable at runtime |
| **Source** | User chat request: "add translation files for UX/UI and cards, support french and english, use Transloco with local files" |

## Phases

| #   | Phase                          | File                          |
| --- | ------------------------------ | ------------------------------ |
| 1   | Transloco setup + lang switch  | [`phase-1.md`](./phase-1.md)  |
| 2   | UI copy migration              | [`phase-2.md`](./phase-2.md)  |
| 3   | Card content i18n              | [`phase-3.md`](./phase-3.md)  |

## Resources

| Source                                              | Verified                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `npm view @jsverse/transloco peerDependencies`       | `@angular/core >=16.0.0`, `rxjs >=6.0.0` — compatible with client's Angular 22 |
| `npm view @jsverse/transloco versions`               | Current package name/scope is `@jsverse/transloco` (successor to the archived `@ngneat/transloco`); latest stable `8.4.0` |

## Decisions

| Decision                                                                                          | Why                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library: `@jsverse/transloco` with an HTTP loader over local JSON in `client/public/i18n/`         | Matches user's own suggestion; runtime language switch without a per-locale build (unlike `@angular/localize`); actively maintained (ngx-translate/`@ngneat/transloco` is not); single scope suffices at this app's copy volume |
| Card `name`/`description` move out of `CardDefinition` (`shared/src/cards/card.ts`) into client-only translation JSON keyed by card `id` | Confirmed server never reads `.name`/`.description` (grep of `server/src`) — display text is a pure client concern. Keeping it in `shared` would force the engine package to carry presentation strings it never uses, and per `project-brief.md` new card variants should slot in by `id` without touching the engine |
| Server-originated messages (`ActionRejected.reason`, room-join rejections) stay English, untranslated — out of scope | User call: these are generic, non-precise backend strings by design (not meant to leak infra/engine detail), and i18n is a frontend concern only. No protocol change, no server touch. `table-rules.ts`'s own local pre-checks (phase 2's `errors.*`/`REASON_TEXT`) still get translated since those are pure client strings already |
