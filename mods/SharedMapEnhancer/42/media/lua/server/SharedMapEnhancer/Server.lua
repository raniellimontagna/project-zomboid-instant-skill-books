local Server = {}
local cache, cacheOrder, lastMutation, sequence = {}, {}, {}, 0
local CACHE_LIMIT = 256 -- bounded FIFO window per authenticated player
local C = Constants

local function clone(value, seen)
    if type(value) ~= "table" then return value end
    seen = seen or {}
    if seen[value] then return seen[value] end
    local result = {}; seen[value] = result
    for key, item in pairs(value) do result[clone(key, seen)] = clone(item, seen) end
    return result
end

local function playerId(player)
    if type(player) ~= "table" and type(player) ~= "userdata" then return nil end
    local value
    if type(player.getUsername) == "function" then local ok, v = pcall(player.getUsername, player); if ok then value = v end end
    if type(value) ~= "string" and type(player.getOnlineID) == "function" then local ok, v = pcall(player.getOnlineID, player); if ok and v ~= nil then value = tostring(v) end end
    return type(value) == "string" and #value > 0 and value or nil
end

local function isAdmin(player)
    if type(player) ~= "table" and type(player) ~= "userdata" then return false end
    if type(player.isAdmin) == "function" then local ok, v = pcall(player.isAdmin, player); if ok and v then return true end end
    if type(player.getAccessLevel) == "function" then local ok, v = pcall(player.getAccessLevel, player); if ok and (v == "admin" or v == "Admin") then return true end end
    return player.admin == true or player.accessLevel == "admin"
end

local function responseError(requestId, code)
    local result = { kind = "error", code = code }
    if type(requestId) == "string" then result.requestId = requestId end
    return result
end

local function cleanMarker(marker)
    if type(marker) ~= "table" then return nil end
    return { id=marker.id, category=marker.category, title=marker.title, note=marker.note or "", icon=marker.icon, color=marker.color,
        x=marker.x, y=marker.y, z=marker.z, createdBy=marker.createdBy, createdAt=marker.createdAt, expiresAt=marker.expiresAt, revision=marker.revision }
end

