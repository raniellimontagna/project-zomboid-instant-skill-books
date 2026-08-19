# Task 2 Report: Build 42 metadata and installation documentation

## Implementation

- Added `InstantSkillBooks/42/mod.info` with the Build 42.20 package metadata:
  - `name=Instant Skill Book Reading`
  - `id=InstantSkillBooks`
  - descriptive summary of the server-authoritative one-tick behavior
  - `author=OpenAI`
  - `modversion=1.0.0`
  - `pzversion=42.20`
- Added `InstantSkillBooks/README.md` with:
  - local installation under `%UserProfile%\Zomboid\mods\InstantSkillBooks`;
  - dedicated-server installation and `Mods=InstantSkillBooks` configuration;
  - instructions to distribute the same folder to all clients and restart the server;
  - an explicit statement that no Workshop item ID exists yet;
  - all seven multiplayer acceptance checks from the design specification.
- Extended `work/instant-skill-books-tests/test/instant-skill-books.test.js` with a package-layout test that parses `mod.info` key/value lines and checks the required metadata and exact shared Lua entry path.

## TDD evidence

### RED

Before adding `mod.info`, the complete suite was run with:

```text
C:\Users\ranielli\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test
```

Result: 1 passing behavioral test and 1 failing package test. The expected failure was:

```text
AssertionError [ERR_ASSERTION]: 42/mod.info exists
false !== true
```

### GREEN

After adding the metadata and README, the same complete suite passed:

```text
✔ skill-book duration is shortened only for eligible books
✔ Build 42 package includes required metadata and shared entry point
ℹ tests 2
ℹ pass 2
ℹ fail 0
```

## Files changed

- `InstantSkillBooks/42/mod.info` (new)
- `InstantSkillBooks/README.md` (new)
- `work/instant-skill-books-tests/test/instant-skill-books.test.js` (package-layout test)
- `.superpowers/sdd/2026-08-18-instant-skill-book-reading/task-2-report.md` (this report)

## Self-review

- Metadata uses the exact required mod identifier and PZ version (`InstantSkillBooks` and `42.20`).
- The README's install path matches the package's top-level folder and names the exact shared Lua entry file.
- Dedicated-server and client instructions consistently require the same local folder, and the server configuration uses the exact `Mods=InstantSkillBooks` identifier.
- The README does not invent a Workshop item ID and explicitly instructs operators not to add one.
- The acceptance checklist preserves the specification's seven checks, including vanilla behavior and multiplayer validation boundaries.
- The package test checks metadata through parsed key/value lines rather than depending on line order.

## Concerns

- Project Zomboid is not installed in this workspace, so live in-game multiplayer acceptance remains for the server administrator (Task 3/final verification).
- Compatibility beyond Build 42.20 remains best-effort because vanilla timed-action and literature APIs can change.
