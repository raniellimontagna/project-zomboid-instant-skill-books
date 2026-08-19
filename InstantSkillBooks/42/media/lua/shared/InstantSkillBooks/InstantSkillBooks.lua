require "TimedActions/ISReadABook"

InstantSkillBooks = InstantSkillBooks or {}

if not InstantSkillBooks._durationWrapped then
    local vanillaGetDuration = ISReadABook.getDuration

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

        local skillTrained = item:getSkillTrained()
        local skillBook = skillTrained and SkillBook and SkillBook[skillTrained]
        if not skillBook or not skillBook.perk then
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

    function ISReadABook:getDuration()
        local vanillaDuration = vanillaGetDuration(self)
        local eligibilityCheckSucceeded, eligible = pcall(InstantSkillBooks.isEligible, self)
        if not eligibilityCheckSucceeded then
            if isServer() then
                print("[InstantSkillBooks] eligibility check failed")
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