local function remember(pid, requestId, result)
    cache[pid] = cache[pid] or {}
    cacheOrder[pid] = cacheOrder[pid] or {}
    cache[pid][requestId] = clone(result)
    cacheOrder[pid][#cacheOrder[pid] + 1] = requestId
    if #cacheOrder[pid] > CACHE_LIMIT then
        local evicted = table.remove(cacheOrder[pid], 1)
        cache[pid][evicted] = nil
    end
    return result
end

local function nextId(pid, now)
    sequence = sequence + 1
    return tostring(pid) .. "-" .. tostring(now) .. "-" .. tostring(sequence)
end

function Server.validateAndHandle(command, player, args, now)
    local pid = playerId(player)
    local requestId = type(args) == "table" and args.requestId or nil
    if pid == nil then return responseError(requestId, "unauthorized") end
    if type(command) ~= "string" or type(args) ~= "table" then return responseError(requestId, "invalid_request") end
    local shapeOk, shapeReason = Validation.validateRequestShape(command, args)
    if not shapeOk then return responseError(args.requestId, shapeReason or "invalid_request") end
    local prior = cache[pid] and cache[pid][args.requestId]
    if prior ~= nil then return clone(prior), true end
    local current = type(now) == "number" and now or 0
    Persistence.cleanup(current)
    if command == "request" then
        local result = { kind="snapshot", requestId=args.requestId, revision=Persistence.revision(), markers={} }
        for _, marker in ipairs(Persistence.list(current)) do result.markers[#result.markers + 1] = cleanMarker(marker) end
        return remember(pid, args.requestId, result)
    end
    local previous = lastMutation[pid]
    if previous ~= nil and current - previous < 1 then return remember(pid, args.requestId, responseError(args.requestId, "rate_limited")) end
    local result, normalized, reason
    if command == "create" then
        normalized, reason = Validation.normalizeCreate(args, current, { markerCount = #Persistence.list(current), maxMarkers = 500,
            minX=C.mapBounds.minX, maxX=C.mapBounds.maxX, minY=C.mapBounds.minY, maxY=C.mapBounds.maxY, minZ=C.mapBounds.minZ, maxZ=C.mapBounds.maxZ })
        if normalized == nil then return remember(pid, args.requestId, responseError(args.requestId, reason)) end
        normalized.id, normalized.createdBy, normalized.createdAt = nextId(pid, current), pid, current
        normalized.revision = Persistence.revision() + 1
        if not Persistence.insert(normalized) then return remember(pid, args.requestId, responseError(args.requestId, "invalid_request")) end
        lastMutation[pid] = current
        result = { kind="delta", revision=Persistence.revision(), operation="create", marker=cleanMarker(normalized) }
    elseif command == "update" then
        local existing = Persistence.get(args.id)
        if existing == nil then return remember(pid, args.requestId, responseError(args.requestId, "not_found")) end
        if existing.expiresAt ~= nil and existing.expiresAt <= current then return remember(pid, args.requestId, responseError(args.requestId, "expired")) end
        if existing.createdBy ~= pid then return remember(pid, args.requestId, responseError(args.requestId, "unauthorized")) end
        normalized, reason = Validation.normalizeUpdate(args, existing, current, {})
        if normalized == nil then return remember(pid, args.requestId, responseError(args.requestId, reason)) end
        normalized.revision = Persistence.revision() + 1
        if not Persistence.replace(normalized) then return remember(pid, args.requestId, responseError(args.requestId, "not_found")) end
        lastMutation[pid] = current
        result = { kind="delta", revision=Persistence.revision(), operation="update", marker=cleanMarker(normalized) }
    elseif command == "remove" then
        local existing = Persistence.get(args.id)
        if existing == nil then return remember(pid, args.requestId, responseError(args.requestId, "not_found")) end
        if existing.expiresAt ~= nil and existing.expiresAt <= current then return remember(pid, args.requestId, responseError(args.requestId, "expired")) end
        if existing.createdBy ~= pid and not isAdmin(player) then return remember(pid, args.requestId, responseError(args.requestId, "unauthorized")) end
        if not Persistence.remove(args.id) then return remember(pid, args.requestId, responseError(args.requestId, "not_found")) end
        lastMutation[pid] = current
        result = { kind="delta", revision=Persistence.revision(), operation="remove", id=args.id }
    else
        result = responseError(args.requestId, "invalid_request")
    end
    return remember(pid, args.requestId, result)
end

local function clientPayload(response)
    if type(response) ~= "table" then return nil end
    if response.kind == "snapshot" then return { requestId=response.requestId, revision=response.revision, markers=response.markers } end
    if response.kind == "delta" then
        if response.operation == "remove" then return { revision=response.revision, operation="remove", id=response.id } end
        return { revision=response.revision, operation=response.operation, marker=response.marker }
    end
    if response.kind == "error" then return { requestId=response.requestId, code=response.code } end
    return nil
end

local function broadcast(delta)
    local payload = clientPayload(delta)
    if type(sendServerCommand) ~= "function" or payload == nil then return false end
    -- B42's three-argument overload delivers this once to every connected client,
    -- including the requester.  Do not pair it with a targeted delta.
    local ok = pcall(sendServerCommand, "SharedMapEnhancer", "delta", payload)
    return ok
end

function Server.cleanupExpired(now)
    local changed, removed = Persistence.cleanup(now)
    if changed and type(removed) == "table" then
        for _, item in ipairs(removed) do
            broadcast({ kind="delta", revision=item.revision, operation="remove", id=item.id })
        end
    end
    return changed
end

local function onClientCommand(module, command, player, args)
    if module ~= "SharedMapEnhancer" then return end
    local current = os and os.time and os.time() or 0
    Server.cleanupExpired(current)
    local response, replayed = Server.validateAndHandle(command, player, args, current)
    if response.kind == "delta" and not replayed then
        broadcast(response)
    elseif response.kind ~= "delta" and type(sendServerCommand) == "function" then
        pcall(sendServerCommand, player, "SharedMapEnhancer", response.kind, clientPayload(response))
    end
end

if Events and Events.OnClientCommand and type(Events.OnClientCommand.Add) == "function" then
    pcall(Events.OnClientCommand.Add, onClientCommand)
end
if Events and Events.OnTick and type(Events.OnTick.Add) == "function" then
    pcall(Events.OnTick.Add, function() Server.cleanupExpired(os and os.time and os.time() or 0) end)
end

_G.Server = Server
if SharedMapEnhancer == nil then SharedMapEnhancer = {} end
SharedMapEnhancer.Server = Server
