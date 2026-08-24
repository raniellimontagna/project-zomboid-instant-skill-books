SmartStorage = SmartStorage or {}

local Settings = {}

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

local defaults = {
    Food = true,
    Tools = true,
    Medicine = true,
    Construction = true,
    Weapons = false,
    Ammo = false,
    Clothing = false,
    Literature = false,
    Fuel = false,
    Farming = false,
    Fishing = false,
    SearchRadius = 3,
    MaxItemsPerRequest = 200,
    LowConditionPercent = 25,
}

local function trim(value)
    return (value:gsub("^%s*(.-)%s*$", "%1"))
end

function Settings.parseList(value)
    local result = {}
    if type(value) ~= "string" then
        return result
    end

    for entry in string.gmatch(value, "[^,]+") do
        local trimmed = trim(entry)
        if trimmed ~= "" then
            result[trimmed] = true
        end
    end
    return result
end

local function readBoolean(source, key)
    if type(source[key]) == "boolean" then
        return source[key]
    end
    return defaults[key]
end

local function readInteger(source, key)
    local value = source[key]
    if type(value) == "number" and value == math.floor(value) and value >= 0 then
        return value
    end
    return defaults[key]
end

local function readPriority(value)
    local result = {}
    local seen = {}

    if type(value) == "string" then
        for entry in string.gmatch(value, "[^,]+") do
            local category = trim(entry)
            if category ~= "" and not seen[category] then
                result[#result + 1] = category
                seen[category] = true
            end
        end
    elseif type(value) == "table" then
        for index = 1, #value do
            if type(value[index]) ~= "string" then
                return nil
            end
            local category = trim(value[index])
            if category ~= "" and not seen[category] then
                result[#result + 1] = category
                seen[category] = true
            end
        end
    elseif value ~= nil then
        return nil
    end

    if #result == 0 then
        for index = 1, #categories do
            result[index] = categories[index]
        end
    end
    return result
end

function Settings.read()
    local source = {}
    if type(SandboxVars) == "table" and type(SandboxVars.SmartStorage) == "table" then
        source = SandboxVars.SmartStorage
    end

    local settings = {}
    for index = 1, #categories do
        local category = categories[index]
        settings[category] = readBoolean(source, category)
    end

    settings.SearchRadius = readInteger(source, "SearchRadius")
    settings.MaxItemsPerRequest = readInteger(source, "MaxItemsPerRequest")
    settings.LowConditionPercent = readInteger(source, "LowConditionPercent")
    settings.CategoryPriority = readPriority(source.CategoryPriority)
    if settings.CategoryPriority == nil then
        settings.CategoryPriority = {}
        for index = 1, #categories do
            settings.CategoryPriority[index] = categories[index]
        end
    end

    for index = 1, #categories do
        local category = categories[index]
        settings[category .. "Types"] = Settings.parseList(source[category .. "Types"])
    end
    return settings
end

SmartStorage.Settings = Settings
