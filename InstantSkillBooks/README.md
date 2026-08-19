# Instant Skill Book Reading

Instant Skill Book Reading is a Project Zomboid Build 42.20 multiplayer mod. When a character reads an eligible skill book, the vanilla reading action completes in one timed-action tick. Vanilla server-side validation, page completion, and XP multiplier handling remain in charge. Recipe magazines, maps, newspapers, ordinary literature, ineligible books, and Illiterate characters retain vanilla reading behavior.

## Compatibility

- Target: Project Zomboid Build 42.20 stable.
- Mod identifier: `InstantSkillBooks`.
- Version: `1.0.0`.
- The mod must be installed on the dedicated server and on every participating client.
- Install the identical mod folder on clients and server: this shared Lua timed-action override participates in Project Zomboid's `DoLuaChecksum` checksum validation.
- Later Build 42 patches are best-effort compatible because vanilla timed-action and literature APIs may change.

## Local installation

1. Copy the complete `InstantSkillBooks` folder from this package into:

   ```text
   %UserProfile%\Zomboid\mods\InstantSkillBooks
   ```

   The resulting folder must contain `README.md`, `42\mod.info`, and the `42\media\lua\shared\InstantSkillBooks\InstantSkillBooks.lua` entry file.

2. Install the same `InstantSkillBooks` folder on the dedicated server under the server process user's `%UserProfile%\Zomboid\mods\` directory.

3. Install the same folder on every client that joins the server, under that client's `%UserProfile%\Zomboid\mods\` directory.

4. In the dedicated server's server configuration, enable the mod by setting:

   ```text
   Mods=InstantSkillBooks
   ```

   Keep the identifier exact. This local installation has no Workshop item, so do not add an ID to `WorkshopItems=` for this mod.

5. Restart the dedicated server after changing the mod list. Have clients restart the game or reload their local mod list if the mod does not appear immediately.

## Workshop and distribution status

No Workshop item ID exists yet. This package is distributed as a local folder only; copy that same folder to the server and all clients instead of using a Workshop subscription.

## Multiplayer acceptance checks

With the mod enabled on both server and client, verify:

1. In multiplayer, begin reading an unread skill book appropriate to the character's skill range; it completes immediately and grants the vanilla multiplier.
2. Repeating the action does not stack or duplicate benefits.
3. A recipe magazine, map, newspaper, or ordinary book retains vanilla reading behavior.
4. Moving or dropping the item before vanilla server validation does not grant progress.
5. A non-skill item cannot enter the instant-completion branch.
6. A second multiplayer player can use the feature independently.
7. Disabling the mod restores vanilla behavior without corrupting the save or item.

If any check fails, disable the mod, restore vanilla behavior, and report the Build 42.20 server log together with the exact item and character state.
