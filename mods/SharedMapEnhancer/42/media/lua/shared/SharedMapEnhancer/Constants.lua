local Constants = {
    categories = { "Base", "Loot", "Danger", "Vehicle", "Medicine", "Fuel", "Expedition" },
    colors = { "white", "red", "orange", "yellow", "green", "cyan", "blue", "purple" },
    icons = { "House", "Target", "Skull", "SteeringWheel", "MedCross", "Fuel", "Tent", "Question", "Star", "Cross", "Exclamation" },
    durations = { "permanent", "1h", "8h", "24h", "7d" },
}

Constants.categorySet = {}
Constants.colorSet = {}
Constants.iconSet = {}
Constants.durationSeconds = { permanent = nil, ["1h"] = 3600, ["8h"] = 28800, ["24h"] = 86400, ["7d"] = 604800 }
for _, value in ipairs(Constants.categories) do Constants.categorySet[value] = true end
for _, value in ipairs(Constants.colors) do Constants.colorSet[value] = true end
for _, value in ipairs(Constants.icons) do Constants.iconSet[value] = true end

_G.Constants = Constants
if SharedMapEnhancer == nil then SharedMapEnhancer = {} end
SharedMapEnhancer.Constants = Constants
