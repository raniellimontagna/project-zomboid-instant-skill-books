# Coop Quality-of-Life Mods — Future Roadmap

> Status: Smart Storage B42 is implemented as a local Build 42.20+ package with automated contract coverage. Workshop upload and two-client live acceptance are explicit follow-up work; Shared Map Enhancer remains planned. This roadmap does not change the current Instant Learning implementation.

## Context

The target play style is small cooperative sessions played with friends over Discord, not a persistent public community server. Discord already covers planning and communication, so these mods should improve execution inside the game: fewer repetitive clicks, less searching, and less time lost between sessions.

Both mods must target Project Zomboid Build 42.20+ and keep all state-changing operations server-authoritative. The client may present the UI and request an action; the server validates the request and persists the result.

## 1. Smart Storage B42

### Implementation status

Smart Storage B42 is implemented in `mods/SmartStorage/` and packaged locally as `outputs/SmartStorage-0.1.0.zip`. The local package deliberately has no Workshop manifest or Workshop ID.

Follow-up: create and upload the separate Workshop item, then record its assigned ID. Follow-up: run the B42.20+ live acceptance session with two clients before treating the release as multiplayer-validated.

### Goal

Make it faster to organize nearby storage without scanning the whole base or moving items in the background.

### MVP scope

- Configure storage containers by individual name, such as `Comida`, `Ferramentas`, `Medicamentos`, and `Construção`.
- Provide a **Deposit compatible items** action from the player inventory/context menu.
- Search only the player's inventory and explicitly eligible nearby containers.
- Keep equipped, favourite, low-durability, and otherwise protected items in place.
- Support optional category matching as a fallback to explicit container names.
- Show a concise result: moved items, skipped protected items, and items with no matching container.
- Validate item ownership, location, capacity, and destination on the server before moving anything.

### Explicit non-goals

- No whole-map or whole-base inventory scan.
- No automatic background sorting.
- No item creation, deletion, repair, or durability changes.
- No economy, points, permissions hierarchy, or community task board.

### Future extensions

- **Withdraw missing items** for a selected category or recipe.
- Per-container allow/deny lists.
- Saved presets for common base areas.
- Optional compact storage summary for nearby containers.

## 2. Shared Map Enhancer B42

### Goal

Synchronize useful map information between coop players without turning the map into a task-management system.

### MVP scope

- Create a marker from the map or minimap.
- Store a category, title, short note, colour, and icon.
- Ship with categories for `Base`, `Loot`, `Danger`, `Vehicle`, `Medicine`, `Fuel`, and `Expedition`.
- Support permanent markers and markers with an expiration time.
- Filter visible markers by category.
- Allow the creator to edit or remove their own markers.
- Allow an administrator to remove any marker.
- Persist markers on the server and synchronize them to players when they join or enter the relevant map area.

### Explicit non-goals

- No task assignment, rewards, contracts, or progression system.
- No real-time player tracking.
- No route planner or automatic navigation.
- No required Discord integration.
- No world edits or item grants.

### Future extensions

- Import/export a small marker preset for a new save.
- Optional private markers in addition to shared markers.
- Marker cleanup rules for expired expedition or loot notes.
- A lightweight legend accessible from the vanilla map screen.

## Shared technical constraints

- Use the versioned `42/` mod layout and gate the package for B42.20+.
- Keep Smart Storage and Shared Map Enhancer as separate mods to reduce compatibility risk and allow independent Workshop updates.
- Prefer small, explicit server commands with validation and idempotency protection.
- Rate-limit marker and storage requests to prevent accidental spam or duplication attempts.
- Add focused automated tests for pure validation/selection logic before live multiplayer acceptance testing.
- Live acceptance must use a dedicated or hosted B42.20+ multiplayer session with at least two clients.

## Recommended order

1. Finish and validate the current Instant Learning improvement.
2. Complete — Smart Storage B42 is implemented as a standalone local mod and package.
3. Follow-up — validate Smart Storage in a two-client coop session and then perform its separate Workshop upload.
4. Implement Shared Map Enhancer B42 as a standalone mod.
5. Validate marker persistence, joining-player synchronization, and cleanup in coop.
