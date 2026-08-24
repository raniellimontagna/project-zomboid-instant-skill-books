SmartStorage = SmartStorage or {}

local Result = {}

local function localized(key, fallback)
    if type(getText) == "function" then
        local ok, value = pcall(getText, key)
        if ok and type(value) == "string" and value ~= "" and value ~= key then
            return value
        end
    end
    return fallback
end

local function count(value)
    if type(value) ~= "number" or value ~= value or value == math.huge or value == -math.huge then
        return 0
    end
    value = math.floor(value)
    if value < 0 then return 0 end
    return value
end

local function reasonText(summary)
    if type(summary) ~= "table" or type(summary.reason) ~= "string"
        or string.match(summary.reason, "^[A-Za-z0-9_-]+$") == nil then
        return nil
    end
    local key = "UI_SmartStorage_Reason_" .. summary.reason
    local text = localized(key, nil)
    return text
end

function Result.format(summary)
    local values = type(summary) == "table" and summary or {}
    local message = localized("UI_SmartStorage_Moved", "Movidos") .. ": " .. count(values.moved)
        .. " | " .. localized("UI_SmartStorage_Protected", "Protegidos") .. ": " .. count(values.protected)
        .. " | " .. localized("UI_SmartStorage_NoDestination", "Sem destino") .. ": " .. count(values.noDestination)
        .. " | " .. localized("UI_SmartStorage_Failed", "Falhas") .. ": " .. count(values.failed)
    local reason = reasonText(values)
    if reason ~= nil then message = message .. " | " .. reason end
    return message
end

function Result.handle(module, command, summary)
    if module ~= "SmartStorage" or command ~= "result" then return end
    local message = Result.format(summary)
    if type(HaloTextHelper) == "table" and type(HaloTextHelper.addText) == "function"
        and type(getPlayer) == "function" then
        pcall(HaloTextHelper.addText, getPlayer(), message)
    end
    return message
end

if Events and Events.OnServerCommand and type(Events.OnServerCommand.Add) == "function" then
    Events.OnServerCommand.Add(Result.handle)
end

SmartStorage.Result = Result
