SmartStorage = SmartStorage or {}

local ContextMenu = {}

local function localized(key, fallback)
    if type(getText) == "function" then
        local ok, value = pcall(getText, key)
        if ok and type(value) == "string" and value ~= "" and value ~= key then
            return value
        end
    end
    return fallback
end

local function firstItem(entry)
    if type(entry) ~= "table" then
        return entry
    end
    if entry.items == nil then
        return entry
    end
    if type(entry.items) == "table" then
        return entry.items[1]
    end
    local ok, get = pcall(function() return entry.items.get end)
    if ok and type(get) == "function" then
        local found, item = pcall(get, entry.items, 0)
        if found then return item end
    end
    return nil
end

local function eligibleCategory(items)
    if type(items) ~= "table" or SmartStorage.Classifier == nil
        or type(SmartStorage.Classifier.classify) ~= "function"
        or SmartStorage.Settings == nil or type(SmartStorage.Settings.read) ~= "function" then
        return nil
    end

    local settingsOk, settings = pcall(SmartStorage.Settings.read)
    if not settingsOk or type(settings) ~= "table" then return nil end

    for index = 1, #items do
        local item = firstItem(items[index])
        local classified, category = pcall(SmartStorage.Classifier.classify, item, settings)
        if classified and type(category) == "string" and settings[category] == true then
            return category
        end
    end
    return nil
end

local function deposit(_, category)
    if SmartStorage.ClientCommands and type(SmartStorage.ClientCommands.deposit) == "function" then
        SmartStorage.ClientCommands.deposit(category)
    end
end

function ContextMenu.onFillInventoryObjectContextMenu(_, context, items)
    if type(context) ~= "table" or type(context.addOption) ~= "function" then return end
    local category = eligibleCategory(items)
    if category == nil then return end

    context:addOption(localized("UI_SmartStorage_DepositCompatible", "Depositar itens compatíveis"), nil, deposit, category)
end

if Events and Events.OnFillInventoryObjectContextMenu
    and type(Events.OnFillInventoryObjectContextMenu.Add) == "function" then
    Events.OnFillInventoryObjectContextMenu.Add(ContextMenu.onFillInventoryObjectContextMenu)
end

SmartStorage.ContextMenu = ContextMenu
