SmartStorage = SmartStorage or {}

local ClientCommands = {}
local requestNonce = 0

local function nextRequestId()
    requestNonce = requestNonce + 1
    return "smartstorage-" .. tostring(requestNonce)
end

function ClientCommands.deposit(category)
    if type(category) ~= "string" or category == "" then
        return nil
    end
    if type(sendClientCommand) ~= "function" or type(getPlayer) ~= "function" then
        return nil
    end

    local args = {
        category = category,
        requestId = nextRequestId(),
    }
    sendClientCommand(getPlayer(), "SmartStorage", "deposit", args)
    return args.requestId
end

SmartStorage.ClientCommands = ClientCommands
