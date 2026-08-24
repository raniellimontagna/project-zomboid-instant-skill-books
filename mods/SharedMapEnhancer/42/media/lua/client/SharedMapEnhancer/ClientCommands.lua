local ClientCommands = { _counter = 0, _sender = nil, _lastError = nil }

local function nonce()
    ClientCommands._counter = ClientCommands._counter + 1
    local clock = (os and type(os.clock) == "function") and os.clock() or 0
    return string.sub(string.format("sme-%d-%d", math.floor(clock * 1000000), ClientCommands._counter), 1, 64)
end

local function send(command, args)
    local sender = ClientCommands._sender
    if sender == nil and type(sendClientCommand) == "function" then sender = sendClientCommand end
    if type(sender) ~= "function" then return false, "unavailable" end
    local ok, result = pcall(sender, "SharedMapEnhancer", command, args)
    if not ok then return false, "unavailable" end
    return result == nil and true or result
end

local function intent(command, args)
    args.requestId = nonce()
    return send(command, args)
end

function ClientCommands.setSender(sender)
    ClientCommands._sender = type(sender) == "function" and sender or nil
end

function ClientCommands.requestSnapshot() return intent("request", {}) end

function ClientCommands.create(payload)
    payload = type(payload) == "table" and payload or {}
    return intent("create", { category=payload.category, title=payload.title, note=payload.note, icon=payload.icon, color=payload.color, x=payload.x, y=payload.y, z=payload.z, duration=payload.duration })
end

function ClientCommands.update(id, payload)
    payload = type(payload) == "table" and payload or {}
    return intent("update", { id=id, category=payload.category, title=payload.title, note=payload.note, icon=payload.icon, color=payload.color, duration=payload.duration })
end

function ClientCommands.remove(id) return intent("remove", { id=id }) end

function ClientCommands.lastError() return ClientCommands._lastError end

local function onServerCommand(module, command, payload)
    if module ~= "SharedMapEnhancer" or type(payload) ~= "table" then return end
    if command == "response" then command = payload.kind end
    if command == "snapshot" then
        local ok, reason = Cache.reset(payload)
        if not ok then ClientCommands._lastError = reason; ClientCommands.requestSnapshot() end
    elseif command == "delta" then
        local ok, reason = Cache.applyDelta(payload)
        if not ok then ClientCommands._lastError = reason; if reason == "revision_gap" or reason == "invalid_response" then ClientCommands.requestSnapshot() end end
    elseif command == "error" then
        ClientCommands._lastError = type(payload.code) == "string" and payload.code or "invalid_response"
    end
end

if Events and Events.OnServerCommand and type(Events.OnServerCommand.Add) == "function" then
    Events.OnServerCommand.Add(onServerCommand)
end

_G.ClientCommands = ClientCommands
if SharedMapEnhancer == nil then SharedMapEnhancer = {} end
SharedMapEnhancer.ClientCommands = ClientCommands
