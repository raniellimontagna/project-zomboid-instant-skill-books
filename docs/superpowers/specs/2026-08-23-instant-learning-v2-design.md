# Instant Learning v2 — Design

## Goal

Extend Instant Skill Books into a configurable Build 42.20 multiplayer mod named Instant Learning. Skill books remain enabled by default; recipe magazines become an independent server option, disabled by default. Technical manuals and educational VHS options are reserved but disabled until their vanilla completion APIs are verified.

## Configuration

Build 42 sandbox options are declared in `media/sandbox-options.txt` under the `InstantLearning` namespace and read from `SandboxVars.InstantLearning`:

```text
InstantSkillBooks = true
InstantRecipeMagazines = false
InstantTechnicalManuals = false
InstantEducationalVHS = false
```

The first two options are implemented in v2. The latter two must still appear as disabled settings so server owners can see the planned categories, but they do not change behavior in this release.

Sandbox values are authoritative server/world settings. The mod never trusts a client-provided category or progression value. Missing or malformed settings fall back to the safe defaults above.

## User-visible behavior

When a player chooses the normal vanilla **Read** action:

- an eligible skill book completes in one timed-action tick when `InstantSkillBooks` is true;
- an eligible recipe magazine completes in one timed-action tick when `InstantRecipeMagazines` is true;
- disabled categories retain their vanilla reading duration;
- ordinary literature, newspapers, comics, maps, and other non-educational literature retain vanilla behavior.

The mod does not add a replacement reading UI, chat command, admin command, or custom item.

## Eligibility and vanilla ownership

The shared `ISReadABook:getDuration()` wrapper calls the original vanilla duration function first. It only shortens the action after category and option checks succeed. Vanilla `isValid`, server-side timed-action execution, `complete()`, page persistence, recipe learning, XP multipliers, item synchronization, and player synchronization remain authoritative.

Skill books are recognized by the existing `SkillBook[item:getSkillTrained()]` capability and a positive page count, with vanilla useful-level and Illiterate checks preserved.

Recipe magazines are recognized by a non-empty `item:getLearnedRecipes()` collection. The action does not directly grant recipes; vanilla `complete()` remains responsible for applying the learned recipes and marking the literature read. If a magazine does not expose the expected collection, the wrapper returns the vanilla duration.

Technical manuals and educational VHS are deliberately not recognized by the v2 eligibility predicate. Their reserved settings safely retain vanilla behavior.

## Error handling

The eligibility predicate is wrapped in a protected call after vanilla duration initialization. If a category API or option lookup throws, the mod returns the original vanilla duration. A concise `[InstantLearning]` diagnostic is written server-side only; clients do not receive progression changes or trusted values.

## Compatibility and packaging

The mod remains Build 42.20+, uses the versioned `42/` layout, and keeps the same Workshop ID `3786090811` and Mod ID `InstantSkillBooks`. The README and Workshop description will document the four independent options and their defaults. Because the shared Lua and sandbox option files participate in multiplayer validation, the same Workshop version must be installed on the server and all clients.

## Verification

Automated tests must cover:

1. skill books instant when enabled;
2. skill books retain vanilla duration when disabled;
3. recipe magazines instant when enabled;
4. recipe magazines retain vanilla duration when disabled;
5. ordinary literature always retains vanilla duration;
6. reserved manual/VHS options never shorten actions;
7. malformed options or category API errors fail closed and call vanilla exactly once;
8. sandbox metadata declares all four independent options with the required defaults;
9. no direct page, recipe, XP, inventory, or network mutation is introduced.

Live acceptance must be run on the Steam Workshop item in a Build 42.20 multiplayer server with both options toggled independently.
