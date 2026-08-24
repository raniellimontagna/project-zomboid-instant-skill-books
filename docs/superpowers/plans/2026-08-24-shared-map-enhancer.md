# Shared Map Enhancer B42 Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build a standalone, server-authoritative Shared Map Enhancer B42 mod that synchronizes bounded, categorized map markers between cooperative players while preserving vanilla map annotations.

**Architecture:** Pure marker validation and cache/merge logic remain independent from Project Zomboid APIs. The server owns a ModData registry and handles create, update, remove, and request commands; the client sends intent and renders only confirmed snapshots and deltas through vanilla symbolsAPI adapters.

**Tech Stack:** Project Zomboid Build 42.20+ Lua, ModData, sendClientCommand/sendServerCommand, UIWorldMap/symbolsAPI, Node.js node --test, and Fengari fixtures.

**Spec:** docs/superpowers/specs/2026-08-24-shared-map-enhancer-design.md

## Global Constraints

- Target Project Zomboid Build 42.20+ and ship source under mods/SharedMapEnhancer/42/.
- Categories are exactly Base, Loot, Danger, Vehicle, Medicine, Fuel, and Expedition.
- Title max 80 characters; note max 240 characters.
- Durations are permanent, 1h, 8h, 24h, or 7d.
- Colors are white, red, orange, yellow, green, cyan, blue, and purple.
- Icons are House, Target, Skull, SteeringWheel, MedCross, Fuel, Tent, Question, Star, Cross, and Exclamation.
- Persist at most 500 markers and accept at most one mutation per player per second.
- Requests require requestId length 1-64 and duplicate requests are idempotent per authenticated player.
- The client never authors id, createdBy, createdAt, expiresAt, or revision.
- Creator-only edits/removals and administrator removals are server checks.
- Corrupt or expired records are discarded individually.
- Preserve vanilla annotations; remove only symbols owned by this mod.
- No item creation, deletion, repair, world editing, player tracking, tasks, rewards, contracts, or Discord integration.
- Shared Map Enhancer has no Workshop manifest or Workshop ID until its separate item is created.

---

### Task 1: Scaffold the independent mod and test harness

**Files:**
- Create mods/SharedMapEnhancer/42/mod.info
- Create mods/SharedMapEnhancer/README.md
- Create work/shared-map-enhancer-tests/package.json and pnpm-lock.yaml
- Create work/shared-map-enhancer-tests/test/shared-map-enhancer.test.js
- Modify README.md and docs/superpowers/specs/2026-08-23-coop-quality-of-life-roadmap.md

**Interfaces:**
- Test helper loadSharedMapEnhancer({ modules, bootstrap }) loads selected Lua modules into Fengari.
- Metadata identity is SharedMapEnhancer, version 0.1.0, pzversion 42.20, versionMin 42.20.0.

- [ ] Write failing tests for exact mod.info, independent README, root index, roadmap status, and package script.
~~~js
test('metadata is independent', () => {
  assert.deepEqual(readMetadata(metadataPath), {
    name: 'Shared Map Enhancer B42',
    id: 'SharedMapEnhancer',
    modversion: '0.1.0',
    pzversion: '42.20',
    versionMin: '42.20.0',
  });
});
~~~

- [ ] Run pnpm --dir work/shared-map-enhancer-tests test. Expect failure because the new files do not exist.
- [ ] Add mod.info, README installation/configuration guidance, root index entry, and roadmap entry. State that the package has no Workshop ID.
- [ ] Add a private CommonJS package with node --test and Fengari 0.1.4, then generate its lockfile with bundled pnpm.
- [ ] Run the package and commit:
~~~powershell
git add README.md docs/superpowers/specs/2026-08-23-coop-quality-of-life-roadmap.md mods/SharedMapEnhancer work/shared-map-enhancer-tests
git commit -m "chore: scaffold Shared Map Enhancer B42"
~~~

