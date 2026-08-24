# Shared Map Enhancer B42 v0.1.0

Shared Map Enhancer is a standalone Project Zomboid Build **42.20+** mod for small cooperative sessions. It synchronizes categorized map markers while keeping every state-changing operation server-authoritative: clients send intent and display only server-confirmed snapshots and deltas.

![Shared Map Enhancer cover](../../docs/assets/shared-map-enhancer-cover.png)

## Local installation and release package

Copy the contents of `outputs/SharedMapEnhancer-0.1.0.zip` (the `SharedMapEnhancer/42/` tree) into the server's `mods/` directory and install the same source on every client. Enable it on the server with exactly:

```ini
Mods=SharedMapEnhancer
```

Restart after enabling it. This is a local package; it has no Workshop manifest or Workshop ID. Do not add it to `WorkshopItems=`. The ZIP is intentionally ignored by Git and is built only from `mods/SharedMapEnhancer/42/`.

## Behaviour and limits

The server validates and persists at most **500 markers**. Each player may make **one mutation per player per second**. Every requestId must be 1–64 characters and duplicate requestIds are idempotent per authenticated player. Titles are capped at 80 characters and notes at 240 characters. Durations are `permanent`, `1h`, `8h`, `24h`, or `7d`; expired or corrupt records are discarded individually.

The seven categories are `Base`, `Loot`, `Danger`, `Vehicle`, `Medicine`, `Fuel`, and `Expedition`. A marker has a title, optional note, category, colour, icon, coordinates, and duration. The creator may edit or remove their own marker. An administrator may remove any marker. Clients cannot author marker identity, timestamps, expiration, or revision.

## Live two-client acceptance checklist

On a dedicated B42.20+ session, connect two clients and verify: create and synchronize a marker; independent category filters; creator edit/remove permissions; administrator removal; expiration; joining-player synchronization; and persistence after a server restart (persistence after restart). Record this live two-client acceptance separately from the automated contract tests.

The mod does not add tasks, rewards, contracts, progression, player tracking, route planning, world edits, item grants, or required Discord integration.
