# Shared Map Enhancer B42 v0.1.0

Shared Map Enhancer synchronizes useful, categorized map markers between players in a small cooperative session. It targets Project Zomboid Build 42.20+ and keeps all persistent changes server-authoritative: clients request actions and display only state confirmed by the server.

## Local installation

Copy `mods/SharedMapEnhancer/` into the server's `mods/` directory and install the same folder for every client. Enable the mod with `Mods=SharedMapEnhancer` in the server configuration, then restart the server. This scaffold does not include Lua behavior yet; later releases will add the marker implementation.

## MVP scope

The MVP supports shared markers in exactly seven categories: `Base`, `Loot`, `Danger`, `Vehicle`, `Medicine`, `Fuel`, and `Expedition`. Markers will support a title, optional note, icon, colour, coordinates, category filters, and permanent or expiring duration. Creators can edit or remove their own markers, and administrators can remove any marker.

The server owns validation, persistence, authorization, timestamps, and synchronization. The client cannot author identity, revision, or expiration fields. The mod does not implement tasks, rewards, contracts, player tracking, routes, world edits, item grants, or required Discord integration.

**Workshop warning:** Shared Map Enhancer has no Workshop manifest or Workshop ID. Do not add it to `WorkshopItems=` until a separate Workshop item is created and assigned an ID.

## Future acceptance

After the B42.20+ implementation is complete, acceptance will include a live two-client session covering creation, synchronization, independent filters, creator permissions, administrator removal, expiration, joining players, and persistence after restart.
