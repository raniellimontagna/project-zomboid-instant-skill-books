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
    if SmartStorage.Classifier.classify(item, request.settings) ~= request.category then
        return false, "failed"
    end
    local allowed = SmartStorage.Protection.check(item, player, request.settings)
    if allowed ~= true then
        return false, "protected"
    end
    return true, nil
end

local function contains(container, item)
    local ok, items = call(container, "getItems")
    if not ok then return false end
    if type(items) == "table" then
        for index = 1, #items do
            if items[index] == item then return true end
        end
        return false
    end
    local sizeOk, size = call(items, "size")
    if not sizeOk or type(size) ~= "number" or size < 0 then return false end
    for index = 0, size - 1 do
        local itemOk, value = call(items, "get", index)
        if not itemOk then return false end
        if value == item then return true end
    end
    return false
end

local function snapshot(container)
    local ok, items = call(container, "getItems")
    if not ok then return nil end
    local result = { count = 0, items = {} }
    if type(items) == "table" then
        for index = 1, #items do
            result.count = result.count + 1
            result.items[items[index]] = true
        end
        return result
    end
    local sizeOk, size = call(items, "size")
    if not sizeOk or type(size) ~= "number" or size < 0 then return nil end
    for index = 0, size - 1 do
        local itemOk, value = call(items, "get", index)
        if not itemOk then return nil end
        result.count = result.count + 1
        result.items[value] = true
    end
    return result
end

local function unchanged(before, after)
    if before == nil or after == nil or before.count ~= after.count then return false end
    for item in pairs(before.items) do
        if after.items[item] ~= true then return false end
    end
    return true
end

local function hasMethod(value, name)
    local ok, method = pcall(function() return value[name] end)
    return ok and type(method) == "function"
end

local function successfulCall(value, name, ...)
    local ok, returned = call(value, name, ...)
    return ok and returned ~= false
end

local function restore(item, source, destination)
    if contains(destination, item) then
        if not hasMethod(destination, "Remove") or not successfulCall(destination, "Remove", item)
            or contains(destination, item) then
            return false
        end
    end
    return hasMethod(source, "AddItem") and successfulCall(source, "AddItem", item)
        and contains(source, item)
end

local function canRestoreOriginal(item, destination, before)
    if contains(destination, item) then return true end
    local after = snapshot(destination)
    -- A no-op/failed add leaves the object-identity snapshot unchanged even
    -- when the destination already has stacks.  A successful stack merge is
    -- handled earlier by its returned, contained destination stack and never
    -- reaches this rollback branch.
    return before ~= nil and unchanged(before, after)
end

local function move(player, item, destination)
    local ok, source = call(item, "getContainer")
    if not ok or source == nil or not contains(source, item)
        or not SmartStorage.Selection or not SmartStorage.Selection.canAccept(destination, player, item) then
        return false
    end
    -- Validate the full existing-item transaction surface before removal.  If
    -- the add cannot prove its postcondition, rollback uses the same existing
    -- item overload and is verified before reporting failure.
    if not hasMethod(source, "Remove") or not hasMethod(source, "AddItem")
        or not hasMethod(destination, "AddItem") or not hasMethod(destination, "Remove") then
        return false
    end
    local destinationBefore = snapshot(destination)
    if destinationBefore == nil then return false end

    -- ItemContainer:Remove(InventoryItem) and AddItem(InventoryItem) are the
    -- vanilla object-transfer calls.  Passing the existing item object avoids
    -- the string overload which creates an item.
    local removed = successfulCall(source, "Remove", item)
    if not removed or contains(source, item) then
        -- A buggy/container-side failure can report false after it has already
        -- detached the object.  Restore the existing object before reporting
        -- failure so a failed remove cannot lose it.
        if not contains(source, item) then restore(item, source, destination) end
        return false
    end
    local addOk, destinationItem = call(destination, "AddItem", item)
    local itemType = type(destinationItem)
    if addOk and (itemType == "table" or itemType == "userdata") and contains(destination, destinationItem) then
        call(source, "setDrawDirty", true)
        call(destination, "setDrawDirty", true)
        return true
    end
    if addOk and destinationItem == nil and contains(destination, item) then
        call(source, "setDrawDirty", true)
        call(destination, "setDrawDirty", true)
        return true
    end
    if canRestoreOriginal(item, destination, destinationBefore) then
        restore(item, source, destination)
    end
    return false
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
            if destination == nil or not SmartStorage.Selection.canAccept(destination, player, item) then
                summary.noDestination = summary.noDestination + 1
            else
                local sourceOk, source = call(item, "getContainer")
                if request.owned ~= nil and (not sourceOk or request.owned[source] ~= true) then
                    summary.failed = summary.failed + 1
                elseif move(player, item, destination) then
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
