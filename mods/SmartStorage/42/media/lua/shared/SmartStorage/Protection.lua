SmartStorage = SmartStorage or {}

local Protection = {}

local function object(value)
    local valueType = type(value)
    return valueType == "table" or valueType == "userdata"
end

local function member(value, name)
    if not object(value) then
        return "missing", nil
    end
    local ok, memberValue = pcall(function() return value[name] end)
    if not ok then
        return "error", nil
    end
    if memberValue == nil then
        return "missing", nil
    end
    if type(memberValue) == "function" then
        return "function", memberValue
    end
    return "value", memberValue
end

local function call(value, name, ...)
    local kind, memberValue = member(value, name)
    if kind ~= "function" then
        return kind, nil
    end
    local ok, result = pcall(memberValue, value, ...)
    if not ok then
        return "error", nil
    end
    return "ok", result
end

local function flag(value, name)
    local kind, memberValue = member(value, name)
    if kind == "missing" then
        return "missing", false
    end
    if kind == "error" then
        return "error", false
    end
    if kind == "value" then
        if type(memberValue) ~= "boolean" then
            return "error", false
        end
        return "ok", memberValue
    end
    local ok, result = pcall(memberValue, value)
    if not ok or type(result) ~= "boolean" then
        return "error", false
    end
    return "ok", result
end

local function anyFlag(item, character, itemName, characterName)
    local status, value = flag(item, itemName)
    if status == "error" then
        return "error", false
    end
    if status == "ok" and value then
        return "ok", true
    end
    if object(character) and characterName ~= nil then
        status, value = call(character, characterName, item)
        if status == "error" then
            return "error", false
        end
        if status == "ok" then
            if type(value) ~= "boolean" then
                return "error", false
            end
            if value then
                return "ok", true
            end
        end
    end
    return "ok", false
end

local vanillaCategories = {
    Food = true,
    Weapon = true,
    Clothing = true,
    Literature = true,
}

local knownTags = {
    "TOOLS", "TOOL", "MEDICINE", "MEDICAL", "CONSTRUCTION", "BUILDING_MATERIAL",
    "MATERIAL", "AMMO", "FUEL", "IS_SEED", "FERTILIZER", "COMPOST", "FISHING",
    "FISHING_ROD", "FISHING_LINE", "FISHING_HOOK",
}

local allowlistCategories = {
    "Food", "Tools", "Medicine", "Construction", "Weapons", "Ammo", "Clothing",
    "Literature", "Fuel", "Farming", "Fishing",
}

local function itemIdentity(item, settings)
    local fullTypeStatus, fullType = call(item, "getFullType")
    if fullTypeStatus == "error" then
        return false
    end
    if fullTypeStatus == "ok" and type(fullType) ~= "string" then
        return false
    end

    local categoryStatus, category = call(item, "getCategory")
    if categoryStatus == "error" then
        return false
    end
    if categoryStatus == "ok" and type(category) ~= "string" then
        return false
    end
    if categoryStatus == "ok" and vanillaCategories[category] then
        return true
    end

    if fullTypeStatus == "ok" and fullType ~= "" then
        for index = 1, #allowlistCategories do
            local values = settings[allowlistCategories[index] .. "Types"]
            if type(values) == "table" and values[fullType] == true then
                return true
            end
        end
    end

    local tagStatus, tagValue
    for index = 1, #knownTags do
        tagStatus, tagValue = call(item, "hasTag", knownTags[index])
        if tagStatus == "error" then
            return false
        end
        if tagStatus == "ok" then
            if type(tagValue) ~= "boolean" then
                return false
            end
            if tagValue then
                return true
            end
        end
    end
    return false
end

local function conditionReason(item, threshold)
    local status, broken = flag(item, "isBroken")
    if status == "error" then
        return "invalid"
    end
    if status == "ok" and broken then
        return "low_condition"
    end

    local conditionStatus, condition = call(item, "getCondition")
    if conditionStatus == "error" then
        return "invalid"
    end
    if conditionStatus ~= "ok" then
        return nil
    end
    if type(condition) ~= "number" then
        return "invalid"
    end

    local maxStatus, maximum = call(item, "getConditionMax")
    if maxStatus == "error" then
        return "invalid"
    end
    if maxStatus == "ok" then
        if type(maximum) ~= "number" or maximum <= 0 then
            return "invalid"
        end
        if (condition / maximum) * 100 <= threshold then
            return "low_condition"
        end
    elseif condition <= threshold then
        return "low_condition"
    end
    return nil
end

local function countItems(collection)
    if not object(collection) then
        return nil
    end
    local status, size = call(collection, "size")
    if status == "ok" and type(size) == "number" and size >= 0 then
        return size
    end
    if type(collection) == "table" then
        return #collection
    end
    return nil
end

local function filledReason(item)
    local status, inventory = call(item, "getInventory")
    if status == "error" then
        return "invalid"
    end
    if status == "ok" then
        if not object(inventory) then
            return "invalid"
        end
        local itemsStatus, items = call(inventory, "getItems")
        if itemsStatus == "error" then
            return "invalid"
        end
        if itemsStatus == "ok" then
            local count = countItems(items)
            if count == nil then
                return "invalid"
            end
            if count > 0 then
                return "filled_container"
            end
        end
    end

    status, inventory = call(item, "getItemContainer")
    if status == "error" then
        return "invalid"
    end
    if status == "ok" and inventory ~= nil then
        if not object(inventory) then
            return "invalid"
        end
        local itemsStatus, items = call(inventory, "getItems")
        if itemsStatus == "error" then
            return "invalid"
        end
        if itemsStatus == "ok" then
            local count = countItems(items)
            if count == nil then
                return "invalid"
            end
            if count > 0 then
                return "filled_container"
            end
        end
    end
    return nil
end

local function checkInternal(item, character, settings)
    if not object(item) or type(settings) ~= "table" then
        return false, "invalid"
    end
    local threshold = settings.LowConditionPercent
    if type(threshold) ~= "number" or threshold ~= math.floor(threshold)
        or threshold < 0 or threshold > 100 then
        return false, "invalid"
    end

    local status, value = anyFlag(item, character, "isEquipped", "isEquipped")
    if status == "error" then
        return false, "invalid"
    end
    if value then
        return false, "equipped"
    end
    status, value = anyFlag(item, character, "isWorn", "isWearing")
    if status == "error" then
        return false, "invalid"
    end
    if value then
        return false, "worn"
    end
    status, value = flag(item, "isFavorite")
    if status == "error" then
        return false, "invalid"
    end
    if status == "ok" and value then
        return false, "favorite"
    end

    local reason = conditionReason(item, threshold)
    if reason ~= nil then
        return false, reason
    end
    reason = filledReason(item)
    if reason ~= nil then
        return false, reason
    end
    if not itemIdentity(item, settings) then
        return false, "invalid"
    end
    return true, nil
end

function Protection.check(item, character, settings)
    local ok, allowed, reason = pcall(checkInternal, item, character, settings)
    if ok and allowed == true then
        return true, nil
    end
    if ok and allowed == false and type(reason) == "string" then
        return false, reason
    end
    return false, "invalid"
end

SmartStorage.Protection = Protection
