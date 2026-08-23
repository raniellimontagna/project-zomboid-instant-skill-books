const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  lauxlib,
  lua,
  lualib,
  to_luastring,
} = require('fengari');

const productionPath = path.resolve(
  __dirname,
  '../../../InstantSkillBooks/42/media/lua/shared/InstantSkillBooks/InstantSkillBooks.lua',
);
const metadataPath = path.resolve(
  __dirname,
  '../../../InstantSkillBooks/42/mod.info',
);

function encodeLuaBoolean(value) {
  return value === undefined ? 'nil' : value ? 'true' : 'false';
}

function encodeInstantLearning(settings) {
  if (settings === undefined) {
    return '{}';
  }

  return `{ InstantSkillBooks = ${encodeLuaBoolean(settings.InstantSkillBooks)}, InstantRecipeMagazines = ${encodeLuaBoolean(settings.InstantRecipeMagazines)}, InstantTechnicalManuals = ${encodeLuaBoolean(settings.InstantTechnicalManuals)}, InstantEducationalVHS = ${encodeLuaBoolean(settings.InstantEducationalVHS)} }`;
}

function loadProduction({ server = false, instantLearning } = {}) {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);

  const script = `
    require = function() end
    CharacterTrait = { ILLITERATE = "Illiterate" }
    SkillBook = {
      Mechanics = { perk = "Mechanics" },
    }
    SandboxVars = {
      InstantLearning = ${instantLearning === null ? 'nil' : encodeInstantLearning(instantLearning)},
    }
    ISReadABook = {
      durationCalls = 0,
      getDuration = function(self)
        ISReadABook.durationCalls = ISReadABook.durationCalls + 1
        return 777
      end,
    }
    diagnostics = {}
    isServer = function() return ${server} end
    print = function(message) table.insert(diagnostics, message) end
  `;

  const status = lauxlib.luaL_loadstring(state, to_luastring(script));
  assert.equal(status, lua.LUA_OK);
  assert.equal(lua.lua_pcall(state, 0, 0, 0), lua.LUA_OK);

  const source = fs.readFileSync(productionPath, 'utf8');
  assert.equal(
    lauxlib.luaL_loadstring(state, to_luastring(source)),
    lua.LUA_OK,
  );
  assert.equal(lua.lua_pcall(state, 0, 0, 0), lua.LUA_OK);
  return state;
}

function evaluateV2Case({ category, settings }) {
  const state = loadProduction({ instantLearning: settings });
  const itemScript = {
    skill: `
      getNumberOfPages = function() return 100 end,
      getSkillTrained = function() return "Mechanics" end,
      getLvlSkillTrained = function() return 1 end,
      getMaxLevelTrained = function() return 3 end,
    `,
    recipe: `
      getNumberOfPages = function() return 100 end,
      getLearnedRecipes = function()
        return { isEmpty = function() return false end }
      end,
    `,
    ordinary: `
      getNumberOfPages = function() return 100 end,
    `,
    manualVhs: `
      getNumberOfPages = function() return 100 end,
      getMediaType = function() return "VHS" end,
      getSkillTrained = function() return nil end,
    `,
    learnedRecipesMissing: `
      getNumberOfPages = function() return 100 end,
    `,
    learnedRecipesEmpty: `
      getNumberOfPages = function() return 100 end,
      getLearnedRecipes = function()
        return { isEmpty = function() return true end }
      end,
    `,
  }[category];
  assert.ok(itemScript, `unknown v2 category: ${category}`);

  const script = `
    local item = { ${itemScript} }
    local character = {
      getPerkLevel = function() return 0 end,
      hasTrait = function() return false end,
    }
    local action = { item = item, character = character }
    local duration = ISReadABook.getDuration(action)
    return duration, ISReadABook.durationCalls
  `;

  const status = lauxlib.luaL_loadstring(state, to_luastring(script));
  assert.equal(status, lua.LUA_OK);
  assert.equal(lua.lua_pcall(state, 0, 2, 0), lua.LUA_OK);
  const duration = lua.lua_tointeger(state, -2);
  const durationCalls = lua.lua_tointeger(state, -1);
  lua.lua_pop(state, 2);
  return { duration, durationCalls };
}

