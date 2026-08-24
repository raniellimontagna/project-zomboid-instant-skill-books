const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { lauxlib, lua, lualib, to_luastring } = require('fengari');

const repositoryRoot = path.resolve(__dirname, '../../..');
const smartStorageRoot = path.join(repositoryRoot, 'mods/SmartStorage');
const metadataPath = path.join(smartStorageRoot, '42/mod.info');
const readmePath = path.join(smartStorageRoot, 'README.md');
const settingsPath = path.join(
  smartStorageRoot,
  '42/media/lua/shared/SmartStorage/Settings.lua',
);
const protectionPath = path.join(
  smartStorageRoot,
  '42/media/lua/shared/SmartStorage/Protection.lua',
);
const sandboxOptionsPath = path.join(smartStorageRoot, '42/media/sandbox-options.txt');
const englishSandboxPath = path.join(
  smartStorageRoot,
  '42/media/lua/shared/Translate/EN/Sandbox.json',
);
const portugueseSandboxPath = path.join(
  smartStorageRoot,
  '42/media/lua/shared/Translate/PTBR/Sandbox.json',
);
const classifierPath = path.join(
  smartStorageRoot,
  '42/media/lua/shared/SmartStorage/Classifier.lua',
);

function readMetadata(filePath) {
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('=');
        assert.notEqual(separator, -1, `metadata line is key=value: ${line}`);
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

test('Smart Storage declares its exact independent Build 42 identity', () => {
  assert.equal(fs.existsSync(metadataPath), true, '42/mod.info exists');
  assert.deepEqual(readMetadata(metadataPath), {
    name: 'Smart Storage B42',
    id: 'SmartStorage',
    modversion: '0.1.0',
    pzversion: '42.20',
    versionMin: '42.20.0',
  });
});

test('Smart Storage documents that its Workshop item is created separately', () => {
  assert.equal(fs.existsSync(readmePath), true, 'Smart Storage README exists');
  const readme = fs.readFileSync(readmePath, 'utf8');
  assert.match(readme, /no Workshop manifest/i);
  assert.match(readme, /user creates its item/i);
});

test('Smart Storage test package can execute Fengari Lua fixtures', () => {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  assert.equal(
    lauxlib.luaL_loadstring(state, to_luastring('return 42')),
    lua.LUA_OK,
  );
  assert.equal(lua.lua_pcall(state, 0, 1, 0), lua.LUA_OK);
  assert.equal(lua.lua_tointeger(state, -1), 42);
  lua.lua_close(state);
});

function loadSmartStorage({ sandboxExpression = 'nil' } = {}) {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  const bootstrap = `
    SmartStorage = {}
    SandboxVars = { SmartStorage = ${sandboxExpression} }
  `;
  assert.equal(lauxlib.luaL_loadstring(state, to_luastring(bootstrap)), lua.LUA_OK);
  assert.equal(lua.lua_pcall(state, 0, 0, 0), lua.LUA_OK);

  for (const sourcePath of [settingsPath, classifierPath]) {
    assert.equal(
      lauxlib.luaL_loadstring(state, to_luastring(fs.readFileSync(sourcePath, 'utf8'))),
      lua.LUA_OK,
    );
    assert.equal(lua.lua_pcall(state, 0, 0, 0), lua.LUA_OK);
  }
  if (fs.existsSync(protectionPath)) {
    assert.equal(
      lauxlib.luaL_loadstring(state, to_luastring(fs.readFileSync(protectionPath, 'utf8'))),
      lua.LUA_OK,
    );
    assert.equal(lua.lua_pcall(state, 0, 0, 0), lua.LUA_OK);
  }
  return state;
}

function evaluateSmartStorage(script, resultCount, options = {}) {
  const state = loadSmartStorage(options);
  assert.equal(lauxlib.luaL_loadstring(state, to_luastring(script)), lua.LUA_OK);
  assert.equal(lua.lua_pcall(state, 0, resultCount, 0), lua.LUA_OK);
  const values = [];
  for (let index = resultCount; index >= 1; index -= 1) {
    values.push(lua.lua_type(state, -index) === lua.LUA_TBOOLEAN
      ? lua.lua_toboolean(state, -index)
      : lua.lua_type(state, -index) === lua.LUA_TNUMBER
        ? lua.lua_tonumber(state, -index)
        : lua.lua_type(state, -index) === lua.LUA_TSTRING
          ? String.fromCharCode(...lua.lua_tostring(state, -index))
          : null);
  }
  lua.lua_close(state);
  return values;
}

test('Smart Storage settings use safe defaults and parse comma lists', () => {
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    local parsed = SmartStorage.Settings.parseList(' Food, , Base.Wrench ,,Tools ')
    return settings.Food, settings.Tools, settings.Medicine, settings.Construction,
      settings.Weapons, settings.Ammo, settings.Clothing, settings.Literature,
      settings.Fuel, settings.Farming, settings.Fishing, settings.SearchRadius,
      settings.MaxItemsPerRequest, settings.LowConditionPercent,
      parsed.Food, parsed['Base.Wrench'], parsed.Tools, parsed[''] == nil
  `, 18);
  assert.deepEqual(values, [
    true, true, true, true, false, false, false, false, false, false, false,
    3, 200, 25, true, true, true, true,
  ]);
});

test('Smart Storage keeps item type allowlists separate from container type lists', () => {
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    return (settings.FoodItemTypes or {})['Base.CustomFood'],
      (settings.FoodContainerTypes or {}).crate,
      settings.FoodTypes == nil,
      (settings.FoodItemTypes or {})['crate'] == nil
  `, 4, {
    sandboxExpression: `{ FoodItemTypes = 'Base.CustomFood', FoodContainerTypes = 'crate' }`,
  });
  assert.deepEqual(values, [true, true, true, true]);
});