### Task 2: Implement shared constants and pure marker validation

**Files:**
- Create mods/SharedMapEnhancer/42/media/lua/shared/SharedMapEnhancer/Constants.lua
- Create mods/SharedMapEnhancer/42/media/lua/shared/SharedMapEnhancer/Validation.lua
- Modify work/shared-map-enhancer-tests/test/shared-map-enhancer.test.js

**Interfaces:**
- Constants.categories, Constants.colors, Constants.icons, and Constants.durations.
- Validation.normalizeCreate(args, now, limits) returns markerOrNil, reasonOrNil.
- Validation.normalizeUpdate(args, existing, now, limits) returns markerOrNil, reasonOrNil.
- Validation.validateRequestShape(command, args) returns boolean, reasonOrNil.
- Validation.isValidMarker(marker, now) returns boolean, reasonOrNil.

- [ ] Add failing Fengari tests for valid normalization, all allowlists, trimming, text caps, integer finite coordinates, expiration conversion, rejected extra fields, and client authoritative fields.
~~~js
test('normalization does not trust client identity fields', () => {
  const values = evaluateLua(
    "local m = Validation.normalizeCreate(args, 1000, limits); return m.id == nil, m.createdBy == nil, m.title, m.expiresAt",
    4,
    { modules: ['constants', 'validation'] },
  );
  assert.deepEqual(values, [true, true, 'Base', 87400]);
});
~~~
- [ ] Run the package and verify the missing-module failure.
- [ ] Implement membership tables, normalization, and deterministic reason codes invalid_request, invalid_category, invalid_text, invalid_icon, invalid_color, invalid_duration, invalid_coordinates, expired, and limit_reached. Reject metatables, unknown keys, control characters, NaN, infinity, and non-integer coordinates.
- [ ] Run focused and full tests; expect all Task 1 and Task 2 tests green.
- [ ] Commit:
~~~powershell
git add mods/SharedMapEnhancer/42/media/lua/shared/SharedMapEnhancer work/shared-map-enhancer-tests/test/shared-map-enhancer.test.js
git commit -m "feat: add Shared Map Enhancer marker validation"
~~~

### Task 3: Add server persistence, authorization, and idempotent commands

**Files:**
- Create mods/SharedMapEnhancer/42/media/lua/server/SharedMapEnhancer/Persistence.lua
- Create mods/SharedMapEnhancer/42/media/lua/server/SharedMapEnhancer/Server.lua
- Modify work/shared-map-enhancer-tests/test/shared-map-enhancer.test.js

**Interfaces:**
- Persistence.load(), list(now), get(id), insert(marker), replace(marker), remove(id), cleanup(now), and revision().
- Server.validateAndHandle(command, player, args, now) returns a sanitized response; the live event adapter sends it.

- [ ] Add failing fixtures for B42-shaped ModData, corrupt-record discard, 500-marker cap, revision increments, expiration cleanup, creator authorization, admin removal, rate limit, malformed shape, duplicate replay, snapshot, delta, and error responses.
~~~js
test('duplicate create is idempotent', () => {
  const values = evaluateLua(
    "local a = Server.validateAndHandle('create', player, valid, 100); local b = Server.validateAndHandle('create', player, valid, 101); return a.ok, b.ok, a.marker.id == b.marker.id, insertCount",
    4,
    { modules: ['constants', 'validation', 'persistence', 'server'], bootstrap: serverFixture },
  );
  assert.deepEqual(values, [true, true, true, 1]);
});
~~~
- [ ] Run the package and verify missing persistence/server failures.
- [ ] Implement ModData.getOrCreate("SharedMapEnhancer") with schema 1, revision, and markers. Retain only valid non-expired records, cap deterministically by createdAt then id, and call ModData.transmit after accepted mutation.
- [ ] Implement one OnClientCommand handler. Derive player identity and admin status from the authenticated server player. Validate create/update/remove/request, inject server fields, cache request responses, clean expirations, and send only snapshot, delta, or error payloads.
- [ ] Run focused and full tests; commit:
~~~powershell
git add mods/SharedMapEnhancer/42/media/lua/server/SharedMapEnhancer work/shared-map-enhancer-tests/test/shared-map-enhancer.test.js
git commit -m "feat: add server-authoritative map marker registry"
~~~

