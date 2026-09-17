---
objective: "A working happy-card-game MVP: 2-4 players join a room via invite link, play the full ruleset on a server-authoritative Node+ws backend, rendered by an Angular SPA with optimistic updates and rollback."
status: pending
---

# Plan: Card game core (MVP)

## Overview

| Field      | Value                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| **Goal**   | Ship the full client/server/shared scaffold and the playable game loop |
| **Source** | `aidd_docs/INSTALL.md`                                                 |

## Phases

| #   | Phase                                    | File                          |
| --- | ------------------------------------------ | ----------------------------- |
| 1   | Workspace scaffold                         | [`phase-1.md`](./phase-1.md)  |
| 2   | Shared protocol & card model               | [`phase-2.md`](./phase-2.md)  |
| 3   | Server: room lifecycle                     | [`phase-3.md`](./phase-3.md)  |
| 4   | Server: authoritative game engine          | [`phase-4.md`](./phase-4.md)  |
| 5   | Client: Home & Lobby                       | [`phase-5.md`](./phase-5.md)  |
| 6   | Client: Game board + optimistic sync       | [`phase-6.md`](./phase-6.md)  |

## Resources

| Source                                                                 | Verified                                                                                     |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [ws GitHub repo](https://github.com/websockets/ws)                        | No built-in rooms/broadcast — must track clients ourselves via `wss.clients` or our own map    |
| [pnpm workspace docs](https://pnpm.io/pnpm-workspace_yaml)                 | `pnpm-workspace.yaml` `packages:` field takes glob patterns (`client`, `server`, `shared`)      |

## Decisions

| Decision                                        | Why                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Server holds all game state; client is a renderer  | Avoids host-migration/host-disconnect fragility a peer-authoritative model would carry     |
| No WebRTC, WS-only through a thin Node backend     | Removes NAT/STUN/TURN entirely; the small always-on backend cost is accepted               |
| pnpm workspaces (`client`, `server`, `shared`)     | Keeps the WS protocol and card types in one typed source instead of duplicated             |
| Vitest as the test runner across all packages      | User's explicit choice for coding assertions                                               |
| Server auto-draws for the active player at turn start; the player then plays exactly one of play/discard/use-malus | Confirmed ruleset: hand always ends a turn at 5 cards |
| Game ends at a fixed round limit, or earlier if the deck is empty and every hand is empty | Confirmed end condition; winner is whoever holds the most happiness points |
| Resources (happiness/education/money) are computed live from a player's current table, never a one-way banked counter | A card can be discarded from the table or replaced by an upgrade, so its contribution must be able to disappear |
| An upgrade card replaces the old card entirely (old one discarded, its resources stop counting) | User's explicit call, over stacking or merging resources |
| Category caps/exclusions/prerequisites can be bypassed by a card whose own `bypassCap`/`bypassExclusion` names that category, while it stays on the table | Matches the stated "infidelity lets you play flirt despite married" and "a bonus overrides the flirt cap" examples |
