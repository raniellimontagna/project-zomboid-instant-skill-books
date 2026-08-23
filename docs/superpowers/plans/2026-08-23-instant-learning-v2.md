# Instant Learning v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-configurable instant completion for recipe magazines while preserving the existing instant skill-book behavior and reserving safe disabled settings for technical manuals and educational VHS.

**Architecture:** Extend the existing shared `ISReadABook:getDuration()` wrapper. It calls vanilla duration exactly once, then checks server-provided `SandboxVars.InstantLearning` toggles and item capabilities; only enabled skill books or recipe magazines return duration `1`. Vanilla `complete()` remains responsible for pages, recipes, XP, item state, and synchronization.

**Tech Stack:** Project Zomboid Build 42.20 Lua 5.1 dialect; Build 42 `media/sandbox-options.txt`; JSON sandbox translations; Node.js built-in test runner; Fengari.

**Spec:** `docs/superpowers/specs/2026-08-23-instant-learning-v2-design.md`

## Global Constraints

- Target Project Zomboid Build 42.20+ and keep Workshop ID `3786090811` and Mod ID `InstantSkillBooks`.
- `InstantSkillBooks = true` by default; `InstantRecipeMagazines = false` by default; `InstantTechnicalManuals = false` by default; `InstantEducationalVHS = false` by default.
- Affect only skill books recognized by `SkillBook[item:getSkillTrained()]` with positive pages and recipe magazines exposing a non-empty `item:getLearnedRecipes()` collection.
- Preserve vanilla behavior for ordinary literature, newspapers, comics, maps, disabled categories, invalid metadata, and API errors.
- Call vanilla `ISReadABook:getDuration()` exactly once before eligibility checks.
- Do not directly mutate pages, recipes, XP, inventory, networking, or timed-action completion state.
- Use `media/sandbox-options.txt` and read settings through `SandboxVars.InstantLearning` with safe defaults when absent.
- The same Workshop version must be installed on the server and every client because shared Lua and sandbox options participate in multiplayer validation.

---

### Task 1: Extend the duration predicate and tests

**Files:**
- Modify: `InstantSkillBooks/42/media/lua/shared/InstantSkillBooks/InstantSkillBooks.lua`
- Modify: `work/instant-skill-books-tests/test/instant-skill-books.test.js`

**Interfaces:**
- Consumes: `ISReadABook`, `SkillBook`, `SandboxVars.InstantLearning`, `CharacterTrait.ILLITERATE`, and `item:getLearnedRecipes()`.
- Produces: `InstantSkillBooks.isEligible(action) -> boolean` and the existing wrapped `ISReadABook:getDuration() -> number`.

- [ ] **Step 1: Add failing tests for the v2 behavior**

Extend the Fengari fake environment with `SandboxVars.InstantLearning` and a recipe-magazine item whose `getLearnedRecipes():isEmpty()` returns `false`. Add literal assertions for:

```text
skill book + skill option true       -> 1
skill book + skill option false      -> 777
recipe magazine + recipe option true -> 1
recipe magazine + recipe option false -> 777
ordinary literature + all options    -> 777
manual/VHS-shaped item + options true -> 777
missing settings                     -> skill books 1, recipes 777
learnedRecipes missing or empty      -> 777
```

Retain the existing assertions that vanilla duration is called once and that API failures return `777` with no client-side diagnostic.

- [ ] **Step 2: Run the focused test and verify RED**

Run from `work/instant-skill-books-tests`:

```powershell
node --test
```

Expected: the new option/category cases fail because the current wrapper only recognizes skill books and has no sandbox toggle logic.

- [ ] **Step 3: Implement the minimal predicate extension**

Add safe option readers that treat absent values as `true` for skill books and `false` for every other category. Preserve the existing useful-level and Illiterate checks. Recognize a recipe magazine only when `getLearnedRecipes` exists, returns a collection, and that collection is not empty. Keep technical/VHS paths unrecognized. Keep the existing protected call and server-only diagnostic around eligibility.

- [ ] **Step 4: Run the full suite and verify GREEN**

Run `node --test` again. Expected: every behavior case passes with zero failures and pristine output.

- [ ] **Step 5: Commit the implementation and tests**

```powershell
git add InstantSkillBooks/42/media/lua/shared/InstantSkillBooks/InstantSkillBooks.lua work/instant-skill-books-tests/test/instant-skill-books.test.js
git commit -m "feat: add configurable recipe magazine reading"
```

### Task 2: Register Build 42 sandbox options and translations

**Files:**
- Create: `InstantSkillBooks/42/media/sandbox-options.txt`
- Create: `InstantSkillBooks/42/media/lua/shared/Translate/EN/Sandbox.json`
- Create: `InstantSkillBooks/42/media/lua/shared/Translate/PTBR/Sandbox.json`
- Modify: `work/instant-skill-books-tests/test/instant-skill-books.test.js`