### Task 4: Implement the client cache and network contract

**Files:**
- Create mods/SharedMapEnhancer/42/media/lua/client/SharedMapEnhancer/Cache.lua
- Create mods/SharedMapEnhancer/42/media/lua/client/SharedMapEnhancer/ClientCommands.lua
- Modify work/shared-map-enhancer-tests/test/shared-map-enhancer.test.js

**Interfaces:**
- Cache.reset(snapshot), applyDelta(delta), get(id), list(categoryOrNil), and revision().
- ClientCommands.requestSnapshot(), create(payload), update(id, payload), and remove(id).

- [ ] Add failing tests for snapshot replacement, contiguous delta application, revision gaps, malformed marker rejection, category filters, exact outbound payloads, nonce generation, and no client-side mutation.
~~~js
test('create sends intent without authoritative fields', () => {
  const values = evaluateLua(
    "ClientCommands.create(payload); return sent.module, sent.command, sent.args.id == nil, sent.args.createdBy == nil, sent.args.requestId ~= nil",
    5,
    { modules: ['constants', 'cache', 'clientCommands'], bootstrap: clientFixture },
  );
  assert.deepEqual(values, ['SharedMapEnhancer', 'create', true, true, true]);
});
~~~
- [ ] Run the package and verify missing client-module failures.
- [ ] Implement a validated cache keyed by marker id. Require delta revision to equal current revision plus one; return revision_gap without mutating on a gap. Sort list output by createdAt then id.
- [ ] Implement exact command payloads and one OnServerCommand handler. Apply snapshots/deltas, display localized errors, and request a snapshot after a gap. Never mutate items or world objects.
- [ ] Run focused and full tests; commit:
~~~powershell
git add mods/SharedMapEnhancer/42/media/lua/client/SharedMapEnhancer work/shared-map-enhancer-tests/test/shared-map-enhancer.test.js
git commit -m "feat: add Shared Map Enhancer client sync"
~~~

### Task 5: Integrate markers with the vanilla map and minimap

**Files:**
- Create mods/SharedMapEnhancer/42/media/lua/client/SharedMapEnhancer/MapAdapter.lua
- Create mods/SharedMapEnhancer/42/media/lua/client/SharedMapEnhancer/MapUI.lua
- Modify work/shared-map-enhancer-tests/test/shared-map-enhancer.test.js

**Interfaces:**
- MapAdapter.attach(mapUI) returns adapterOrNil.
- MapAdapter.rebuild(adapter, markers, filters) returns boolean.
- MapAdapter.clearOwnedSymbols(adapter).
- MapUI.register() and MapUI.refreshAll().

- [ ] Add failing B42-shaped symbolsAPI fixtures. Assert one symbol per visible marker, mapped RGBA/icon, category filtering, owned-only removal, and missing-API fail-closed behavior.
~~~js
test('rebuild preserves vanilla symbols', () => {
  const values = evaluateLua(
    "local a = MapAdapter.attach(mapUI); local ok = MapAdapter.rebuild(a, markers, { Loot = false }); return ok, symbols.removedOwned, symbols.removedVanilla, symbols.addedCount",
    4,
    { modules: ['constants', 'mapAdapter'], bootstrap: mapFixture },
  );
  assert.deepEqual(values, [true, 1, 0, 1]);
});
~~~
- [ ] Run the package and verify missing map-module failures.
- [ ] Resolve UIWorldMap API v3 and symbolsAPI calls through protected adapters. Track owned symbols by marker id; remove only owned symbols; add vanilla texture/text symbols with position, anchor, scale, and RGBA.
- [ ] Register map and minimap hooks only when present. Convert click coordinates with uiToWorldX/uiToWorldY, provide category filters, and open an edit/remove form only for server-confirmed records. Do not draw a local unconfirmed marker.
- [ ] Run focused and full tests; commit:
~~~powershell
git add mods/SharedMapEnhancer/42/media/lua/client/SharedMapEnhancer work/shared-map-enhancer-tests/test/shared-map-enhancer.test.js
git commit -m "feat: integrate Shared Map markers with vanilla maps"
~~~