function evaluateEligibilityFailure(server) {
  const state = loadProduction({ server });
  const script = `
    local item = {
      getNumberOfPages = function()
        error("skill-book metadata unavailable")
      end,
    }
    local action = {
      item = item,
      character = {},
      readingProgress = 25,
    }
    local duration = ISReadABook.getDuration(action)
    return duration,
      ISReadABook.durationCalls,
      action.readingProgress,
      #diagnostics,
      diagnostics[1] == "[InstantSkillBooks] eligibility check failed"
  `;

  const status = lauxlib.luaL_loadstring(state, to_luastring(script));
  assert.equal(status, lua.LUA_OK);
  assert.equal(lua.lua_pcall(state, 0, 5, 0), lua.LUA_OK);
  const result = {
    duration: lua.lua_tointeger(state, -5),
    durationCalls: lua.lua_tointeger(state, -4),
    readingProgress: lua.lua_tointeger(state, -3),
    diagnosticCount: lua.lua_tointeger(state, -2),
    hasNamespacedDiagnostic: lua.lua_toboolean(state, -1),
  };
  lua.lua_pop(state, 5);
  return result;
}

function evaluateCase(input) {
  const state = loadProduction();
  const skill = input.skill === null ? 'nil' : JSON.stringify(input.skill);
  const encoded = `{ hasItem = ${input.hasItem}, pages = ${input.pages}, skill = ${skill}, level = ${input.level}, maxLevel = ${input.maxLevel}, perkLevel = ${input.perkLevel}, illiterate = ${input.illiterate} }`;
  const script = `
    local input = ${encoded}
    local item
    if input.hasItem then
      item = {
        getNumberOfPages = function() return input.pages end,
        getSkillTrained = function() return input.skill end,
        getLvlSkillTrained = function() return input.level end,
        getMaxLevelTrained = function() return input.maxLevel end,
      }
    end
    local character = {
      getPerkLevel = function() return input.perkLevel end,
      hasTrait = function(_, trait)
        return input.illiterate and trait == CharacterTrait.ILLITERATE
      end,
    }
    local action = {
      item = item,
      character = character,
    }
    local duration = ISReadABook.getDuration(action)
    return duration, ISReadABook.durationCalls
  `;

  const status = lauxlib.luaL_loadstring(state, to_luastring(script));
  assert.equal(status, lua.LUA_OK);
  assert.equal(lua.lua_pcall(state, 0, 2, 0), lua.LUA_OK);
  const duration = lua.lua_tointeger(state, -2);
  const durationCalls = lua.lua_tointeger(state, -1);
  lua.lua_pop(state, 2);
  return { duration, durationCalls };
}

test('duration wrapper shortens only eligible books and fails closed on eligibility API errors', () => {
  const cases = [
    ['eligible skill book', { hasItem: true, pages: 100, skill: 'Mechanics', level: 1, maxLevel: 3, perkLevel: 0, illiterate: false }, 1],
    ['ordinary literature', { hasItem: true, pages: 100, skill: null, level: 0, maxLevel: 0, perkLevel: 0, illiterate: false }, 777],
    ['zero-page literature', { hasItem: true, pages: 0, skill: 'Mechanics', level: 1, maxLevel: 3, perkLevel: 0, illiterate: false }, 777],
    ['skill book too advanced', { hasItem: true, pages: 100, skill: 'Mechanics', level: 4, maxLevel: 5, perkLevel: 0, illiterate: false }, 777],
    ['skill book obsolete', { hasItem: true, pages: 100, skill: 'Mechanics', level: 1, maxLevel: 0, perkLevel: 3, illiterate: false }, 777],
    ['Illiterate character', { hasItem: true, pages: 100, skill: 'Mechanics', level: 1, maxLevel: 3, perkLevel: 0, illiterate: true }, 777],
    ['missing item', { hasItem: false, pages: 0, skill: null, level: 0, maxLevel: 0, perkLevel: 0, illiterate: false }, 777],
  ];

  for (const [name, input, expectedDuration] of cases) {
    const result = evaluateCase(input);
    assert.equal(result.duration, expectedDuration, name);
    assert.equal(result.durationCalls, 1, `${name}: vanilla duration call count`);
  }

  const serverResult = evaluateEligibilityFailure(true);
  assert.equal(serverResult.duration, 777);
  assert.equal(serverResult.durationCalls, 1);
  assert.equal(serverResult.readingProgress, 25);
  assert.equal(serverResult.diagnosticCount, 1);
  assert.equal(serverResult.hasNamespacedDiagnostic, true);

  const clientResult = evaluateEligibilityFailure(false);
  assert.equal(clientResult.duration, 777);
  assert.equal(clientResult.durationCalls, 1);
  assert.equal(clientResult.readingProgress, 25);
  assert.equal(clientResult.diagnosticCount, 0);
});

