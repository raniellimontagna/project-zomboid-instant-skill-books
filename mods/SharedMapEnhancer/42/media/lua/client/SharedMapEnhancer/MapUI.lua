local MapUI = { _adapters = {}, _adapterByKey = {}, _uiByKey = {}, _filters = {}, _formFactory = nil, _initialSnapshotRequested = false, _readyRetries = 0, _readinessTicks = 0 }
local installLifecycleHooks

local function candidate(value)
    if type(value) ~= "table" then return nil end
    local adapter = MapAdapter.attach(value)
    if adapter ~= nil then return adapter end
    return nil
end

local function instanceOf(value)
    if type(value) ~= "table" then return nil end
    if type(value.getInstance) == "function" then
        local ok, result = pcall(value.getInstance)
        if ok and type(result) == "table" then return result end
    end
    if type(value.instance) == "table" then return value.instance end
    return value
end

local function detachCandidate(key)
    local adapter = MapUI._adapterByKey[key]
    if adapter ~= nil and type(MapAdapter) == "table" and type(MapAdapter.clearOwnedSymbols) == "function" then
        MapAdapter.clearOwnedSymbols(adapter)
    end
    for index = #MapUI._adapters, 1, -1 do
        if MapUI._adapters[index] == adapter then table.remove(MapUI._adapters, index) end
    end
    MapUI._adapterByKey[key] = nil
    MapUI._uiByKey[key] = nil
end