### Task 6: Add translations, documentation, and the local release package

**Files:**
- Create mods/SharedMapEnhancer/42/media/lua/shared/Translate/EN/UI.json
- Create mods/SharedMapEnhancer/42/media/lua/shared/Translate/PTBR/UI.json
- Modify mods/SharedMapEnhancer/README.md, README.md, and the roadmap
- Modify work/shared-map-enhancer-tests/test/shared-map-enhancer.test.js
- Create ignored outputs/SharedMapEnhancer-0.1.0.zip

**Interfaces:**
- UI.json contains actions, filters, category labels, validation errors, permission errors, expiration labels, and sync-failure text in EN/PTBR.
- The release test compares every ZIP entry byte-for-byte with mods/SharedMapEnhancer/42/.

- [ ] Add failing release tests for translation keys, category labels, docs limits, roadmap status, ZIP source parity, and forbidden package entries.
~~~js
test('release ZIP contains only the B42 source tree', () => {
  const entries = readZipEntries(releaseZipPath);
  assert.deepEqual(entries, sharedMapSourceEntries());
  for (const entry of entries) assert.match(entry, /^SharedMapEnhancer\/42\//);
  assert.equal(entries.some((entry) => /(?:tests|node_modules|workshop\.txt)/i.test(entry)), false);
});
~~~
- [ ] Run the package and verify release failures.
- [ ] Add fixed UI.json files, document installation on server/clients, exact limits, permissions, local ZIP, no Workshop ID, and the B42.20 two-client acceptance checklist. Keep existing mod identities unchanged.
- [ ] Build the ZIP from only mods/SharedMapEnhancer/42/, inspect names/sizes/hashes, and run all three package tests.
- [ ] Run git diff --check and scan server/shared code for sendClientCommand, instanceItem, AddItem, and RemoveItem.
- [ ] Commit:
~~~powershell
git add README.md docs/superpowers/specs/2026-08-23-coop-quality-of-life-roadmap.md mods/SharedMapEnhancer work/shared-map-enhancer-tests/test/shared-map-enhancer.test.js
git commit -m "docs: package Shared Map Enhancer B42"
~~~

### Task 7: Final review and merged-result verification

**Files:**
- Review all Shared Map Enhancer source, tests, documentation, and ZIP.

**Interfaces:**
- Produces a review report with no open P0-P2 findings, a separate list of P3 follow-ups, and green tests on the branch to be merged.

- [ ] Run Smart Storage, Instant Skill Books, and Shared Map Enhancer test packages with bundled Node/pnpm. Expect zero failures.
- [ ] Verify no client command accepts server-authoritative fields, no server/shared file calls client mutation APIs, responses are sanitized, idempotency is bounded, expired/corrupt records fail closed, and map rebuild removes only the mod namespace.
- [ ] Verify every referenced ModData, map, and symbols API against local B42 source or B42-shaped fixtures. Confirm exact ZIP parity, no Workshop ID, no forbidden entries, and unchanged existing mod identities.
- [ ] For every P0-P2 finding, add a regression test, apply the smallest fix, rerun the affected package and full matrix, and commit a focused fix.
- [ ] After green verification, use the finishing workflow to offer local merge, Pull Request, or preserving the branch. If merging locally, copy the ignored ZIP to the main worktree before removing the feature worktree and rerun all three packages on the merged result.

