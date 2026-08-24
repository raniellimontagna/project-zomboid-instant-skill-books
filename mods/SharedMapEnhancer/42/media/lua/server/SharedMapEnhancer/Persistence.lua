local Persistence = {}
local namespace = "SharedMapEnhancer"
local registry

local function nowValue(now)
    if type(now) == "number" then return now end
    if os and type(os.time) == "function" then return os.time() end
    return 0
end

local function transmit()
    if ModData and type(ModData.transmit) == "function" and registry ~= nil then
        pcall(ModData.transmit, registry)
    end
end

local function ensure(now)
    if registry ~= nil then return registry end
    if ModData == nil or type(ModData.getOrCreate) ~= "function" then
        registry = { schemaVersion = 1, revision = 0, markers = {} }
        return registry
    end
    local ok, value = pcall(ModData.getOrCreate, namespace)
    registry = ok and type(value) == "table" and value or {}
    registry.schemaVersion = 1
    if type(registry.revision) ~= "number" or registry.revision % 1 ~= 0 or registry.revision < 0 then registry.revision = 0 end
    if type(registry.markers) ~= "table" then registry.markers = {} end
    Persistence.load(now)
    return registry
end

local function ordered(markers)
    local result = {}
    for id, marker in pairs(markers) do
        if type(id) == "string" and type(marker) == "table" then
            result[#result + 1] = marker
        end
    end
    table.sort(result, function(a, b)
        if a.createdAt ~= b.createdAt then return a.createdAt < b.createdAt end
        return tostring(a.id) < tostring(b.id)
    end)
    return result
end

function Persistence.load(now)
    local data = registry
    if data == nil then
        if ModData and type(ModData.getOrCreate) == "function" then
            local ok, value = pcall(ModData.getOrCreate, namespace)
            data = ok and type(value) == "table" and value or {}
        else data = {} end
        registry = data
    end
    data.schemaVersion = 1
    if type(data.revision) ~= "number" or data.revision % 1 ~= 0 or data.revision < 0 then data.revision = 0 end
    local source = type(data.markers) == "table" and data.markers or {}
    local retained, changed = {}, false
    local current = nowValue(now)
    for id, marker in pairs(source) do
        local valid = type(Validation) == "table" and type(Validation.isValidMarker) == "function" and Validation.isValidMarker(marker, current)
        if valid and type(id) == "string" and marker.id == id then retained[id] = marker else changed = true end
    end
    local list = ordered(retained)
    for index = 501, #list do retained[list[index].id] = nil; changed = true end
    data.markers = retained
    if changed then transmit() end
    return data
end

function Persistence.list(now)
    local data = ensure(now)
    Persistence.cleanup(now)
    return ordered(data.markers)
end

function Persistence.get(id)
    local data = ensure()
    return type(id) == "string" and data.markers[id] or nil
end

function Persistence.insert(marker)
    local data = ensure()
    if type(marker) ~= "table" or type(marker.id) ~= "string" or data.markers[marker.id] ~= nil then return false end
    data.markers[marker.id] = marker
    data.revision = data.revision + 1
    transmit()
    return true
end

function Persistence.replace(marker)
    local data = ensure()
    if type(marker) ~= "table" or type(marker.id) ~= "string" or data.markers[marker.id] == nil then return false end
    data.markers[marker.id] = marker
    data.revision = data.revision + 1
    transmit()
    return true
end

function Persistence.remove(id)
    local data = ensure()
    if type(id) ~= "string" or data.markers[id] == nil then return false end
    data.markers[id] = nil
    data.revision = data.revision + 1
    transmit()
    return true
end

function Persistence.cleanup(now)
    local data = ensure(now)
    local current, changed = nowValue(now), false
    for id, marker in pairs(data.markers) do
        if type(marker) ~= "table" or (marker.expiresAt ~= nil and marker.expiresAt <= current) then data.markers[id] = nil; changed = true end
    end
    if changed then data.revision = data.revision + 1; transmit() end
    return changed
end

function Persistence.revision()
    return (tonumber(ensure().revision) or 0) + 0
end

_G.Persistence = Persistence
if SharedMapEnhancer == nil then SharedMapEnhancer = {} end
SharedMapEnhancer.Persistence = Persistence
