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

function loadProduction() {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);

  const script = `
    require = function() end
    CharacterTrait = { ILLITERATE = "Illiterate" }
    SkillBook = {
      Mechanics = { perk = "Mechanics" },
    }
    ISReadABook = {
      durationCalls = 0,
      getDuration = function(self)
        ISReadABook.durationCalls = ISReadABook.durationCalls + 1
        return 777
      end,
    }
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

test('skill-book duration is shortened only for eligible books', () => {
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
});
