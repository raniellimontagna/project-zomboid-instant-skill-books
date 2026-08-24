local Cache = { _markers = {}, _revision = 0 }

local function copy(value, seen)
    if type(value) ~= "table" then return value end
    seen = seen or {}
    if seen[value] then return seen[value] end
    local result = {}
    seen[value] = result
    for key, item in pairs(value) do result[copy(key, seen)] = copy(item, seen) end
    return result
end

local function now()
    if os and type(os.time) == "function" then
        local ok, value = pcall(os.time)
        if ok and type(value) == "number" then return value end
    end
    return 0
end

local function validMarker(marker)
    if type(marker) ~= "table" or type(marker.id) ~= "string" then return false end
    local ok = false
    if Validation and type(Validation.isValidMarker) == "function" then ok = Validation.isValidMarker(marker, now()) end
    return ok == true
end

local function validRevision(value)
    return type(value) == "number" and value == value and value ~= math.huge and value ~= -math.huge and value % 1 == 0 and value >= 0
end

local function validRequestId(value)
    return value == nil or (type(value) == "string" and #value >= 1 and #value <= 64)
end

local function exactKeys(value, allowed)
    for key in pairs(value) do if type(key) ~= "string" or not allowed[key] then return false end end
    return true
end

function Cache.reset(snapshot)
    if type(snapshot) ~= "table" or getmetatable(snapshot) ~= nil or not exactKeys(snapshot, { revision=true, markers=true, requestId=true }) or not validRequestId(snapshot.requestId) or not validRevision(snapshot.revision) or type(snapshot.markers) ~= "table" or getmetatable(snapshot.markers) ~= nil then
        return false, "invalid_response"
    end
    local nextMarkers = {}
    for _, marker in pairs(snapshot.markers) do
        if type(marker) ~= "table" or type(marker.id) ~= "string" or not validMarker(marker) or nextMarkers[marker.id] ~= nil then return false, "invalid_response" end
        nextMarkers[marker.id] = copy(marker)
    end
    Cache._markers = nextMarkers
    Cache._revision = snapshot.revision
    return true, nil
end

function Cache.applyDelta(delta)
    if type(delta) ~= "table" or getmetatable(delta) ~= nil or not exactKeys(delta, { revision=true, operation=true, marker=true, id=true, requestId=true }) or not validRequestId(delta.requestId) or not validRevision(delta.revision) then return false, "invalid_response" end
    if delta.revision ~= Cache._revision + 1 then return false, "revision_gap" end
    local operation = delta.operation
    if operation == "create" or operation == "update" then
        if not validMarker(delta.marker) or delta.marker.revision ~= delta.revision then return false, "invalid_response" end
        local id = delta.marker.id
        if operation == "create" and Cache._markers[id] ~= nil then return false, "invalid_response" end
        if operation == "update" and Cache._markers[id] == nil then return false, "invalid_response" end
        Cache._markers[id] = copy(delta.marker)
    elseif operation == "remove" then
        if type(delta.id) ~= "string" or Cache._markers[delta.id] == nil then return false, "invalid_response" end
        Cache._markers[delta.id] = nil
    else
        return false, "invalid_response"
    end
    Cache._revision = delta.revision
    return true, nil
end

function Cache.get(id)
    if type(id) ~= "string" or Cache._markers[id] == nil then return nil end
    return copy(Cache._markers[id])
end

function Cache.list(category)
    local result = {}
    for _, marker in pairs(Cache._markers) do
        if category == nil or marker.category == category then result[#result + 1] = copy(marker) end
    end
    table.sort(result, function(a, b)
        if a.createdAt == b.createdAt then return a.id < b.id end
        return a.createdAt < b.createdAt
    end)
    return result
end

function Cache.revision() return Cache._revision end

_G.Cache = Cache
if SharedMapEnhancer == nil then SharedMapEnhancer = {} end
SharedMapEnhancer.Cache = Cache
