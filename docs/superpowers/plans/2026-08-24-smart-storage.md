# Smart Storage B42 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone server-authoritative Smart Storage B42 mod and reorganize the repository as a multi-mod monorepo without changing the published Instant Skill Books archive.

**Architecture:** Move the existing source to `mods/InstantSkillBooks/` and add `mods/SmartStorage/`. Smart Storage separates pure settings/classification/protection/selection logic from server transfer and client presentation. The client sends only intent; the server re-reads inventory, settings, nearby containers, ownership, access, distance, and capacity before every transfer.

**Tech Stack:** Project Zomboid Build 42.20+ Lua 5.1, Build 42 sandbox metadata/translations, vanilla inventory/context/network events, vanilla transfer synchronization, Node.js built-in test runner, and Fengari.

**Spec:** `docs/superpowers/specs/2026-08-24-smart-storage-design.md`

## Global Constraints

- Target Build 42.20+.
- Keep `InstantSkillBooks`, Workshop ID `3786090811`, v2 behavior, and archive layout unchanged.
- Use new Mod ID `SmartStorage`; do not couple runtime or Workshop packages.
- Defaults enabled: `Food`, `Tools`, `Medicine`, `Construction`; disabled: `Weapons`, `Ammo`, `Clothing`, `Literature`, `Fuel`, `Farming`, `Fishing`.
- Classify by explicit full-type allowlist, then vanilla tags, then exact vanilla category; use configurable `CategoryPriority` for overlaps; never use display-name heuristics.
- Protect equipped/worn, favorite, broken/low-condition, non-player-owned, filled-container, unknown, ambiguous, and unavailable items.
- Scan only the player inventory/owned bags and nearby loaded world containers; no whole-map scan or background sorting.
- Rate-limit to one request per player per second, cap `MaxItemsPerRequest`, and make request IDs idempotent.
- Do not create/delete items, repair or alter condition/quantity, or invent a Smart Storage Workshop ID.
- Run pure tests and package checks before live two-client acceptance.

---

### Task 1: Migrate the repository and scaffold the new mod

**Files:**
- Move `InstantSkillBooks/` to `mods/InstantSkillBooks/`
- Modify `README.md`, `.gitignore`, and the moved Instant Skill Books README
- Modify `work/instant-skill-books-tests/test/instant-skill-books.test.js`
- Create `mods/SmartStorage/42/mod.info`
- Create `mods/SmartStorage/README.md`
- Create `work/smart-storage-tests/package.json`, `pnpm-lock.yaml`, and `test/smart-storage.test.js`

**Interfaces:**
- Produces moved Instant Skill Books paths and a Smart Storage test package using Fengari and script `node --test`.
- Smart Storage metadata is exactly:
```text
name=Smart Storage B42
id=SmartStorage
modversion=0.1.0
pzversion=42.20
versionMin=42.20.0
```

- [ ] Add migration tests for the moved Instant Skill Books path, unchanged `id=InstantSkillBooks`/v2 metadata, and the exact Smart Storage metadata above.
- [ ] Run both package tests with the bundled Node directory on `PATH`; expect RED because the move/scaffold do not exist.
- [ ] Use `git mv`, update all test and README paths, add the metadata and README, and keep outputs ignored without ignoring source/tests/docs. State that Smart Storage has no Workshop manifest until the user creates its item.
- [ ] Run `pnpm --dir work/instant-skill-books-tests test` and `pnpm --dir work/smart-storage-tests test`; expect all tests green.
- [ ] Commit `chore: organize repository for multiple mods`.

### Task 2: Add pure settings and classification

**Files:**
- Create `mods/SmartStorage/42/media/lua/shared/SmartStorage/Settings.lua`
- Create `mods/SmartStorage/42/media/lua/shared/SmartStorage/Classifier.lua`
- Modify `work/smart-storage-tests/test/smart-storage.test.js`

**Interfaces:**
- `SmartStorage.Settings.read() -> settings`
- `SmartStorage.Settings.parseList(value) -> stringSet`
- `SmartStorage.Classifier.matches(item, category, settings) -> boolean`
- `SmartStorage.Classifier.classify(item, settings) -> categoryOrNil`

- [ ] Add failing Fengari cases for Food, Weapon, AMMO, IS_SEED, explicit full-type allowlists, overlaps resolved by `CategoryPriority`, disabled categories, unknown items, malformed settings, and absence of display-name matching.
- [ ] Run `pnpm --dir work/smart-storage-tests test`; expect RED because modules are absent.
- [ ] Implement safe defaults: Food/Tools/Medicine/Construction true; all other categories false; `SearchRadius=3`, `MaxItemsPerRequest=200`, `LowConditionPercent=25`; parse comma lists by trimming and discarding empty entries.
- [ ] Implement explicit allowlist → tag → exact category matching and priority filtering. Unknown APIs/settings must fail closed without throwing.
- [ ] Run the full Smart Storage test package and commit `feat: add Smart Storage category classifier`.

### Task 3: Register sandbox options and item protections

**Files:**
- Create `mods/SmartStorage/42/media/sandbox-options.txt`
- Create EN/PTBR `Sandbox.json` translations
- Create `mods/SmartStorage/42/media/lua/shared/SmartStorage/Protection.lua`
- Modify `work/smart-storage-tests/test/smart-storage.test.js`

**Interfaces:**
- `SmartStorage.Protection.check(item, character, settings) -> allowed, reason`
- Sandbox values are read through `SandboxVars.SmartStorage`.

