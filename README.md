# Project Zomboid B42 Mods

<p align="center">
  <img src="assets/instant-skill-books-cover.png" alt="Instant Skill Books B42 cover" width="256" height="256">
</p>

This repository contains independent Project Zomboid Build 42 mods. Each mod keeps its own source, identity, tests, documentation, and release packaging.

## Instant Skill Books v2.0.0

See the complete [Instant Skill Books guide](mods/InstantSkillBooks/README.md). Its source is in [`mods/InstantSkillBooks/`](mods/InstantSkillBooks/).

Instant Skill Books v2.0.0 makes selected eligible learning items complete in one timed-action tick while preserving Project Zomboid's native server-authoritative validation, page completion, synchronization, and XP multipliers.

## Instant Learning settings

The server/world sandbox page **Instant Learning** has four independent settings. The server applies these settings authoritatively to every player in the world.

- `InstantSkillBooks` — default: `true`. Eligible skill books finish instantly.
- `InstantRecipeMagazines` — default: `false`. Eligible recipe magazines finish instantly when enabled.
- `InstantTechnicalManuals` — default: `false`. Visible for future compatibility, but currently inactive.
- `InstantEducationalVHS` — default: `false`. Visible for future compatibility, but currently inactive.

Technical manuals and educational VHS therefore retain vanilla behavior even when their visible settings are enabled. Maps, newspapers, ordinary literature, books outside the useful skill range, and Illiterate characters also retain vanilla behavior.

## Steam Workshop

[Subscribe to Instant Skill Books](https://steamcommunity.com/sharedfiles/filedetails/?id=3786090811)

- Workshop ID: `3786090811`
- Mod ID: `InstantSkillBooks`
- Target: Project Zomboid Build 42.20+

Dedicated-server configuration:

```ini
WorkshopItems=3786090811
Mods=InstantSkillBooks
```

Install the same Workshop version on the server and every client because the shared timed-action Lua participates in checksum validation.

## Development

The distributable mod is in [`mods/InstantSkillBooks/`](mods/InstantSkillBooks/). The behavior tests use Node.js and Fengari:

```powershell
cd work/instant-skill-books-tests
pnpm install --frozen-lockfile
node --test
```

Live multiplayer acceptance still needs to be performed against the target Project Zomboid server build.

## Smart Storage B42

Smart Storage is an independent, server-authoritative nearby-storage organizer. It adds a **Depositar itens compatíveis** inventory action and moves only eligible player-owned items into compatible nearby containers after server-side validation.

See the [Smart Storage guide](mods/SmartStorage/README.md). Smart Storage has no Workshop manifest or Workshop ID until the user creates its separate Workshop item.

The test package is in [`work/smart-storage-tests/`](work/smart-storage-tests/) and runs with Node.js and Fengari:

```powershell
cd work/smart-storage-tests
pnpm install --frozen-lockfile
node --test
```

## Future coop mods

The next planned projects are documented in [`docs/superpowers/specs/2026-08-23-coop-quality-of-life-roadmap.md`](docs/superpowers/specs/2026-08-23-coop-quality-of-life-roadmap.md):

- **Smart Storage B42** — nearby, server-validated storage organization.
- **Shared Map Enhancer B42** — synchronized map markers for small coop sessions.

These are intentionally separate future mods and do not change the current Instant Skill Books/Instant Learning behavior.

## License

MIT — see [`LICENSE`](LICENSE).
