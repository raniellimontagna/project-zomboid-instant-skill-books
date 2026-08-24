local Server = {}
local cache, lastMutation, sequence = {}, {}, 0

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
    cache[pid][requestId] = result
    return result
end

local function nextId(pid, now)
    sequence = sequence + 1
    return tostring(pid) .. "-" .. tostring(now) .. "-" .. tostring(sequence)
end

local function markerCount()
    local count = 0
    for _ in pairs(Persistence._data and Persistence._data.markers or {}) do count = count + 1 end
    return count
end

function Server.validateAndHandle(command, player, args, now)
    local pid = playerId(player)
    local requestId = type(args) == "table" and args.requestId or nil
    if pid == nil then return responseError(requestId, "unauthorized") end
    if type(command) ~= "string" or type(args) ~= "table" then return responseError(requestId, "invalid_request") end
    local shapeOk, shapeReason = Validation.validateRequestShape(command, args)
    if not shapeOk then return responseError(args.requestId, shapeReason or "invalid_request") end
    local prior = cache[pid] and cache[pid][args.requestId]
    if prior ~= nil then return prior end
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
        normalized, reason = Validation.normalizeCreate(args, current, { markerCount = #Persistence.list(current), maxMarkers = 500 })
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

local function onClientCommand(module, command, player, args)
    if module ~= "SharedMapEnhancer" then return end
    local response = Server.validateAndHandle(command, player, args, os and os.time and os.time() or 0)
    if type(sendServerCommand) == "function" then pcall(sendServerCommand, player, "SharedMapEnhancer", "response", response) end
end

if Events and Events.OnClientCommand and type(Events.OnClientCommand.Add) == "function" then
    pcall(Events.OnClientCommand.Add, onClientCommand)
end

_G.Server = Server
if SharedMapEnhancer == nil then SharedMapEnhancer = {} end
SharedMapEnhancer.Server = Server