test('Smart Storage classifies exact vanilla categories, tags, and explicit full types', () => {
  const values = evaluateSmartStorage(`
    local defaults = SmartStorage.Settings.read()
    defaults.Weapons, defaults.Ammo, defaults.Farming = true, true, true
    local food = { getCategory = function() return 'Food' end }
    local weapon = { getCategory = function() return 'Weapon' end }
    local ammo = { hasTag = function(_, tag) return tag == 'AMMO' end }
    local seed = { hasTag = function(_, tag) return tag == 'IS_SEED' end }
    local foodAllowlist = {
      getFullType = function() return 'Base.CustomFood' end,
      getCategory = function() return 'Other' end,
    }
    local medicine = {
      getFullType = function() return 'Base.Pills' end,
      getCategory = function() return 'Other' end,
    }
    return SmartStorage.Classifier.classify(food, defaults),
      SmartStorage.Classifier.classify(weapon, defaults),
      SmartStorage.Classifier.classify(ammo, defaults),
      SmartStorage.Classifier.classify(seed, defaults),
      SmartStorage.Classifier.classify(foodAllowlist, defaults),
      SmartStorage.Classifier.classify(medicine, defaults)
  `, 6, {
    sandboxExpression: `{ FoodItemTypes = 'Base.CustomFood', MedicineItemTypes = 'Base.Pills' }`,
  });
  assert.deepEqual(values, ['Food', 'Weapons', 'Ammo', 'Farming', 'Food', 'Medicine']);
});

