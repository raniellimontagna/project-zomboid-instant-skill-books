SmartStorage = SmartStorage or {}

local Selection = {}

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

local function number(value)
    return type(value) == "number" and value == value and value ~= math.huge and value ~= -math.huge
end

local function candidateContainer(candidate)
    if type(candidate) ~= "table" then
        return nil
    end
    if type(candidate.container) == "table" or type(candidate.container) == "userdata" then
        return candidate.container
    end
    return nil
end

local function candidateNumber(candidate, key)
    local value = candidate[key]
    if number(value) then
        return value
    end
    return nil
end

local function isAccessible(candidate, container, character)
    if candidate.accessible ~= nil then
        return candidate.accessible == true
    end
    local ok, value = call(candidate, "isAccessible", character)
    if ok and type(value) == "boolean" then
        return value
    end
    ok, value = call(container, "isAccessible", character)
    return ok and value == true
end

local function hasCapacity(candidate, container)
    if candidate.hasCapacity ~= nil then
        return candidate.hasCapacity == true
    end
    local ok, capacity = call(container, "getCapacity")
    if not ok or not number(capacity) or capacity <= 0 then
        return false
    end
    ok, value = call(container, "getContentsWeight")
    if not ok or not number(value) then
        return false
    end
    return value < capacity
end

local function compatible(candidate, category, settings, character)
    local container = candidateContainer(candidate)
    if container == nil or type(settings) ~= "table" or type(category) ~= "string" then
        return nil
    end
    local types = settings[category .. "ContainerTypes"]
    if type(types) ~= "table" then
        return nil
    end
    local ok, typeName = call(container, "getType")
    if not ok or type(typeName) ~= "string" or types[typeName] ~= true then
        return nil
    end
    local distance = candidateNumber(candidate, "distance")
    local x, y, z = candidateNumber(candidate, "x"), candidateNumber(candidate, "y"), candidateNumber(candidate, "z")
    if distance == nil or x == nil or y == nil or z == nil then
        return nil
    end
    if type(settings.SearchRadius) ~= "number" or settings.SearchRadius < 0 or distance > settings.SearchRadius then
        return nil
    end
    if not isAccessible(candidate, container, character) or not hasCapacity(candidate, container) then
        return nil
    end
    return { container = container, distance = distance, x = x, y = y, z = z }
end

local function before(left, right)
    if left.distance ~= right.distance then return left.distance < right.distance end
    if left.x ~= right.x then return left.x < right.x end
    if left.y ~= right.y then return left.y < right.y end
    return left.z < right.z
end

function Selection.choose(candidates, category, settings, character)
    if type(candidates) ~= "table" then
        return nil
    end
    local selected = nil
    for index = 1, #candidates do
        local valid = compatible(candidates[index], category, settings, character)
        if valid ~= nil and (selected == nil or before(valid, selected)) then
            selected = valid
        end
    end
    return selected and selected.container or nil
end

SmartStorage.Selection = Selection
