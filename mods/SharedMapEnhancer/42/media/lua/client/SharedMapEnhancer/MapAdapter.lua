local MapAdapter = {}
local unpackCompat = (table and table.unpack) or unpack

local COLORS = {
    white = { 1, 1, 1, 1 }, red = { 1, 0, 0, 1 }, orange = { 1, 0.5, 0, 1 },
    yellow = { 1, 1, 0, 1 }, green = { 0, 1, 0, 1 }, cyan = { 0, 1, 1, 1 },
    blue = { 0, 0, 1, 1 }, purple = { 0.5, 0, 1, 1 },
}

local function call(object, method, ...)
    if object == nil or type(object[method]) ~= "function" then return false, nil end
    local args = { ... }
    local ok, result = pcall(function() return object[method](object, unpackCompat(args)) end)
    if ok then return true, result end
    local directOk, directResult = pcall(object[method], unpackCompat(args))
    return directOk, directResult
end

local function symbolsFor(mapUI)
    if type(mapUI) ~= "table" then return nil end
    if type(mapUI.symbolsAPI) == "table" then return mapUI.symbolsAPI end
    local java = mapUI.javaObject
    if java ~= nil then
        local ok, api = call(java, "getAPIv3")
        if ok and api ~= nil then
            local symbolsOk, symbols = call(api, "getSymbolsAPIv2")
            if symbolsOk and symbols ~= nil then return symbols end
        end
    end
    local ok, symbols = call(mapUI, "getSymbolsAPIv2")
    if ok then return symbols end
    return nil
end

local function safeMethod(symbol, method, ...)
    if symbol == nil or type(symbol[method]) ~= "function" then return end
    local args = { ... }
    pcall(function() symbol[method](symbol, unpackCompat(args)) end)
end

function MapAdapter.attach(mapUI)
    local symbolsAPI = symbolsFor(mapUI)
    if symbolsAPI == nil or type(symbolsAPI.addTexture) ~= "function" or type(symbolsAPI.removeSymbol) ~= "function" then return nil end
    return { mapUI = mapUI, symbolsAPI = symbolsAPI, ownedSymbols = {}, namespace = "SharedMapEnhancer" }
end

function MapAdapter.clearOwnedSymbols(adapter)
    if type(adapter) ~= "table" or adapter.symbolsAPI == nil then return false end
    for id, symbol in pairs(adapter.ownedSymbols or {}) do
        if symbol ~= nil then call(adapter.symbolsAPI, "removeSymbol", symbol) end
        adapter.ownedSymbols[id] = nil
    end
    return true
end

local function allowed(marker, filters)
    if type(filters) ~= "table" then return true end
    if filters[marker.category] == false then return false end
    if type(filters.categories) == "table" and filters.categories[marker.category] == false then return false end
    return true
end

local function addTexture(api, icon, x, y)
    local ok, symbol = call(api, "addTexture", icon, x, y)
    if ok and symbol ~= nil then return symbol end
    if icon ~= "Question" then
        local fallbackOk, fallback = call(api, "addTexture", "Question", x, y)
        if fallbackOk and fallback ~= nil then return fallback end
    end
    return nil
end

function MapAdapter.rebuild(adapter, markers, filters)
    if type(adapter) ~= "table" or adapter.symbolsAPI == nil or type(adapter.symbolsAPI.addTexture) ~= "function" then return false end
    MapAdapter.clearOwnedSymbols(adapter)
    if type(markers) ~= "table" then return true end
    for _, marker in pairs(markers) do
        if type(marker) == "table" and type(marker.id) == "string" and allowed(marker, filters) then
            local symbol = addTexture(adapter.symbolsAPI, marker.icon, marker.x, marker.y)
            if symbol ~= nil then
                adapter.ownedSymbols[marker.id] = symbol
                local color = COLORS[marker.color] or COLORS.white
                safeMethod(symbol, "setRGBA", color[1], color[2], color[3], color[4])
                safeMethod(symbol, "setAnchor", 0.5, 1.0)
                safeMethod(symbol, "setScale", 1.0)
                if type(marker.title) == "string" then safeMethod(symbol, "setText", marker.title) end
            end
        end
    end
    return true
end

MapAdapter.colors = COLORS
_G.MapAdapter = MapAdapter
if SharedMapEnhancer == nil then SharedMapEnhancer = {} end
SharedMapEnhancer.MapAdapter = MapAdapter
