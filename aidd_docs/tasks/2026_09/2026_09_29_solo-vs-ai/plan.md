---
objective: "A player can start a solo game against 1-3 AI opponents that pursue happiness points and only lightly use malus cards against the human."
status: implemented
---

# Plan: Solo mode vs AI

## Overview

| Field      | Value                                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**   | Add a solo mode: server-side bot seats in a normal room, a happiness-maximizing strategy, and a deliberately restrained malus policy         |
| **Source** | Text: "Add a solo game mode where you can play against AI. AI must have a strategy to get happiness points but harassing player with malus must be lightweight as it could be unfun" |

## Phases

| #   | Phase                                  | File                         |
| --- | -------------------------------------- | ---------------------------- |
| 1   | Shared protocol: solo start + bot flag | [`phase-1.md`](./phase-1.md) |
| 2   | Server: bot seats and solo room        | [`phase-2.md`](./phase-2.md) |
| 3   | Server: bot strategy (pure)            | [`phase-3.md`](./phase-3.md) |
| 4   | Server: bot turn runner                | [`phase-4.md`](./phase-4.md) |
| 5   | Client: solo entry point and bot seats | [`phase-5.md`](./phase-5.md) |

## Decisions

| Decision                                                                                         | Why                                                                                                                                              |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bots are server-side seats in a normal `Room` and act through `GameEngine.takeTurnAction`        | Server stays sole source of truth; bots obey the exact same rules as humans, no second engine, no client-side AI                                 |
| Bot strategy is a pure function of game state, separate from the turn runner (timers)            | Deterministic and unit-testable with an injected RNG; the timer layer stays thin                                                                 |
| Malus is a fallback, not a plan: only when no play gains happiness, only against a clear leader, never skip-turn on a human, per-human cooldown, none in the first rounds | Meets "lightweight malus": the human is never chain-locked or targeted early; malus cards the bot cannot use responsibly are discarded          |
| Single difficulty, 1-3 bots chosen by the player, human always seat 1                            | Smallest scope that delivers the ask; difficulty and seat randomization are additive later                                                       |
| Bot moves are delayed (~1s) by an injectable scheduler                                           | The played-cards row (`GameState.playedCards`) must be visible to the human between moves; tests inject a synchronous scheduler                  |
