# Project Brief

What this project is, the problem it solves, and its domain language. The non-derivable "why", not the "how".

## What it is

- `happy-card-game`: a small web card game (no canvas), inspired by the "Happy Smile" board game, playable by 2-4 friends who join through an invite link.

## Why it exists

- A lightweight, well-designed digital version of a casual friend-group card game: no accounts, no matchmaking, no setup friction — one link, then play.

## Domain language

| Term | Meaning |
| ---- | ------- |
| Room | An ephemeral game session created by one player and joined by others via an invite link/code |
| Card variant | A configurable set of card types/rules; the base ruleset ships first, others come later without changing the engine |

## Key features

- The game's rules implemented faithfully, not a rough approximation
- A genuinely polished UI/UX, not just a functional one
- 2-4 player rooms joined purely by link, no accounts
- Card types defined upfront so new variants can be configured later