test('Smart Storage resolves overlaps by active CategoryPriority', () => {
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    settings.Ammo = true
    settings.CategoryPriority = { 'Ammo', 'Food' }
    local item = {
      getCategory = function() return 'Food' end,
      hasTag = function(_, tag) return tag == 'AMMO' end,
    }
    return SmartStorage.Classifier.matches(item, 'Food', settings),
      SmartStorage.Classifier.matches(item, 'Ammo', settings),
      SmartStorage.Classifier.classify(item, settings)
  `, 3);
  assert.deepEqual(values, [true, true, 'Ammo']);
});

test('Smart Storage disables categories and fails closed for unknown or malformed items/settings', () => {
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    local unknown = { getCategory = function() return 'Mystery' end }
    local malformed = { Food = true, CategoryPriority = 'Food' }
    local ok, result = pcall(function()
      return SmartStorage.Classifier.classify(unknown, malformed)
    end)
    local weapon = { getCategory = function() return 'Weapon' end }
    return SmartStorage.Classifier.classify(weapon, settings) == nil,
      SmartStorage.Classifier.classify(unknown, settings) == nil,
      ok, result == nil,
      SmartStorage.Classifier.matches(weapon, 'Weapons', malformed)
  `, 5);
  assert.deepEqual(values, [true, true, true, true, false]);
});

test('Smart Storage classifier fails closed for hostile settings metamethods', () => {
  const values = evaluateSmartStorage(`
    local item = { getCategory = function() return 'Food' end }
    local hostile = setmetatable({}, {
      __index = function() error('settings lookup unavailable') end,
      __len = function() error('settings length unavailable') end,
    })
    local ok, result = pcall(function()
      return SmartStorage.Classifier.classify(item, hostile)
    end)
    return ok, result == nil
  `, 2);
  assert.deepEqual(values, [true, true]);
});

