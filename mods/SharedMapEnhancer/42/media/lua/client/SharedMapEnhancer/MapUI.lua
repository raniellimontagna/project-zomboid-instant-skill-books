local MapUI = { _adapters = {}, _filters = {} }

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

local function addCandidate(value, key)
    local adapter = candidate(instanceOf(value))
    if adapter ~= nil then
        adapter.key = key
        adapter.filters = MapUI._filters[key] or {}
        MapUI._adapters[#MapUI._adapters + 1] = adapter
    end
end

function MapUI.register()
    if type(MapAdapter) ~= "table" then return false end
    if #MapUI._adapters > 0 then return true end
    local main = rawget(_G, "UIWorldMap") or rawget(_G, "mapUI")
    local mini = rawget(_G, "ISMiniMap") or rawget(_G, "MiniMap") or rawget(_G, "minimap")
    addCandidate(main, "main")
    if mini ~= main then addCandidate(mini, "minimap") end
    if #MapUI._adapters == 0 then return false end
    return true
end

function MapUI.refreshAll()
    if type(Cache) ~= "table" or type(Cache.list) ~= "function" then return false end
    if #MapUI._adapters == 0 then MapUI.register() end
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

if Events then
    local function hook()
        MapUI.register()
        MapUI.refreshAll()
    end
    if Events.OnCreateUI and type(Events.OnCreateUI.Add) == "function" then Events.OnCreateUI.Add(hook) end
    if Events.OnWorldMapLoad and type(Events.OnWorldMapLoad.Add) == "function" then Events.OnWorldMapLoad.Add(hook) end
end

_G.MapUI = MapUI
if SharedMapEnhancer == nil then SharedMapEnhancer = {} end
SharedMapEnhancer.MapUI = MapUI
