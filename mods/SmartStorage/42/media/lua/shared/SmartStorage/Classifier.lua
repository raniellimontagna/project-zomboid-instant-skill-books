SmartStorage = SmartStorage or {}

local Classifier = {}

local categories = {
    "Food",
    "Tools",
    "Medicine",
    "Construction",
    "Weapons",
    "Ammo",
    "Clothing",
    "Literature",
    "Fuel",
    "Farming",
    "Fishing",
}

local vanillaCategories = {
    Food = "Food",
    Weapons = "Weapon",
    Clothing = "Clothing",
    Literature = "Literature",
}

local itemTagNames = {
    Tools = {
        "HAMMER", "SAW", "SCREWDRIVER", "WRENCH", "CROWBAR", "PIPE_WRENCH",
        "PRY_BAR", "BLOW_TORCH",
    },
    Construction = {
        "HAMMER", "SAW", "PLASTER_BUCKET", "WALLPAPER_PASTE", "PAINTBRUSH",
        "HOLD_DIRT", "TAKE_DIRT", "SLEDGEHAMMER", "CLUB_HAMMER", "STONE_MAUL",
        "PICK_AXE", "CHOP_TREE", "DIG_PLOW", "DIG_GRAVE", "REMOVE_STUMP",
        "CUT_PLANT", "IS_CUTTING",
    },
    Ammo = { "AMMO" },
    Fuel = { "PETROL", "IS_FIRE_FUEL", "IS_FIRE_FUEL_SINGLE_USE" },
    Farming = { "IS_SEED", "FERTILIZER", "COMPOST" },
    Fishing = { "FISHING_ROD", "FISHING_LINE", "FISHING_HOOK" },
}

local allowlistKeys = {
    Food = { "FoodItemTypes", "FoodItemAllowlist", "FoodItemTypeAllowlist" },
    Tools = { "ToolsItemTypes", "ToolsItemAllowlist", "ToolsItemTypeAllowlist" },
    Medicine = { "MedicineItemTypes", "MedicineItemAllowlist", "MedicineItemTypeAllowlist" },
    Construction = { "ConstructionItemTypes", "ConstructionItemAllowlist", "ConstructionItemTypeAllowlist" },
    Weapons = { "WeaponsItemTypes", "WeaponsItemAllowlist", "WeaponsItemTypeAllowlist" },
    Ammo = { "AmmoItemTypes", "AmmoItemAllowlist", "AmmoItemTypeAllowlist" },
    Clothing = { "ClothingItemTypes", "ClothingItemAllowlist", "ClothingItemTypeAllowlist" },
    Literature = { "LiteratureItemTypes", "LiteratureItemAllowlist", "LiteratureItemTypeAllowlist" },
    Fuel = { "FuelItemTypes", "FuelItemAllowlist", "FuelItemTypeAllowlist" },
    Farming = { "FarmingItemTypes", "FarmingItemAllowlist", "FarmingItemTypeAllowlist" },
    Fishing = { "FishingItemTypes", "FishingItemAllowlist", "FishingItemTypeAllowlist" },
}

local function validSettings(settings)
    if type(settings) ~= "table" then
        return false
    end
    if settings.CategoryPriority ~= nil and type(settings.CategoryPriority) ~= "table" then
        return false
    end
    if settings.CategoryPriority ~= nil then
        for index = 1, #settings.CategoryPriority do
            if type(settings.CategoryPriority[index]) ~= "string" then
                return false
            end
        end
    end
    for index = 1, #categories do
        local value = settings[categories[index]]
        if value ~= nil and type(value) ~= "boolean" then
            return false
        end
    end
    return true
end

local function enabled(settings, category)
    return settings[category] == true
end

local function call(item, method, ...)
    local itemType = type(item)
    if itemType ~= "table" and itemType ~= "userdata" then
        return false, nil
    end
    local methodOk, methodFunction = pcall(function() return item[method] end)
    if not methodOk or type(methodFunction) ~= "function" then
        return false, nil
    end
    if select("#", ...) == 0 then
        return pcall(methodFunction, item)
    end
    return pcall(methodFunction, item, ...)
end

local function fullType(item)
    local ok, value = call(item, "getFullType")
    if ok == true and type(value) == "string" then
        return value
    end
    return nil
end

local function itemTag(name)
    local namespaceType = type(ItemTag)
    if namespaceType ~= "table" and namespaceType ~= "userdata" then
        return nil
    end
    local ok, token = pcall(function() return ItemTag[name] end)
    if ok and token ~= nil then
        return token
    end
    return nil
end

local function containsTag(collection, tag)
    local collectionType = type(collection)
    if collectionType ~= "table" and collectionType ~= "userdata" then
        return false
    end
    local methodOk, contains = pcall(function() return collection.contains end)
    if methodOk and type(contains) == "function" then
        local ok, value = pcall(contains, collection, tag)
        return ok == true and value == true
    end
    local lookupOk, value = pcall(function() return collection[tag] end)
    if lookupOk and (value == true or value == tag) then
        return true
    end
    if lookupOk and type(collection) == "table" then
        for index = 1, #collection do
            if collection[index] == tag then
                return true
            end
        end
    end
    return false
end

local function hasTag(item, tag)
    local ok, value = call(item, "hasTag", tag)
    if ok == true and value == true then
        return true
    end
    local tagsOk, tags = call(item, "getTags")
    return tagsOk == true and containsTag(tags, tag)
end

local function medicalTypeMatches(item)
    local ok, value = call(item, "getStringItemType")
    return ok == true and value == "Medical"
end

local function allowlistMatches(item, category, settings)
    local typeName = fullType(item)
    if typeName == nil then
        return false
    end
    local keys = allowlistKeys[category] or {}
    for index = 1, #keys do
        local values = settings[keys[index]]
        if values ~= nil then
            if type(values) ~= "table" then
                return false
            end
            if values[typeName] == true then
                return true
            end
        end
    end
    return false
end

local function categoryMatches(item, category)
    local expected = vanillaCategories[category]
    if expected == nil then
        return false
    end
    local ok, value = call(item, "getCategory")
    return ok == true and type(value) == "string" and value == expected
end

function Classifier.matches(item, category, settings)
    local ok, result = pcall(function()
        if not validSettings(settings) or type(category) ~= "string" or not enabled(settings, category) then
            return false
        end
        if allowlistMatches(item, category, settings) then
            return true
        end
        if category == "Medicine" and medicalTypeMatches(item) then
            return true
        end
        local tagNames = itemTagNames[category]
        if tagNames ~= nil then
            for index = 1, #tagNames do
                local token = itemTag(tagNames[index])
                if token ~= nil and hasTag(item, token) then
                    return true
                end
            end
        end
        return categoryMatches(item, category)
    end)
    return ok == true and result == true
end

function Classifier.classify(item, settings)
    local ok, result = pcall(function()
        if not validSettings(settings) then
            return nil
        end

        local priority = settings.CategoryPriority
        if priority == nil then
            priority = categories
        end
        local seen = {}
        for index = 1, #priority do
            local category = priority[index]
            if not seen[category] then
                seen[category] = true
                if Classifier.matches(item, category, settings) then
                    return category
                end
            end
        end
        for index = 1, #categories do
            local category = categories[index]
            if not seen[category] and Classifier.matches(item, category, settings) then
                return category
            end
        end
        return nil
    end)
    if ok ~= true then
        return nil
    end
    return result
end

SmartStorage.Classifier = Classifier
