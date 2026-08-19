# Task 1 Report — Behavioral eligibility tests and shared override

## Implementation

- Added an isolated CommonJS Node test package at `work/instant-skill-books-tests` with exact Fengari dev dependency `0.1.4` and a `node --test` script.
- Added a Fengari-backed behavioral test that loads the real production Lua file, replaces `require` with a no-op, defines fake vanilla `ISReadABook`, `SkillBook`, and `CharacterTrait` globals, and exercises the seven required cases.
- Added `InstantSkillBooks/42/media/lua/shared/InstantSkillBooks/InstantSkillBooks.lua`.
- The shared Lua file requires the vanilla timed action, creates the global `InstantSkillBooks` namespace, and uses `_durationWrapped` as a double-load guard.
- `InstantSkillBooks.isEligible(action)` fails closed unless the action has an item and character, the item has positive pages, the item skill is recognized by `SkillBook`, the character is not Illiterate, and the vanilla trained-level bounds accept the character's next perk level.
- The wrapper calls the saved vanilla `ISReadABook.getDuration` first and returns `1` only when `isEligible` is true; all other durations are returned unchanged.

## TDD evidence

### RED

Command, run from `work/instant-skill-books-tests`:

```text
C:\Users\ranielli\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test
```

Result before production Lua existed:

```text
✖ skill-book duration is shortened only for eligible books
Error: ENOENT: no such file or directory, open '...\\InstantSkillBooks\\42\\media\\lua\\shared\\InstantSkillBooks\\InstantSkillBooks.lua'
tests 1
pass 0
fail 1
EXIT_CODE=1
```

### GREEN

The same bundled Node command after the minimal Lua implementation:

```text
✔ skill-book duration is shortened only for eligible books
tests 1
pass 1
fail 0
cancelled 0
skipped 0
EXIT_CODE=0
```

The table-driven test covers eligible skill book → `1`, ordinary literature → `777`, zero-page literature → `777`, too-advanced skill book → `777`, obsolete skill book → `777`, Illiterate character → `777`, and missing item → `777`. Every case also asserts one vanilla duration call.

## Files

- `work/instant-skill-books-tests/package.json`
- `work/instant-skill-books-tests/pnpm-lock.yaml`
- `work/instant-skill-books-tests/test/instant-skill-books.test.js`
- `InstantSkillBooks/42/media/lua/shared/InstantSkillBooks/InstantSkillBooks.lua`

The installed `work/instant-skill-books-tests/node_modules` directory is ignored and is not part of the commit.

## Self-review

- The wrapper is limited to `getDuration`; it does not change pages, XP, inventory, network commands, or completion behavior.
- Vanilla duration initialization runs before eligibility classification, preserving vanilla state setup and validation.
- Eligibility mirrors the bundled vanilla `ISReadABook` checks using `SkillBook[skill].perk`, `getLvlSkillTrained()`, `getMaxLevelTrained()`, `getPerkLevel()`, and `hasTrait(CharacterTrait.ILLITERATE)`.
- Positive-page gating deliberately leaves zero-page and non-skill literature on vanilla duration.

## Concerns

- Live Project Zomboid Build 42.20 multiplayer behavior cannot be exercised in this workspace; in-game server/client acceptance remains for the administrator.
- The integration assumes the vanilla shared `TimedActions/ISReadABook` and its documented Build 42.20 item/character methods are loaded before this file.
