# Instant Skill Book Reading — Design

## Goal

Create a Project Zomboid Build 42.20 multiplayer mod that instantly completes skill-book reading through server-authoritative validation. It must preserve the normal XP multiplier awarded by the book and leave magazines, recipes, maps, newspapers, and ordinary literature unchanged.

## User experience

The player keeps the ordinary interaction: place a skill book in accessible inventory and choose **Read**. If the book applies a skill XP multiplier, reading completes immediately. The character receives the same recorded reading progress and multiplier that vanilla reading would grant after the final page. Already-completed books have no additional effect.

Non-skill literature continues through vanilla behavior. The mod adds no chat command, admin command, custom item, or configuration screen.

## Architecture

The mod is installed on both the dedicated server and every participating client.

Build 42.20 already implements `ISReadABook` as a shared timed action whose authoritative `complete()` method runs on the server. The mod wraps only `ISReadABook:getDuration()`: it first runs the vanilla duration method so vanilla initializes and validates reading state, then returns one tick only for an eligible skill book. The native server action retains ownership checks, page completion, XP multiplier application, player-field synchronization, and item-field synchronization.

The mod does not introduce a custom client command or directly mutate pages or XP. Books that are too advanced, obsolete for the character, or unreadable because of the Illiterate trait retain vanilla duration and validation behavior.

## Skill-book classification

Classification is capability-based rather than a hard-coded list of item names. An item qualifies only when the Build 42.20 literature/book API identifies it as providing a skill XP multiplier and a positive page count. This supports vanilla skill books and compatible modded skill books without accidentally affecting recipe magazines or ordinary books.

If the game API cannot distinguish these categories reliably, implementation will use the narrowest server-side fields used by vanilla reading logic and add explicit exclusions for recipe-teaching literature. It will not fall back to treating all literature as skill books.

## Multiplayer flow

1. The player selects the vanilla **Read** interaction.
2. The shared action runs vanilla duration initialization and validation.
3. If the server-known book metadata and character state identify an eligible skill book, the duration becomes one tick; otherwise the vanilla duration is retained.
4. The vanilla server-side `complete()` method records complete reading and applies or refreshes the normal XP multiplier.
5. Vanilla player-field and item-field synchronization sends the authoritative state back to the client.

## Validation and failure behavior

No custom network request exists to forge. The vanilla timed action validates that the item is in the character inventory and the mod derives eligibility only from the action's server-side item and character state. Non-skill literature and books with invalid metadata retain vanilla behavior.

If an unexpected API mismatch occurs, the mod logs a concise namespaced diagnostic on the server and leaves vanilla reading intact. It must fail closed rather than grant an incorrect multiplier.

## Files and packaging

The deliverable will use the Build 42 versioned mod layout and include:

- metadata and compatibility declaration for Build 42.20;
- one shared Lua integration that narrowly wraps the vanilla reading duration;
- Brazilian Portuguese and English display strings where user-visible text is required;
- a README with local client and dedicated-server installation instructions, server workshop/mod-list notes, and a short test checklist.

No Workshop upload or external publishing is included.

## Verification

Static verification will check the package layout, metadata, Lua syntax where a compatible parser/runtime is available, event/command names, and absence of client-authoritative progression changes.

The in-game acceptance checklist is:

1. In multiplayer, begin reading an unread skill book appropriate to the character's skill range; it completes immediately and grants the vanilla multiplier.
2. Repeating the action does not stack or duplicate benefits.
3. A recipe magazine, map, newspaper, or ordinary book retains vanilla reading behavior.
4. Moving or dropping the item before vanilla server validation does not grant progress.
5. A non-skill item cannot enter the instant-completion branch.
6. A second multiplayer player can use the feature independently.
7. Disabling the mod restores vanilla behavior without corrupting the save or item.

## Compatibility boundaries

The initial target is Project Zomboid 42.20 stable. Compatibility with later Build 42 patches is best-effort because The Indie Stone may change server-side TimedAction or literature APIs. The implementation will minimize overrides and prefer event hooks and vanilla methods to reduce conflicts with other mods.