test('v2 options and capability categories control instant reading', () => {
  assert.equal(
    evaluateV2Case({ category: 'skill', settings: { InstantSkillBooks: true } }).duration,
    1,
    'skill book + skill option true',
  );
  assert.equal(
    evaluateV2Case({ category: 'skill', settings: { InstantSkillBooks: false } }).duration,
    777,
    'skill book + skill option false',
  );
  assert.equal(
    evaluateV2Case({ category: 'recipe', settings: { InstantRecipeMagazines: true } }).duration,
    1,
    'recipe magazine + recipe option true',
  );
  assert.equal(
    evaluateV2Case({ category: 'recipe', settings: { InstantRecipeMagazines: false } }).duration,
    777,
    'recipe magazine + recipe option false',
  );
  assert.equal(
    evaluateV2Case({
      category: 'ordinary',
      settings: {
        InstantSkillBooks: true,
        InstantRecipeMagazines: true,
        InstantTechnicalManuals: true,
        InstantEducationalVHS: true,
      },
    }).duration,
    777,
    'ordinary literature + all options',
  );
  assert.equal(
    evaluateV2Case({
      category: 'manualVhs',
      settings: {
        InstantSkillBooks: true,
        InstantRecipeMagazines: true,
        InstantTechnicalManuals: true,
        InstantEducationalVHS: true,
      },
    }).duration,
    777,
    'manual/VHS-shaped item + options true',
  );

  const missingSettingsSkill = evaluateV2Case({ category: 'skill', settings: null });
  assert.equal(missingSettingsSkill.duration, 1, 'missing settings: skill books enabled');
  const missingSettingsRecipe = evaluateV2Case({ category: 'recipe', settings: null });
  assert.equal(missingSettingsRecipe.duration, 777, 'missing settings: recipes disabled');
  assert.equal(
    evaluateV2Case({ category: 'learnedRecipesMissing', settings: { InstantRecipeMagazines: true } }).duration,
    777,
    'learnedRecipes missing',
  );
  assert.equal(
    evaluateV2Case({ category: 'learnedRecipesEmpty', settings: { InstantRecipeMagazines: true } }).duration,
    777,
    'learnedRecipes empty',
  );

  for (const category of [
    'skill',
    'recipe',
    'ordinary',
    'manualVhs',
    'learnedRecipesMissing',
    'learnedRecipesEmpty',
  ]) {
    const result = evaluateV2Case({
      category,
      settings: {
        InstantSkillBooks: true,
        InstantRecipeMagazines: true,
        InstantTechnicalManuals: true,
        InstantEducationalVHS: true,
      },
    });
    assert.equal(result.durationCalls, 1, `${category}: vanilla duration call count`);
  }
});

test('Build 42 package includes required metadata and shared entry point', () => {
  assert.equal(fs.existsSync(metadataPath), true, '42/mod.info exists');
  const metadata = Object.fromEntries(
    fs
      .readFileSync(metadataPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        assert.notEqual(separator, -1, `metadata line is key=value: ${line}`);
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );

  assert.equal(metadata.id, 'InstantSkillBooks');
  assert.equal(metadata.pzversion, '42.20');
  assert.equal(metadata.versionMin, '42.20.0');
  assert.equal(typeof metadata.name, 'string');
  assert.notEqual(metadata.name.trim(), '');
  assert.equal(fs.existsSync(productionPath), true, 'shared Lua entry point exists');
});
