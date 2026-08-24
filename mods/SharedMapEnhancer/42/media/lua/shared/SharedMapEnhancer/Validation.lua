local C = Constants

local Validation = {}
local createKeys = { requestId=true, category=true, title=true, note=true, icon=true, color=true, x=true, y=true, z=true, duration=true }
local updateKeys = { requestId=true, id=true, category=true, title=true, note=true, icon=true, color=true, duration=true }
local shapeKeys = {
    create = createKeys,
    update = updateKeys,
    remove = { requestId=true, id=true },
    request = { requestId=true },
}

local function safeString(value, minimum, maximum)
    if type(value) ~= "string" or #value < minimum or #value > maximum then return nil end
    for i = 1, #value do
        local byte = string.byte(value, i)
        if byte < 32 or byte == 127 then return nil end
    end
    return value
end

local function trim(value)
    return (value:gsub("^%s+", ""):gsub("%s+$", ""))
end

local function finiteInteger(value)
    return type(value) == "number" and value == value and value ~= math.huge and value ~= -math.huge and value % 1 == 0
end

local function finiteNumber(value)
    return type(value) == "number" and value == value and value ~= math.huge and value ~= -math.huge
end

local function exactKeys(args, allowed)
    if type(args) ~= "table" or getmetatable(args) ~= nil then return false end
    for key in pairs(args) do
        if type(key) ~= "string" or not allowed[key] then return false end
    end
    return true
end

local function requestId(value)
    return safeString(value, 1, 64) ~= nil
end

local function coordinate(value, limits, name)
    if not finiteInteger(value) then return false end
    if limits == nil then return true end
    local low = limits["min" .. name] or limits["mapMin" .. name]
    local high = limits["max" .. name] or limits["mapMax" .. name]
    return (low == nil or value >= low) and (high == nil or value <= high)
end

local function markerLimit(limits)
    if type(limits) ~= "table" then return false end
    local maximum = limits.maxMarkers or limits.max or 500
    local count = limits.markerCount or limits.count or limits.currentCount
    return type(count) == "number" and count >= maximum
end

local function commonEditable(args, limits)
    if type(args.title) ~= "string" or safeString(args.title, 0, #args.title) == nil then return nil, "invalid_text" end
    if args.note ~= nil and (type(args.note) ~= "string" or safeString(args.note, 0, #args.note) == nil) then return nil, "invalid_text" end
    local title = type(args.title) == "string" and trim(args.title) or nil
    local note = args.note == nil and "" or (type(args.note) == "string" and trim(args.note) or nil)
    if title == nil or note == nil or safeString(title, 1, 80) == nil or safeString(note, 0, 240) == nil then return nil, "invalid_text" end
    if not C.categorySet[args.category] then return nil, "invalid_category" end
    if not C.iconSet[args.icon] then return nil, "invalid_icon" end
    if not C.colorSet[args.color] then return nil, "invalid_color" end
    if type(args.duration) ~= "string" or C.durationSeconds[args.duration] == nil and args.duration ~= "permanent" then return nil, "invalid_duration" end
    return { category=args.category, title=title, note=note, icon=args.icon, color=args.color, duration=args.duration }, nil
end

local function expiration(duration, now)
    if duration == "permanent" then return nil end
    return now + C.durationSeconds[duration]
end

function Validation.validateRequestShape(command, args)
    local allowed = shapeKeys[command]
    if allowed == nil or not exactKeys(args, allowed) or not requestId(args.requestId) then return false, "invalid_request" end
    if command == "create" then
        if type(args.category) ~= "string" or type(args.title) ~= "string" or (args.note ~= nil and type(args.note) ~= "string") or type(args.icon) ~= "string" or type(args.color) ~= "string" or type(args.x) ~= "number" or type(args.y) ~= "number" or type(args.z) ~= "number" or type(args.duration) ~= "string" then return false, "invalid_request" end
    elseif command == "update" then
        if not safeString(args.id, 1, 128) or type(args.category) ~= "string" or type(args.title) ~= "string" or (args.note ~= nil and type(args.note) ~= "string") or type(args.icon) ~= "string" or type(args.color) ~= "string" or type(args.duration) ~= "string" then return false, "invalid_request" end
    elseif command == "remove" and not safeString(args.id, 1, 128) then return false, "invalid_request" end
    return true, nil
end

function Validation.normalizeCreate(args, now, limits)
    if not exactKeys(args, createKeys) or not finiteNumber(now) or markerLimit(limits) then return nil, markerLimit(limits) and "limit_reached" or "invalid_request" end
    local fields, reason = commonEditable(args, limits)
    if not fields then return nil, reason end
    if not coordinate(args.x, limits, "X") or not coordinate(args.y, limits, "Y") or not coordinate(args.z, limits, "Z") then return nil, "invalid_coordinates" end
    fields.x, fields.y, fields.z = args.x, args.y, args.z
    fields.expiresAt = expiration(fields.duration, now)
    fields.duration = nil
    return fields, nil
end

function Validation.normalizeUpdate(args, existing, now, limits)
    if not exactKeys(args, updateKeys) or type(existing) ~= "table" or not finiteNumber(now) then return nil, "invalid_request" end
    if not safeString(args.id, 1, 128) or args.id ~= existing.id then return nil, "invalid_request" end
    if existing.expiresAt ~= nil and (not finiteNumber(existing.expiresAt) or existing.expiresAt <= now) then return nil, "expired" end
    local fields, reason = commonEditable(args, limits)
    if not fields then return nil, reason end
    local result = {}
    for key, value in pairs(existing) do result[key] = value end
    for key, value in pairs(fields) do result[key] = value end
    result.expiresAt = expiration(fields.duration, now)
    result.duration = nil
    return result, nil
end

function Validation.isValidMarker(marker, now)
    local allowed = { id=true, category=true, title=true, note=true, icon=true, color=true, x=true, y=true, z=true, createdBy=true, createdAt=true, expiresAt=true, revision=true }
    if type(marker) ~= "table" or getmetatable(marker) ~= nil then return false, "invalid_request" end
    for key in pairs(marker) do if not allowed[key] then return false, "invalid_request" end end
    if not safeString(marker.id, 1, 128) or not safeString(marker.createdBy, 1, 128) or not finiteNumber(marker.createdAt) or not finiteInteger(marker.revision) then return false, "invalid_request" end
    if not C.categorySet[marker.category] then return false, "invalid_category" end
    if not C.iconSet[marker.icon] then return false, "invalid_icon" end
    if not C.colorSet[marker.color] then return false, "invalid_color" end
    if safeString(marker.title, 1, 80) == nil or safeString(marker.note or "", 0, 240) == nil then return false, "invalid_text" end
    if not coordinate(marker.x, nil, "X") or not coordinate(marker.y, nil, "Y") or not coordinate(marker.z, nil, "Z") then return false, "invalid_coordinates" end
    if marker.expiresAt ~= nil and (not finiteNumber(marker.expiresAt) or marker.expiresAt <= now) then return false, "expired" end
    return true, nil
end

_G.Validation = Validation
if SharedMapEnhancer == nil then SharedMapEnhancer = {} end
SharedMapEnhancer.Validation = Validation