- [ ] Add failing tests for `VERSION = 1`, all 11 category booleans, `SearchRadius=3`, `MaxItemsPerRequest=200`, `LowConditionPercent=25`, category priority/list options, and EN/PTBR label plus tooltip keys.
- [ ] Add protection cases for equipped/worn, favorite, broken, low-condition, filled-container, unknown, and valid items; expect RED.
- [ ] Add exact option names `SmartStorage.Food`, `Tools`, `Medicine`, `Construction`, `Weapons`, `Ammo`, `Clothing`, `Literature`, `Fuel`, `Farming`, `Fishing`, integer options, priority, and per-category comma-separated container-type strings. Verify real B42.20 container IDs before choosing defaults; unknown IDs never match.
- [ ] Make `Protection.check` fail closed and return stable reasons `equipped`, `worn`, `favorite`, `low_condition`, `filled_container`, or `invalid`.
- [ ] Run all Smart Storage tests and commit `feat: add Smart Storage settings and item protections`.

### Task 4: Add server selection and validated transfer

**Files:**
- Create `mods/SmartStorage/42/media/lua/shared/SmartStorage/Selection.lua`
- Create `mods/SmartStorage/42/media/lua/server/SmartStorage/Server.lua`
- Create `mods/SmartStorage/42/media/lua/server/SmartStorage/Transfer.lua`
- Modify `work/smart-storage-tests/test/smart-storage.test.js`

**Interfaces:**
- `SmartStorage.Selection.choose(candidates, category, settings, character) -> containerOrNil`
- `SmartStorage.Server.validateRequest(player, args, now) -> requestOrNil, reason`
- `SmartStorage.Transfer.deposit(player, request) -> summary`
- Network contract: module `SmartStorage`, client command `deposit`, server command `result`.

- [ ] Add failing fake-container/request tests for nearest compatible destination, stable distance/`x,y,z` tie-breaks, capacity/access/type/radius rejection, rate limit, maximum items, duplicate request IDs, and rejection of client-provided item IDs.
- [ ] Run the package and verify RED.
- [ ] Implement `Selection.choose` with configured type/capacity/access/distance filters and deterministic ordering. Implement `validateRequest` with category/request ID shape, rate window, duplicate cache, and settings checks.
- [ ] Register one `Events.OnClientCommand` handler. On the server, recursively enumerate only the player's inventory and owned bags, classify/protect each item, discover nearby loaded world containers, revalidate every item, and transfer through vanilla removal/addition/synchronization helpers. Never use arbitrary string `AddItem` or client-side mutation.
- [ ] Return deterministic counts `moved`, `protected`, `noDestination`, and `failed`; cache duplicate summaries and send `sendServerCommand(player, "SmartStorage", "result", summary)`.
- [ ] Run tests, `git diff --check`, and a scan for item-creation/deletion shortcuts or `sendClientCommand` in server/shared Smart Storage code. Commit `feat: add server-validated Smart Storage transfers`.

### Task 5: Add client inventory action and result display

**Files:**
- Create `mods/SmartStorage/42/media/lua/client/SmartStorage/ContextMenu.lua`
- Create `mods/SmartStorage/42/media/lua/client/SmartStorage/ClientCommands.lua`
- Create `mods/SmartStorage/42/media/lua/client/SmartStorage/Result.lua`
- Modify `work/smart-storage-tests/test/smart-storage.test.js`

**Interfaces:**
- Client sends only `{ category = category, requestId = nonce }` through `sendClientCommand(getPlayer(), "SmartStorage", "deposit", args)`.
- Client handles `Events.OnServerCommand` for `SmartStorage/result`.

- [ ] Add failing contract tests for context-menu label, category payload, nonce generation, no client item mutation, result formatting, and malformed result handling.
- [ ] Run the package and verify RED.
- [ ] Hook `Events.OnFillInventoryObjectContextMenu.Add`; show the action only when an eligible item exists, send intent only, and never add/remove/mutate items.
- [ ] Format the localized result as `Movidos: N | Protegidos: N | Sem destino: N | Falhas: N`; handle unknown/malformed summaries safely.
- [ ] Run all tests and commit `feat: add Smart Storage inventory action`.

### Task 6: Finish monorepo docs, local package, and release checks

**Files:**
- Modify `README.md`, `mods/InstantSkillBooks/README.md`, `mods/SmartStorage/README.md`, and the roadmap spec
- Modify `work/smart-storage-tests/test/smart-storage.test.js`
- Create ignored `outputs/SmartStorage-0.1.0.zip`

**Interfaces:**
- Consumes completed source, verified container IDs, metadata, translations, and tests.
- Produces a root multi-mod index, per-mod installation/configuration guides, roadmap status, and local ZIP without Workshop ID.

- [ ] Add failing assertions for both mods in the root index, every Smart Storage option/default and server-authoritative warning, roadmap status, exact `mod.info`, required ZIP paths, source/package parity, and absence of tests/node_modules/docs/worktree paths.
- [ ] Run `pnpm --dir work/smart-storage-tests test` and verify RED.
- [ ] Update docs, build the ZIP with the top-level Smart Storage mod layout, and do not invent `workshop.txt` or a Workshop ID.
- [ ] Run both mod test packages, `git diff --check`, the forbidden-reference scan, and read-only ZIP inspection. Expect zero failures and zero forbidden package entries.
- [ ] Commit `docs: prepare Smart Storage B42 release`; keep Workshop upload and two-client live acceptance as explicit follow-up actions.



