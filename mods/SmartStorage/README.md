# Smart Storage B42

Smart Storage is a Project Zomboid Build 42.20+ multiplayer mod for small cooperative sessions. It adds **Depositar itens compatíveis** to the inventory context menu and lets the server organize eligible player-owned items into compatible nearby containers.

## Identity and compatibility

- Mod ID: `SmartStorage`
- Version: `0.1.0`
- Target: Project Zomboid Build 42.20+
- The mod must be installed on the dedicated server and every participating client.

The client sends only a category and a request nonce. The server re-reads the player's inventory, settings, ownership, access, radius, capacity, and destination compatibility before every transfer. Equipped, worn, favorite, broken, low-condition, filled-container, unknown, and unavailable items remain protected. Smart Storage never creates or deletes items, changes condition or quantity, scans the whole map, or sorts in the background.

## Local installation

Copy this complete `SmartStorage` folder into the `mods` directory for the server and each client. Enable it in the server configuration with:

```ini
Mods=SmartStorage
```

All configuration is server-authoritative. The available sandbox categories and transfer limits are documented in the repository design and registered by the mod as implementation is completed.

## Workshop status

Smart Storage has no Workshop manifest and no Workshop ID yet. Keep `WorkshopItems=` unchanged until the user creates its item as a separate Workshop item; do not invent or reuse the Instant Skill Books Workshop ID.

## Development tests

The Fengari behavior tests live in [`work/smart-storage-tests/`](../../work/smart-storage-tests/):

```powershell
cd work/smart-storage-tests
pnpm install --frozen-lockfile
node --test
```

Live acceptance still requires a Build 42.20+ server with two clients.
