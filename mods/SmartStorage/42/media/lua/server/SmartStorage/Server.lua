SmartStorage = SmartStorage or {}

local Server = {}
local playerRequests = setmetatable({}, { __mode = "k" })

local function call(value, name, ...)
    if type(value) ~= "table" and type(value) ~= "userdata" then
        return false, nil
    end
    local ok, method = pcall(function() return value[name] end)
    if not ok or type(method) ~= "function" then
        return false, nil
    end
    return pcall(method, value, ...)
end

local function collectionItems(collection)
    if type(collection) == "table" then
        return collection
    end
    local ok, size = call(collection, "size")
    if not ok or type(size) ~= "number" or size < 0 then
        return nil
    end
    local items = {}
    for index = 0, size - 1 do
        local itemOk, item = call(collection, "get", index)
        if not itemOk then return nil end
        items[#items + 1] = item
    end
    return items
end

local function requestState(player)
    local state = playerRequests[player]
    if state == nil then
        state = { requests = {} }
        playerRequests[player] = state
    end
    return state
end

local function validRequestId(value)
    return type(value) == "string" and #value >= 1 and #value <= 64
        and string.match(value, "^[A-Za-z0-9_-]+$") ~= nil
end

function Server.validateRequest(player, args, now)
    if (type(player) ~= "table" and type(player) ~= "userdata") or type(args) ~= "table"
        or type(now) ~= "number" then
        return nil, "invalid_request"
    end
    if getmetatable(args) ~= nil then
        return nil, "invalid_request"
    end
    local shapeOk, shapeReason = pcall(function()
        local seen = {}
        for key in pairs(args) do
            if key == "itemIds" or key == "items" or key == "container" or key == "containerId"
                or key == "destination" or key == "destinationId" then
                return "client_item_ids"
            end
            if (key ~= "category" and key ~= "requestId") or seen[key] then
                error("invalid shape")
            end
            seen[key] = true
        end
        if seen.category ~= true or seen.requestId ~= true then error("missing shape") end
    end)
    if not shapeOk or shapeReason ~= nil or type(args.category) ~= "string" or not validRequestId(args.requestId) then
        if shapeReason == "client_item_ids" then return nil, shapeReason end
        return nil, "invalid_request"
    end
    local settings = SmartStorage.Settings and SmartStorage.Settings.read()
    if type(settings) ~= "table" or settings[args.category] ~= true
        or type(settings.MaxItemsPerRequest) ~= "number" or settings.MaxItemsPerRequest < 0 then
        return nil, "disabled_category"
    end
    local state = requestState(player)
    if state.requests[args.requestId] ~= nil then
        return nil, "duplicate"
    end
    if state.lastAt ~= nil and now - state.lastAt < 1 then
        return nil, "rate_limited"
    end
    state.lastAt = now
    state.requests[args.requestId] = { pending = true }
    return { category = args.category, requestId = args.requestId, settings = settings }, nil
end

local function collectInventory(itemContainer, found, seen, owned)
    owned[itemContainer] = true
    local ok, rawItems = call(itemContainer, "getItems")
    if not ok then return false end
    local items = collectionItems(rawItems)
    if items == nil then return false end
    for index = 1, #items do
        local item = items[index]
        if item ~= nil and not seen[item] then
            seen[item] = true
            found[#found + 1] = item
            local hasInventory, bag = call(item, "getInventory")
            if hasInventory and bag ~= nil and not collectInventory(bag, found, seen, owned) then
                return false
            end
        end
    end
    return true
end

local function worldCandidates(player, settings)
    local ok, cell = call(player, "getCell")
    if not ok or cell == nil then return {} end
    local xOk, x = call(player, "getX")
    local yOk, y = call(player, "getY")
    local zOk, z = call(player, "getZ")
    if not xOk or not yOk or not zOk or type(x) ~= "number" or type(y) ~= "number" or type(z) ~= "number" then
        return {}
    end
    local candidates, seen = {}, {}
    local radius = math.floor(settings.SearchRadius)
    for squareX = math.floor(x) - radius, math.floor(x) + radius do
        for squareY = math.floor(y) - radius, math.floor(y) + radius do
            local squareOk, square = call(cell, "getGridSquare", squareX, squareY, math.floor(z))
            if squareOk and square ~= nil then
                local objectsOk, rawObjects = call(square, "getObjects")
                local objects = objectsOk and collectionItems(rawObjects) or nil
                if objects ~= nil then
                    for index = 1, #objects do
                        local containerOk, container = call(objects[index], "getContainer")
                        if containerOk and container ~= nil and not seen[container] then
                            seen[container] = true
                            candidates[#candidates + 1] = {
                                container = container,
                                x = squareX,
                                y = squareY,
                                z = math.floor(z),
                                distance = math.sqrt((squareX - x) ^ 2 + (squareY - y) ^ 2),
                            }
                        end
                    end
                end
            end
        end
    end
    return candidates
end

local function send(player, summary)
    if type(sendServerCommand) == "function" then
        pcall(sendServerCommand, player, "SmartStorage", "result", summary)
    end
end

local function handle(module, command, player, args)
    if module ~= "SmartStorage" or command ~= "deposit" then return end
    local now = type(getTimestamp) == "function" and getTimestamp() or 0
    local request, reason = Server.validateRequest(player, args, now)
    if request == nil then
        local summary = { requestId = type(args) == "table" and args.requestId or nil, moved = 0, protected = 0, noDestination = 0, failed = 1, reason = reason }
        local state = (type(player) == "table" or type(player) == "userdata") and playerRequests[player] or nil
        local cached = state and type(args) == "table" and state.requests[args.requestId]
        if reason == "duplicate" and cached and cached.summary then summary = cached.summary end
        send(player, summary)
        return
    end
    local items = {}
    local inventoryOk, inventory = call(player, "getInventory")
    local owned = {}
    if not inventoryOk or inventory == nil or not collectInventory(inventory, items, {}, owned) then
        local summary = { requestId = request.requestId, moved = 0, protected = 0, noDestination = 0, failed = 1, reason = "inventory_unavailable" }
        requestState(player).requests[request.requestId].summary = summary
        send(player, summary)
        return
    end
    -- Classification happens against the server-owned item objects.  Items
    -- outside the requested category are not failures and cannot consume the
    -- request cap; Transfer performs the same check again immediately before
    -- each mutation.
    local classified = {}
    for index = 1, #items do
        if SmartStorage.Classifier and SmartStorage.Classifier.classify(items[index], request.settings) == request.category then
            classified[#classified + 1] = items[index]
        end
    end
    request.items = classified
    request.owned = owned
    request.candidates = worldCandidates(player, request.settings)
    local summary = SmartStorage.Transfer and SmartStorage.Transfer.deposit(player, request)
        or { requestId = request.requestId, moved = 0, protected = 0, noDestination = 0, failed = 1, reason = "transfer_unavailable" }
    requestState(player).requests[request.requestId].summary = summary
    send(player, summary)
end

if Events and Events.OnClientCommand and type(Events.OnClientCommand.Add) == "function" then
    Events.OnClientCommand.Add(handle)
end

SmartStorage.Server = Server