local function addCandidate(value, key)
    local map = instanceOf(value)
    if map == nil then return false end
    if MapUI._adapterByKey[key] ~= nil and MapUI._uiByKey[key] == map then return false end
    local adapter = candidate(map)
    if adapter == nil then return false end
    detachCandidate(key)
    adapter.key = key
    adapter.filters = MapUI._filters[key] or {}
    MapUI._adapters[#MapUI._adapters + 1] = adapter
    MapUI._adapterByKey[key] = adapter
    MapUI._uiByKey[key] = map
    MapUI.installContextHook(map, key)
    return true
end

local function playerMiniMap(playerNum)
    if type(getPlayerMiniMap) ~= "function" then return nil end
    local ok, outer = pcall(getPlayerMiniMap, playerNum)
    if ok and type(outer) == "table" and type(outer.inner) == "table" then return outer.inner end
    return nil
end

function MapUI.requestInitialSnapshot()
    if MapUI._initialSnapshotRequested then return false end
    if type(ClientCommands) ~= "table" or type(ClientCommands.requestSnapshot) ~= "function" then return false end
    local ok, result = pcall(ClientCommands.requestSnapshot)
    if ok and result ~= false then MapUI._initialSnapshotRequested = true; return true end
    return false
end

function MapUI.register()
    if type(MapAdapter) ~= "table" then return false end
    if installLifecycleHooks ~= nil then installLifecycleHooks() end
    local main = rawget(_G, "ISWorldMap_instance") or rawget(_G, "UIWorldMap") or rawget(_G, "mapUI")
    local playerNum = type(main) == "table" and type(main.playerNum) == "number" and main.playerNum or 0
    local mini = playerMiniMap(playerNum)
    local changed = addCandidate(main, "main")
    if mini ~= main and addCandidate(mini, "minimap") then changed = true end
    if #MapUI._adapters == 0 then return false end
    MapUI.requestInitialSnapshot()
    return true, changed
end

function MapUI.refreshAll()
    MapUI.register()
    if type(Cache) ~= "table" or type(Cache.list) ~= "function" then return false end
    local markers = Cache.list(nil)
    local refreshed = false
    for _, adapter in ipairs(MapUI._adapters) do
        adapter.filters = MapUI._filters[adapter.key] or adapter.filters or {}
        if MapAdapter.rebuild(adapter, markers, adapter.filters) then refreshed = true end
    end
    return refreshed
end

function MapUI.setFilter(key, filters)
    if key ~= "main" and key ~= "minimap" then return false end
    MapUI._filters[key] = type(filters) == "table" and filters or {}
    return true
end

function MapUI.setFormFactory(factory)
    MapUI._formFactory = type(factory) == "function" and factory or nil
end

local function call(object, method, ...)
    if object == nil or type(object[method]) ~= "function" then return false, nil end
    local args = { ... }
    local unpackCompat = (table and table.unpack) or unpack
    local ok, value = pcall(function() return object[method](object, unpackCompat(args)) end)
    if ok then return true, value end
    return pcall(object[method], unpackCompat(args))
end

local function mapCoordinates(map, x, y)
    if type(map) ~= "table" or map.mapAPI == nil then return nil end
    local okX, worldX = call(map.mapAPI, "uiToWorldX", x, y)
    local okY, worldY = call(map.mapAPI, "uiToWorldY", x, y)
    if not okX or not okY or type(worldX) ~= "number" or type(worldY) ~= "number" then return nil end
    local z = 0
    local playerNumber = type(map.playerNum) == "number" and map.playerNum or 0
    if type(getSpecificPlayer) == "function" then
        local okPlayer, player = pcall(getSpecificPlayer, playerNumber)
        if okPlayer and player ~= nil then
            local okZ, playerZ = call(player, "getZ")
            if okZ and type(playerZ) == "number" then z = playerZ end
        end
    end
    return math.floor(worldX), math.floor(worldY), math.floor(z)
end

local function confirmedAt(x, y, z)
    if type(Cache) ~= "table" or type(Cache.list) ~= "function" then return nil end
    for _, marker in ipairs(Cache.list(nil)) do
        if marker.x == x and marker.y == y and marker.z == z then return marker end
    end
    return nil
end

local function textValue(control)
    if type(control) ~= "table" or type(control.getInternalText) ~= "function" then return nil end
    local ok, value = pcall(control.getInternalText, control)
    return ok and type(value) == "string" and value or nil
end

local function selectedValue(control)
    if type(control) ~= "table" or type(control.getSelectedData) ~= "function" then return nil end
    local ok, value = pcall(control.getSelectedData, control)
    return ok and type(value) == "string" and value or nil
end

local function defaultPayload(form)
    local category, title = selectedValue(form.categoryCombo), textValue(form.titleEntry)
    local note, icon = textValue(form.noteEntry), selectedValue(form.iconCombo)
    local color, duration = selectedValue(form.colorCombo), selectedValue(form.durationCombo)
    if category == nil or title == nil or note == nil or icon == nil or color == nil or duration == nil then return nil end
    return { category=category, title=title, note=note, icon=icon, color=color, duration=duration }
end

local function translated(name)
    if type(getText) == "function" then
        local ok, value = pcall(getText, "UI_SharedMapEnhancer_" .. name)
        if ok and type(value) == "string" and value ~= "" then return value end
    end
    return name
end

local function prepareControl(control)
    if type(control) ~= "table" or type(control.initialise) ~= "function" or type(control.instantiate) ~= "function" then return false end
    local initialized = pcall(control.initialise, control)
    local instantiated = pcall(control.instantiate, control)
    return initialized and instantiated
end

local function newTextEntry(value, x, y, width, height)
    local ok, entry = pcall(ISTextEntryBox.new, ISTextEntryBox, value, x, y, width, height)
    if not ok or not prepareControl(entry) or type(entry.getInternalText) ~= "function" then return nil end
    return entry
end

local function newSelector(values, selected, x, y, width, height)
    local ok, combo = pcall(ISComboBox.new, ISComboBox, x, y, width, height)
    if not ok or not prepareControl(combo) or type(combo.addOptionWithData) ~= "function" or type(combo.setSelectedData) ~= "function" or type(combo.getSelectedData) ~= "function" then return nil end
    for _, value in ipairs(values) do
        if not pcall(combo.addOptionWithData, combo, value, value) then return nil end
    end
    if not pcall(combo.setSelectedData, combo, selected) then return nil end
    return combo
end

local function defaultForm(form)
    if type(ISPanel) ~= "table" or type(ISPanel.new) ~= "function" or type(ISTextEntryBox) ~= "table" or type(ISTextEntryBox.new) ~= "function" or type(ISComboBox) ~= "table" or type(ISComboBox.new) ~= "function" or type(ISButton) ~= "table" or type(ISButton.new) ~= "function" or type(Constants) ~= "table" or type(Constants.categories) ~= "table" or type(Constants.icons) ~= "table" or type(Constants.colors) ~= "table" or type(Constants.durations) ~= "table" then return false end
    local marker = form.marker or {}
    local ok, panel = pcall(ISPanel.new, ISPanel, 0, 0, 360, 275)
    if not ok or panel == nil or type(panel.addChild) ~= "function" or type(panel.addToUIManager) ~= "function" or type(panel.initialise) ~= "function" then return false end
    if not pcall(panel.initialise, panel) then return false end
    local titleEntry = newTextEntry(marker.title or "", 10, 10, 340, 25)
    local noteEntry = newTextEntry(marker.note or "", 10, 45, 340, 25)
    local categoryCombo = newSelector(Constants.categories, form.category or marker.category or "Base", 10, 80, 165, 25)
    local iconCombo = newSelector(Constants.icons, marker.icon or "House", 185, 80, 165, 25)
    local colorCombo = newSelector(Constants.colors, marker.color or "white", 10, 115, 165, 25)
    local durationCombo = newSelector(Constants.durations, marker.duration or "permanent", 185, 115, 165, 25)
    if titleEntry == nil or noteEntry == nil or categoryCombo == nil or iconCombo == nil or colorCombo == nil or durationCombo == nil then return false end
    local buttonTitle = translated(form.mode == "edit" and "Edit" or "Create")
    local buttonOk, button = pcall(ISButton.new, ISButton, 130, 165, 100, 25, buttonTitle, form, function(target, clicked)
        if clicked and clicked.internal == "OK" then
            local payload = defaultPayload(target)
            if payload == nil then return end
            target.submit(payload)
            if target.panel and type(target.panel.removeFromUIManager) == "function" then pcall(target.panel.removeFromUIManager, target.panel) end
        end
    end)
    if not buttonOk or not prepareControl(button) then return false end
    button.internal = "OK"
    for _, control in ipairs({ titleEntry, noteEntry, categoryCombo, iconCombo, colorCombo, durationCombo, button }) do panel:addChild(control) end
    form.panel, form.titleEntry, form.noteEntry = panel, titleEntry, noteEntry
    form.categoryCombo, form.iconCombo, form.colorCombo, form.durationCombo = categoryCombo, iconCombo, colorCombo, durationCombo
    local managed, result = pcall(panel.addToUIManager, panel)
    return managed and result ~= false
end

local function openForm(form)
    local factory = MapUI._formFactory or defaultForm
    local ok, result = pcall(factory, form)
    return ok and result ~= false
end

function MapUI.openCreate(map, key, x, y, category)
    local worldX, worldY, worldZ = mapCoordinates(map, x, y)
    if worldX == nil or type(ClientCommands) ~= "table" or type(ClientCommands.create) ~= "function" then return false end
    return openForm({ mode="create", key=key, category=category or "Base", x=worldX, y=worldY, z=worldZ,
        submit=function(payload)
            payload = type(payload) == "table" and payload or {}
            return ClientCommands.create({ category=payload.category, title=payload.title, note=payload.note, icon=payload.icon,
                color=payload.color, x=worldX, y=worldY, z=worldZ, duration=payload.duration })
        end })
end

function MapUI.openEdit(marker, key, category)
    if type(marker) ~= "table" or type(marker.id) ~= "string" or type(Cache) ~= "table" or type(Cache.get) ~= "function" then return false end
    local confirmed = Cache.get(marker.id)
    if confirmed == nil or type(ClientCommands) ~= "table" or type(ClientCommands.update) ~= "function" then return false end
    return openForm({ mode="edit", key=key, category=category or confirmed.category, marker=confirmed,
        submit=function(payload)
            payload = type(payload) == "table" and payload or {}
            return ClientCommands.update(confirmed.id, { category=payload.category, title=payload.title, note=payload.note,
                icon=payload.icon, color=payload.color, duration=payload.duration })
        end })
end

function MapUI.removeConfirmed(marker)
    if type(marker) ~= "table" or type(marker.id) ~= "string" or type(Cache) ~= "table" or type(Cache.get) ~= "function" then return false end
    if Cache.get(marker.id) == nil or type(ClientCommands) ~= "table" or type(ClientCommands.remove) ~= "function" then return false end
    return ClientCommands.remove(marker.id)
end

local function contextFor(map, x, y)
    if type(ISContextMenu) ~= "table" or type(ISContextMenu.get) ~= "function" then return nil end
    local absoluteX, absoluteY = 0, 0
    local okX, valueX = call(map, "getAbsoluteX"); if okX and type(valueX) == "number" then absoluteX = valueX end
    local okY, valueY = call(map, "getAbsoluteY"); if okY and type(valueY) == "number" then absoluteY = valueY end
    local playerNumber = type(map.playerNum) == "number" and map.playerNum or 0
    local ok, context = pcall(ISContextMenu.get, playerNumber, x + absoluteX, y + absoluteY)
    return ok and context or nil
end

function MapUI.addContextOptions(map, key, x, y, context)
    if type(context) ~= "table" or type(context.addOption) ~= "function" then context = contextFor(map, x, y) end
    if context == nil or type(context.addOption) ~= "function" then return false end
    local worldX, worldY, worldZ = mapCoordinates(map, x, y)
    if worldX == nil then return false end
    local canSubmenu = type(Constants) == "table" and type(Constants.categories) == "table" and type(ISContextMenu) == "table" and type(ISContextMenu.getNew) == "function" and type(context.addSubMenu) == "function"
    if canSubmenu then
        local option = context:addOption(translated("Create")); local menu = ISContextMenu:getNew(context); context:addSubMenu(option, menu)
        for _, category in ipairs(Constants.categories) do menu:addOption(category, MapUI, function(_, categoryName, target, targetKey, uiX, uiY) MapUI.openCreate(target, targetKey, uiX, uiY, categoryName) end, category, map, key, x, y) end
    else
        context:addOption(translated("Create"), MapUI, function(_, target, targetKey, uiX, uiY) MapUI.openCreate(target, targetKey, uiX, uiY) end, map, key, x, y)
    end
    local marker = confirmedAt(worldX, worldY, worldZ)
    if marker ~= nil then
        context:addOption(translated("Edit"), MapUI, function(_, selected, selectedKey) MapUI.openEdit(selected, selectedKey) end, marker, key)
        context:addOption(translated("Remove"), MapUI, function(_, selected) MapUI.removeConfirmed(selected) end, marker)
    end
    if canSubmenu then
        local option = context:addOption(translated("Filter"))
        local menu = ISContextMenu:getNew(context)
        context:addSubMenu(option, menu)
        for _, category in ipairs(Constants.categories) do
            menu:addOption(category, MapUI, function(_, categoryName, filterKey)
                local filters = MapUI._filters[filterKey] or {}
                filters[categoryName] = filters[categoryName] == false and nil or false
                MapUI.setFilter(filterKey, filters)
                MapUI.refreshAll()
            end, category, key)
        end
    end
    if type(context.setVisible) == "function" then pcall(context.setVisible, context, true) end
    return true
end

function MapUI.installContextHook(map, key)
    if type(map) ~= "table" or map._sharedMapEnhancerContextHook then return false end
    if type(map.onRightMouseUp) ~= "function" then return false end
    local vanilla = map.onRightMouseUp
    map.onRightMouseUp = function(self, x, y)
        local result = vanilla(self, x, y)
        if result ~= true then MapUI.addContextOptions(self, key, x, y) end
        return result
    end
    map._sharedMapEnhancerContextHook = true
    return true
end

installLifecycleHooks = function()
    if MapUI._worldMapShowHook == nil and type(ISWorldMap) == "table" and type(ISWorldMap.ShowWorldMap) == "function" then
        local vanillaShowWorldMap = ISWorldMap.ShowWorldMap
        ISWorldMap.ShowWorldMap = function(...)
            vanillaShowWorldMap(...)
            MapUI.refreshAll()
        end
        MapUI._worldMapShowHook = vanillaShowWorldMap
    end
    if MapUI._miniMapRecreateHook == nil and type(ISMiniMap) == "table" and type(ISMiniMap.Recreate) == "function" then
        local vanillaRecreate = ISMiniMap.Recreate
        ISMiniMap.Recreate = function(...)
            vanillaRecreate(...)
            MapUI.refreshAll()
        end
        MapUI._miniMapRecreateHook = vanillaRecreate
    end
end

if Events then
    local function hook()
        MapUI.refreshAll()
    end
    if Events.OnCreateUI and type(Events.OnCreateUI.Add) == "function" then Events.OnCreateUI.Add(hook) end
    if Events.OnCreatePlayer and type(Events.OnCreatePlayer.Add) == "function" then Events.OnCreatePlayer.Add(hook) end
    if Events.OnTick and type(Events.OnTick.Add) == "function" then
        Events.OnTick.Add(function()
            if MapUI._readyRetries < 120 and (#MapUI._adapters == 0 or MapUI._adapterByKey.main == nil or MapUI._adapterByKey.minimap == nil or not MapUI._initialSnapshotRequested) then
                MapUI._readyRetries = MapUI._readyRetries + 1
                hook()
                return
            end
            MapUI._readinessTicks = MapUI._readinessTicks + 1
            if MapUI._readinessTicks >= 300 then
                MapUI._readinessTicks = 0
                local _, changed = MapUI.register()
                if changed then MapUI.refreshAll() end
            end
        end)
    end
end

_G.MapUI = MapUI
if SharedMapEnhancer == nil then SharedMapEnhancer = {} end
SharedMapEnhancer.MapUI = MapUI
