# Instant Skill Book Reading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable Project Zomboid 42.20 multiplayer mod that reduces eligible skill-book reading to one server-authoritative timed-action tick.

**Architecture:** Load after vanilla `TimedActions/ISReadABook` and wrap only `ISReadABook:getDuration()`. Call the original method first, then return `1` only when `SkillBook` recognizes the book and the character is neither illiterate nor outside the book's useful skill range; vanilla `complete()` performs all page, multiplier, and synchronization changes.

**Tech Stack:** Project Zomboid Build 42.20 Lua 5.1 dialect; Node.js built-in test runner; Fengari Lua VM for isolated behavioral tests; PowerShell packaging checks.

**Spec:** `docs/superpowers/specs/2026-08-18-instant-skill-book-reading-design.md`

## Global Constraints

- Target Project Zomboid 42.20 stable and use the Build 42 versioned mod layout.
- Affect only literature recognized by `SkillBook[item:getSkillTrained()]` with a positive page count.
- Preserve vanilla behavior for magazines, recipes, maps, newspapers, ordinary literature, too-advanced books, obsolete books, and Illiterate characters.
- Do not add custom network commands or directly change pages, XP, recipes, or inventory state.
- Keep the mod installed on both server and clients because the overridden timed action is shared and participates in checksum validation.
- The workspace is not a Git repository, so commit steps are intentionally omitted; the final ZIP is the recoverable delivery snapshot.

---

### Task 1: Behavioral eligibility tests and minimal shared override

**Files:**
- Create: `work/instant-skill-books-tests/package.json`
- Create: `work/instant-skill-books-tests/test/instant-skill-books.test.js`
- Create: `InstantSkillBooks/42/media/lua/shared/InstantSkillBooks/InstantSkillBooks.lua`

**Interfaces:**
- Consumes: vanilla globals `ISReadABook`, `SkillBook`, and `CharacterTrait.ILLITERATE`.
- Produces: `InstantSkillBooks.isEligible(action) -> boolean` and the wrapped `ISReadABook:getDuration() -> number`.

- [ ] **Step 1: Create the isolated test package**

Create `package.json` with `type: commonjs`, a `node --test` script, and `fengari` pinned as a development dependency. Install it only under `work/instant-skill-books-tests`; it is not shipped with the mod.

- [ ] **Step 2: Write the failing behavior tests**

Use Fengari to create a Lua state, replace `require` with a no-op, define a fake vanilla `ISReadABook.getDuration` returning `777`, and load the real production Lua path. Table-driven cases must assert these literal results:

```text
eligible skill book                 -> 1
ordinary literature                 -> 777
zero-page literature                -> 777
skill book too advanced             -> 777
skill book obsolete                 -> 777
Illiterate character                -> 777
missing item                        -> 777
```

Also assert that the original duration function is called exactly once in every case, protecting vanilla initialization.

- [ ] **Step 3: Run the tests and verify RED**

Run the bundled Node executable with `--test` from `work/instant-skill-books-tests`. Expected failure: the production Lua file cannot be opened because it has not been created.

- [ ] **Step 4: Implement the minimum shared override**

Create the production Lua with a global namespaced table and double-load guard. Save the original `ISReadABook.getDuration`, implement `isEligible` using positive pages, `SkillBook`, current perk level, trained level bounds, and `CharacterTrait.ILLITERATE`; call the original duration first and return `1` only for eligible actions.

- [ ] **Step 5: Run the tests and verify GREEN**

Run the complete Node test suite. Expected result: all seven cases pass with zero failures and no Lua errors.

### Task 2: Build 42 metadata and installation documentation

**Files:**
- Create: `InstantSkillBooks/42/mod.info`
- Create: `InstantSkillBooks/README.md`

**Interfaces:**
- Consumes: mod identifier `InstantSkillBooks` and Build 42.20 layout.
- Produces: locally installable mod directory and server/client setup instructions.

- [ ] **Step 1: Write a failing package-layout test**

Extend the Node test suite to verify that `42/mod.info` exists; parse its `key=value` lines and assert literal values for `id=InstantSkillBooks`, `pzversion=42.20`, and a non-empty `name`. Assert the shared Lua entry file exists at its exact Build 42 path.

- [ ] **Step 2: Run the package test and verify RED**

Run the complete Node test suite. Expected failure: `42/mod.info` does not exist.

- [ ] **Step 3: Add metadata and README**

Create `mod.info` with name, ID, description, author, semantic mod version, and minimum PZ version. Document local installation under `%UserProfile%\Zomboid\mods\InstantSkillBooks`, enabling `Mods=InstantSkillBooks` on the dedicated server, distributing the same folder to clients, restarting the server, and the seven acceptance checks from the spec. Clearly state that no Workshop item ID exists yet.

- [ ] **Step 4: Run tests and verify GREEN**

Run the complete Node test suite. Expected result: behavioral and package tests all pass.

### Task 3: Delivery archive and final verification

**Files:**
- Create: `outputs/InstantSkillBooks-B42.20-v1.0.0.zip`

**Interfaces:**
- Consumes: verified `InstantSkillBooks/` source tree.
- Produces: ZIP whose top-level folder is `InstantSkillBooks` and which extracts directly into a user's Zomboid `mods` directory.

- [ ] **Step 1: Run static syntax and source checks**

Load the production file through Fengari using the fake vanilla environment, run all Node behavioral/package tests, and verify there is no `sendClientCommand`, `sendServerCommand`, `setAlreadyReadPages`, `addXpMultiplier`, or inventory mutation in mod production code.

- [ ] **Step 2: Build the ZIP**

Use `Compress-Archive` with the explicit `InstantSkillBooks` directory as input and the explicit output path. Do not include `work`, tests, downloaded vanilla source, or design documents.

- [ ] **Step 3: Inspect the ZIP manifest**

Open the archive read-only and assert that it contains exactly the README, `42/mod.info`, and the shared Lua entry below the `InstantSkillBooks` top-level folder.

- [ ] **Step 4: Run final verification**

Run the full tests again after packaging and report exact pass/fail counts. State explicitly that live in-game verification remains for the server administrator because Project Zomboid is not installed in this workspace.