**Interfaces:**
- Consumes: the four option names and defaults from the spec.
- Produces: Build 42 sandbox metadata that exposes `SandboxVars.InstantLearning.InstantSkillBooks`, `.InstantRecipeMagazines`, `.InstantTechnicalManuals`, and `.InstantEducationalVHS`.

- [ ] **Step 1: Add failing metadata tests**

Add tests that read the real `sandbox-options.txt`, assert `VERSION = 1`, assert all four exact option names, assert `type = boolean`, and assert defaults `true,false,false,false`. Parse both translation files and assert every option has an English and Brazilian Portuguese label plus tooltip.

- [ ] **Step 2: Run tests and verify RED**

Run `node --test` from the test package. Expected: metadata tests fail because the sandbox file and translation files do not yet exist.

- [ ] **Step 3: Add sandbox metadata and translations**

Use the strict Build 42 syntax:

```text
VERSION = 1,
option InstantLearning.InstantSkillBooks { type = boolean, default = true, page = InstantLearning, translation = InstantLearning_InstantSkillBooks, },
option InstantLearning.InstantRecipeMagazines { type = boolean, default = false, page = InstantLearning, translation = InstantLearning_InstantRecipeMagazines, },
option InstantLearning.InstantTechnicalManuals { type = boolean, default = false, page = InstantLearning, translation = InstantLearning_InstantTechnicalManuals, },
option InstantLearning.InstantEducationalVHS { type = boolean, default = false, page = InstantLearning, translation = InstantLearning_InstantEducationalVHS, },
```

Use translation keys `Sandbox_InstantLearning`, `Sandbox_InstantLearning_InstantSkillBooks`, `Sandbox_InstantLearning_InstantSkillBooks_tooltip`, and the same suffix pattern for the other three options. Explain in each tooltip that the setting is server/world authoritative; explain that manuals and VHS are reserved for a later update and currently do nothing.

- [ ] **Step 4: Run the full suite and verify GREEN**

Run `node --test`. Expected: behavior and metadata tests pass.

- [ ] **Step 5: Commit the option registration**

```powershell
git add InstantSkillBooks/42/media/sandbox-options.txt InstantSkillBooks/42/media/lua/shared/Translate work/instant-skill-books-tests/test/instant-skill-books.test.js
git commit -m "feat: expose Instant Learning sandbox options"
```

### Task 3: Update documentation, Workshop package, and verification

**Files:**
- Modify: `README.md`
- Modify: `InstantSkillBooks/README.md`
- Modify: `InstantSkillBooks/42/mod.info`
- Modify: `outputs/InstantSkillBooks-Workshop/workshop.txt` (generated delivery copy)
- Create: `outputs/InstantSkillBooks-Workshop-Ready-v2.zip`

**Interfaces:**
- Consumes: v2 option names, defaults, Workshop ID `3786090811`, and the verified source tree.
- Produces: documented v2 release and a Workshop-ready ZIP with the same top-level layout used by the published item.

- [ ] **Step 1: Add failing documentation/package assertions**

Extend package checks to assert that the README files mention all four option names and their defaults, `modversion=2.0.0`, and Workshop ID `3786090811`. Assert that the Workshop staging copy contains the new sandbox file and both translation files.

- [ ] **Step 2: Run tests and verify RED**

Run `node --test`. Expected: release assertions fail because documentation and version metadata still describe v1.

- [ ] **Step 3: Update release metadata and docs**

Set `modversion=2.0.0`, document the four independent settings with the two active defaults, explain that manuals/VHS are visible but inactive, and update the Workshop description while preserving private/public status from the existing item. Stage the complete `InstantSkillBooks` folder under `outputs/InstantSkillBooks-Workshop/Contents/mods/InstantSkillBooks` and add `common/` if the existing Workshop package uses it.

- [ ] **Step 4: Run verification before packaging**

Run `node --test`, `git diff --check`, and a forbidden-reference scan over production Lua for `sendClientCommand`, `sendServerCommand`, `setAlreadyReadPages`, `addXpMultiplier`, direct recipe grants, and inventory mutation. Expected: all tests pass, diff check is clean, and the scan has zero matches.

- [ ] **Step 5: Build and inspect the v2 Workshop ZIP**

Create `outputs/InstantSkillBooks-Workshop-Ready-v2.zip` from the staging folder. Inspect it read-only and assert the exact required files exist: `preview.png`, `workshop.txt`, `Contents/mods/InstantSkillBooks/42/mod.info`, `42/media/sandbox-options.txt`, both translation JSON files, and the shared Lua file. Assert no tests, `node_modules`, design docs, or worktree artifacts are included.

- [ ] **Step 6: Commit docs and packaging source**

```powershell
git add README.md InstantSkillBooks/README.md InstantSkillBooks/42/mod.info
git commit -m "docs: prepare Instant Learning v2 release"
```

- [ ] **Step 7: Publish source and report live verification boundary**

Push the source commits to GitHub after tests pass. Do not automatically publish the Workshop update; the server owner must upload the new Workshop package and test both toggles in a live Build 42.20 multiplayer save.
