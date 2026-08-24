require "TimedActions/ISReadABook"

InstantSkillBooks = InstantSkillBooks or {}

if not InstantSkillBooks._durationWrapped then
    local vanillaGetDuration = ISReadABook.getDuration

    local function getInstantLearningOption(name, defaultValue)
        local settings = SandboxVars and SandboxVars.InstantLearning
        if type(settings) ~= "table" then
            return defaultValue
        end

        local value = settings[name]
        if value == true or value == false then
            return value
        end
        return defaultValue
    end

    function InstantSkillBooks.isEligible(action)
        if not action or not action.item or not action.character then
            return false
        end

        local item = action.item
        local character = action.character
        local pages = item:getNumberOfPages()
        if not pages or pages <= 0 then
            return false
        end

        local skillTrained = item.getSkillTrained and item:getSkillTrained()
        local skillBook = skillTrained and SkillBook and SkillBook[skillTrained]
        if skillBook and skillBook.perk then
            if not getInstantLearningOption("InstantSkillBooks", true) then
                return false
            end

            if character:hasTrait(CharacterTrait.ILLITERATE) then
                return false
            end

            local currentLevel = character:getPerkLevel(skillBook.perk)
            local trainedLevel = item:getLvlSkillTrained()
            local maxLevelTrained = item:getMaxLevelTrained()
            if currentLevel == nil or trainedLevel == nil or maxLevelTrained == nil then
                return false
            end

            local nextLevel = currentLevel + 1
            if trainedLevel > nextLevel or maxLevelTrained < nextLevel then
                return false
            end

            return true
        end

        if not getInstantLearningOption("InstantRecipeMagazines", false) then
            return false
        end

        if not item.getLearnedRecipes then
            return false
        end

        local learnedRecipes = item:getLearnedRecipes()
        if not learnedRecipes or not learnedRecipes.isEmpty then
            return false
        end

        return not learnedRecipes:isEmpty()
    end

    function ISReadABook:getDuration()
        local vanillaDuration = vanillaGetDuration(self)
        local eligibilityCheckSucceeded, eligible = pcall(InstantSkillBooks.isEligible, self)
        if not eligibilityCheckSucceeded then
            if isServer() then
                print("[InstantLearning] eligibility check failed")
            end
            return vanillaDuration
        end
        if eligible then
            return 1
        end
        return vanillaDuration
    end

    InstantSkillBooks._durationWrapped = true
end
