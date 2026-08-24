# Instant Skill Book Reading v2.0.0

This is one of the independent mods in the [repository index](../../README.md). Its source lives in `mods/InstantSkillBooks/`; this documentation and its existing Steam Workshop identity remain specific to Instant Skill Books.

Instant Skill Book Reading is a Project Zomboid Build 42.20 multiplayer mod. When a character reads an enabled eligible skill book or recipe magazine, the vanilla reading action completes in one timed-action tick. Vanilla server-side validation, page completion, and XP multiplier handling remain in charge. Maps, newspapers, ordinary literature, ineligible books, and Illiterate characters retain vanilla reading behavior.

The repository source for this mod is [`mods/InstantSkillBooks/`](../InstantSkillBooks/). The published Workshop archive remains rooted at `Contents/mods/InstantSkillBooks/`, so this source move does not change its Mod ID, Workshop ID, behavior, or archive layout.

## Compatibility

- Target: Project Zomboid Build 42.20 stable.
- Mod identifier: `InstantSkillBooks`.
- Version: `2.0.0`.
- The mod must be installed on the dedicated server and on every participating client.
- Install the identical mod folder on clients and server: this shared Lua timed-action override participates in Project Zomboid's `DoLuaChecksum` checksum validation.
- Later Build 42 patches are best-effort compatible because vanilla timed-action and literature APIs may change.

## Instant Learning sandbox settings

The server/world owner configures these independent options on the **Instant Learning** sandbox page. They are server/world authoritative, so all players in the same save use the same settings.

- `InstantSkillBooks` — default: `true`. Eligible skill books complete instantly.
- `InstantRecipeMagazines` — default: `false`. Eligible recipe magazines complete instantly when enabled.
- `InstantTechnicalManuals` — default: `false`. This visible option is reserved for a future update and is currently inactive.
- `InstantEducationalVHS` — default: `false`. This visible option is reserved for a future update and is currently inactive.

Technical manuals and educational VHS keep vanilla behavior even if their reserved options are enabled.

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

## Steam Workshop

- Workshop page: https://steamcommunity.com/sharedfiles/filedetails/?id=3786090811
- Workshop ID: `3786090811`
- Mod ID: `InstantSkillBooks`

For a dedicated server, use:

```ini
WorkshopItems=3786090811
Mods=InstantSkillBooks
```

## Multiplayer acceptance checks

With the mod enabled on both server and client, verify:

1. With `InstantSkillBooks` enabled, begin reading an unread skill book appropriate to the character's skill range; it completes immediately and grants the vanilla multiplier.
2. With `InstantRecipeMagazines` enabled, begin reading an eligible recipe magazine; it completes immediately while vanilla completion grants the recipe.
3. Repeating the action does not stack or duplicate benefits.
4. With the recipe option disabled, recipe magazines, maps, newspapers, and ordinary books retain vanilla reading behavior.
5. Technical manuals and educational VHS retain vanilla behavior because their visible v2 settings are currently inactive.
6. Moving or dropping the item before vanilla server validation does not grant progress.
7. A non-skill item cannot enter the instant-completion branch.
8. A second multiplayer player can use the feature independently.
9. Disabling the mod restores vanilla behavior without corrupting the save or item.

If any check fails, disable the mod, restore vanilla behavior, and report the Build 42.20 server log together with the exact item and character state.
