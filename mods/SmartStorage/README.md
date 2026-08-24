# Smart Storage B42 v0.1.0

Smart Storage is a Project Zomboid Build 42.20+ multiplayer mod for small cooperative sessions. It adds **Depositar itens compatíveis** to the inventory context menu and lets the server move eligible player-owned items into compatible nearby containers.

![Smart Storage cover](../../docs/assets/smart-storage-cover.png)

## Identity and compatibility

```text
name=Smart Storage B42
id=SmartStorage
modversion=0.1.0
pzversion=42.20
versionMin=42.20.0
```

Install the mod on the dedicated server and every participating client. Smart Storage is **server-authoritative**: the client sends only a category and request nonce; the server re-reads the player's inventory, settings, ownership, access, radius, capacity, and destination compatibility before every transfer. It never creates or deletes items, changes condition or quantity, scans the whole map, or sorts in the background.

## Local installation

1. Extract `outputs/SmartStorage-0.1.0.zip`. It contains one top-level folder: `SmartStorage`.
2. Copy that complete folder to `%UserProfile%\Zomboid\mods\SmartStorage` for the dedicated server and every client.
3. Enable the exact mod ID in the server configuration:

   ```ini
   Mods=SmartStorage
   ```

4. Restart the server and reload the client mod list if necessary.

Smart Storage has no `workshop.txt`, no Workshop manifest, or Workshop ID. Do not add it to `WorkshopItems=` and do not reuse Instant Skill Books ID `3786090811`. Workshop upload is a follow-up after the user creates its item as a separate Workshop item.

## Server configuration

All sandbox settings are server/world settings on the **Smart Storage** page. Their values are server-authoritative for every player in the save. The four practical starter categories are enabled by default and use the verified vanilla `crate` container type; all optional categories start disabled with empty destination lists.

| Option | Default | Effect |
| --- | --- | --- |
| `SmartStorage.Food` | `true` | Enable compatible food transfers. |
| `SmartStorage.Tools` | `true` | Enable compatible tool transfers. |
| `SmartStorage.Medicine` | `true` | Enable compatible medicine transfers. |
| `SmartStorage.Construction` | `true` | Enable compatible construction-material transfers. |
| `SmartStorage.Weapons` | `false` | Enable compatible weapon transfers. |
| `SmartStorage.Ammo` | `false` | Enable compatible ammunition transfers. |
| `SmartStorage.Clothing` | `false` | Enable compatible clothing transfers. |
| `SmartStorage.Literature` | `false` | Enable compatible literature transfers. |
| `SmartStorage.Fuel` | `false` | Enable compatible fuel transfers. |
| `SmartStorage.Farming` | `false` | Enable compatible farming transfers. |
| `SmartStorage.Fishing` | `false` | Enable compatible fishing transfers. |
| `SmartStorage.SearchRadius` | `3` | Maximum nearby destination distance in squares. |
| `SmartStorage.MaxItemsPerRequest` | `200` | Maximum number of items processed by one request. |
| `SmartStorage.LowConditionPercent` | `25` | Protect an item at or below this condition percentage. |
| `SmartStorage.CategoryPriority` | `"Food,Tools,Medicine,Construction,Weapons,Ammo,Clothing,Literature,Fuel,Farming,Fishing"` | Comma-separated precedence for items that match more than one enabled category. |

### Explicit item and container type lists

Every category has two independent comma-separated configuration lists. `*ItemTypes` means complete full item types (for example, `Base.Pills`); it changes which items can classify into that category. `*ContainerTypes` means container types (for example, a verified container type); it changes which nearby destinations are acceptable. They are not interchangeable, and an unknown type never matches. Admins can override the starter `crate` value or add verified container types for their own server; do not add unverified values.

| Category | Item option | Default | Container option | Default |
| --- | --- | --- | --- | --- |
| Food | `SmartStorage.FoodItemTypes` | `""` | `SmartStorage.FoodContainerTypes` | `"crate"` |
| Tools | `SmartStorage.ToolsItemTypes` | `""` | `SmartStorage.ToolsContainerTypes` | `"crate"` |
| Medicine | `SmartStorage.MedicineItemTypes` | `""` | `SmartStorage.MedicineContainerTypes` | `"crate"` |
| Construction | `SmartStorage.ConstructionItemTypes` | `""` | `SmartStorage.ConstructionContainerTypes` | `"crate"` |
| Weapons | `SmartStorage.WeaponsItemTypes` | `""` | `SmartStorage.WeaponsContainerTypes` | `""` |
| Ammo | `SmartStorage.AmmoItemTypes` | `""` | `SmartStorage.AmmoContainerTypes` | `""` |
| Clothing | `SmartStorage.ClothingItemTypes` | `""` | `SmartStorage.ClothingContainerTypes` | `""` |
| Literature | `SmartStorage.LiteratureItemTypes` | `""` | `SmartStorage.LiteratureContainerTypes` | `""` |
| Fuel | `SmartStorage.FuelItemTypes` | `""` | `SmartStorage.FuelContainerTypes` | `""` |
| Farming | `SmartStorage.FarmingItemTypes` | `""` | `SmartStorage.FarmingContainerTypes` | `""` |
| Fishing | `SmartStorage.FishingItemTypes` | `""` | `SmartStorage.FishingContainerTypes` | `""` |

Classification uses an explicit full-type allowlist, then vanilla tags, then an exact vanilla category. Display-name guesses are never used. If several enabled categories match, `SmartStorage.CategoryPriority` decides; unknown or ambiguous signals fail closed.

## Limits and protections

The server considers only the player's inventory and owned bags, plus nearby loaded, accessible containers of the configured type. It rate-limits requests, caps them with `SmartStorage.MaxItemsPerRequest`, and makes request IDs idempotent.

The mod leaves equipped, worn, favorite, broken or low-condition, filled-container, unknown, unavailable, non-player-owned, and no-destination items in place. It does not move ground items, vehicle containers, other players' items, or inaccessible containers. There is no whole-base scan, background sorting, withdrawal action, item creation, deletion, repair, condition change, or quantity change.

## Tests and acceptance follow-up

Run the automated contract tests before packaging or changing settings:

```powershell
pnpm --dir work/smart-storage-tests test
```

Automated checks cover metadata, sandbox options, classification, protections, deterministic selection, server request validation, transfer safety, client intent-only behavior, documentation, and package contents.

The remaining live acceptance follow-up is a Project Zomboid Build 42.20+ dedicated or hosted server with **two clients**. Verify independently enabled categories, full containers, protected items, repeated requests, a player joining after setup, and that nothing outside the configured radius changes. The separate Workshop upload is also a follow-up; create the Workshop item first, then document its assigned ID rather than guessing one.
