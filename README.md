# Instant Skill Books for Project Zomboid B42

<p align="center">
  <img src="assets/instant-skill-books-cover.png" alt="Instant Skill Books B42 cover" width="256" height="256">
</p>

Instant Skill Books makes eligible skill books complete in one timed-action tick while preserving Project Zomboid's native server-authoritative validation, page completion, synchronization, and XP multipliers.

Recipe magazines, maps, newspapers, ordinary literature, books outside the useful skill range, and Illiterate characters retain vanilla behavior.

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

The distributable mod is in [`InstantSkillBooks/`](InstantSkillBooks/). The behavior tests use Node.js and Fengari:

```powershell
cd work/instant-skill-books-tests
pnpm install --frozen-lockfile
node --test
```

Live multiplayer acceptance still needs to be performed against the target Project Zomboid server build.

## Future coop mods

The next planned projects are documented in [`docs/superpowers/specs/2026-08-23-coop-quality-of-life-roadmap.md`](docs/superpowers/specs/2026-08-23-coop-quality-of-life-roadmap.md):

- **Smart Storage B42** — nearby, server-validated storage organization.
- **Shared Map Enhancer B42** — synchronized map markers for small coop sessions.

These are intentionally separate future mods and do not change the current Instant Skill Books/Instant Learning behavior.

## License

MIT — see [`LICENSE`](LICENSE).
