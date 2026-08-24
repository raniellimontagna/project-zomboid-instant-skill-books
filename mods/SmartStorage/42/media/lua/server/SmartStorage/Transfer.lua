SmartStorage = SmartStorage or {}

local Transfer = {}

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

local function result(request)
    return {
        requestId = request.requestId,
        moved = 0,
        protected = 0,
        noDestination = 0,
        failed = 0,
    }
end

local function isValidItem(player, item, request)
    if SmartStorage.Classifier == nil or SmartStorage.Protection == nil then
        return false, "failed"
    end
    if not SmartStorage.Classifier.matches(item, request.category, request.settings) then
        return false, "failed"
    end
    local allowed = SmartStorage.Protection.check(item, player, request.settings)
    if allowed ~= true then
        return false, "protected"
    end
    return true, nil
end

local function move(item, destination)
    local ok, source = call(item, "getContainer")
    if not ok or source == nil then
        return false
    end

    -- ItemContainer:Remove(InventoryItem) and AddItem(InventoryItem) are the
    -- vanilla object-transfer calls.  Passing the existing item object avoids
    -- the string overload which creates an item.
    ok = call(source, "Remove", item)
    if not ok then
        return false
    end
    ok = call(destination, "AddItem", item)
    if not ok then
        -- Fail closed.  There is no safe generic rollback adapter for an
        -- unknown B42 container implementation.
        return false
    end
    call(source, "setDrawDirty", true)
    call(destination, "setDrawDirty", true)
    return true
end

function Transfer.deposit(player, request)
    local summary = result(type(request) == "table" and request or {})
    if type(request) ~= "table" or type(request.items) ~= "table" or type(request.candidates) ~= "table"
        or type(request.settings) ~= "table" or type(request.category) ~= "string" then
        summary.failed = 1
        return summary
    end

    local maximum = request.settings.MaxItemsPerRequest
    if type(maximum) ~= "number" or maximum < 0 then
        summary.failed = #request.items
        return summary
    end
    local limit = math.min(#request.items, maximum)
    for index = 1, limit do
        local item = request.items[index]
        local valid, reason = isValidItem(player, item, request)
        if not valid then
            summary[reason] = summary[reason] + 1
        else
            local destination = SmartStorage.Selection and SmartStorage.Selection.choose(
                request.candidates, request.category, request.settings, player
            )
            if destination == nil then
                summary.noDestination = summary.noDestination + 1
            else
                local sourceOk, source = call(item, "getContainer")
                if request.owned ~= nil and (not sourceOk or request.owned[source] ~= true) then
                    summary.failed = summary.failed + 1
                elseif move(item, destination) then
                    summary.moved = summary.moved + 1
                else
                    summary.failed = summary.failed + 1
                end
            end
        end
    end
    return summary
end

SmartStorage.Transfer = Transfer