test('Smart Storage never classifies from display names', () => {
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    local item = {
      getCategory = function() return 'Other' end,
      getDisplayName = function() return 'Fresh Apple' end,
    }
    return SmartStorage.Classifier.classify(item, settings) == nil,
      SmartStorage.Classifier.matches(item, 'Food', settings)
  `, 2);
  assert.deepEqual(values, [true, false]);
});

test('Smart Storage registers every Build 42 sandbox option with safe defaults', () => {
  assert.equal(fs.existsSync(sandboxOptionsPath), true, 'sandbox-options.txt exists');
  const options = fs.readFileSync(sandboxOptionsPath, 'utf8');
  assert.match(options, /^VERSION\s*=\s*1\s*,/m);

  const defaults = {
    Food: true,
    Tools: true,
    Medicine: true,
    Construction: true,
    Weapons: false,
    Ammo: false,
    Clothing: false,
    Literature: false,
    Fuel: false,
    Farming: false,
    Fishing: false,
  };
  for (const [category, value] of Object.entries(defaults)) {
    assert.match(
      options,
      new RegExp(`option SmartStorage\\.${category} \\{ type = boolean, default = ${value},`),
    );
    assert.match(options, new RegExp(`option SmartStorage\\.${category}ItemTypes \\{ type = string, default = "",`));
    assert.match(options, new RegExp(`option SmartStorage\\.${category}ContainerTypes \\{ type = string, default = "",`));
  }

  assert.match(options, /option SmartStorage\.SearchRadius \{ type = integer, default = 3,/);
  assert.match(options, /option SmartStorage\.MaxItemsPerRequest \{ type = integer, default = 200,/);
  assert.match(options, /option SmartStorage\.LowConditionPercent \{ type = integer, default = 25,/);
  assert.match(options, /option SmartStorage\.CategoryPriority \{ type = string,/);
  assert.match(
    options,
    /option SmartStorage\.CategoryPriority \{ type = string, default = "Food,Tools,Medicine,Construction,Weapons,Ammo,Clothing,Literature,Fuel,Farming,Fishing",/
  );
});

test('Smart Storage provides English and Brazilian Portuguese sandbox labels and tooltips', () => {
  for (const translationPath of [englishSandboxPath, portugueseSandboxPath]) {
    assert.equal(fs.existsSync(translationPath), true, `${translationPath} exists`);
    const translations = JSON.parse(fs.readFileSync(translationPath, 'utf8'));
    assert.equal(typeof translations.Sandbox_SmartStorage, 'string');
    for (const option of [
      'Food', 'Tools', 'Medicine', 'Construction', 'Weapons', 'Ammo', 'Clothing',
      'Literature', 'Fuel', 'Farming', 'Fishing', 'SearchRadius', 'MaxItemsPerRequest',
      'LowConditionPercent', 'CategoryPriority',
      'FoodItemTypes', 'ToolsItemTypes', 'MedicineItemTypes', 'ConstructionItemTypes',
      'WeaponsItemTypes', 'AmmoItemTypes', 'ClothingItemTypes', 'LiteratureItemTypes',
      'FuelItemTypes', 'FarmingItemTypes', 'FishingItemTypes',
      'FoodContainerTypes', 'ToolsContainerTypes', 'MedicineContainerTypes',
      'ConstructionContainerTypes', 'WeaponsContainerTypes', 'AmmoContainerTypes',
      'ClothingContainerTypes', 'LiteratureContainerTypes', 'FuelContainerTypes',
      'FarmingContainerTypes', 'FishingContainerTypes',
    ]) {
      assert.equal(typeof translations[`Sandbox_SmartStorage_${option}`], 'string');
      assert.equal(typeof translations[`Sandbox_SmartStorage_${option}_tooltip`], 'string');
    }
  }
});

test('Smart Storage protects unsafe items and allows a valid item', () => {
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    local character = {}
    local function base()
      return {
        getFullType = function() return 'Base.TestItem' end,
        getCategory = function() return 'Food' end,
        getCondition = function() return 100 end,
        getConditionMax = function() return 100 end,
      }
    end
    local equipped = base()
    equipped.isEquipped = function() return true end
    local worn = base()
    worn.isWorn = function() return true end
    local favorite = base()
    favorite.isFavorite = function() return true end
    local broken = base()
    broken.isBroken = function() return true end
    broken.getCondition = function() return 100 end
    local low = base()
    low.getCondition = function() return 25 end
    local filled = base()
    filled.getInventory = function()
      return { getItems = function() return { size = function() return 1 end } end }
    end
    local unknown = { getCategory = function() return 'Mystery' end }
    local valid = base()
    local function check(item)
      if SmartStorage.Protection == nil or SmartStorage.Protection.check == nil then
        return nil
      end
      return SmartStorage.Protection.check(item, character, settings)
    end
    local equippedAllowed, equippedReason = check(equipped)
    local wornAllowed, wornReason = check(worn)
    local favoriteAllowed, favoriteReason = check(favorite)
    local brokenAllowed, brokenReason = check(broken)
    local lowAllowed, lowReason = check(low)
    local filledAllowed, filledReasonValue = check(filled)
    local unknownAllowed, unknownReason = check(unknown)
    local validAllowed, validReason = check(valid)
    return equippedAllowed, equippedReason, wornAllowed, wornReason,
      favoriteAllowed, favoriteReason, brokenAllowed, brokenReason,
      lowAllowed, lowReason, filledAllowed, filledReasonValue,
      unknownAllowed, unknownReason, validAllowed, validReason
  `, 16);
  assert.deepEqual(values, [
    false, 'equipped', false, 'worn', false, 'favorite', false, 'low_condition',
    false, 'low_condition', false, 'filled_container', false, 'invalid', true, null,
  ]);
});

test('Smart Storage does not match an unknown full type with default settings', () => {
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    local unknown = {
      getFullType = function() return 'Base.UnknownDefaultItem' end,
      getCategory = function() return 'Other' end,
    }
    return SmartStorage.Classifier.classify(unknown, settings) == nil,
      (settings.FoodItemTypes or {})['Base.UnknownDefaultItem'] == nil,
      (settings.FoodContainerTypes or {})['Base.UnknownDefaultItem'] == nil
  `, 3);
  assert.deepEqual(values, [true, true, true]);
});
