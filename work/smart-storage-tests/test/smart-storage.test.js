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
const selectionPath = path.join(
  smartStorageRoot,
  '42/media/lua/shared/SmartStorage/Selection.lua',
);
const transferPath = path.join(
  smartStorageRoot,
  '42/media/lua/server/SmartStorage/Transfer.lua',
);
const serverPath = path.join(
  smartStorageRoot,
  '42/media/lua/server/SmartStorage/Server.lua',
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

function loadSmartStorage({ sandboxExpression = 'nil', modules = [], bootstrap: extraBootstrap = '' } = {}) {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  const bootstrap = `
    SmartStorage = {}
    SandboxVars = { SmartStorage = ${sandboxExpression} }
    ${extraBootstrap}
  `;
  assert.equal(lauxlib.luaL_loadstring(state, to_luastring(bootstrap)), lua.LUA_OK);
  assert.equal(lua.lua_pcall(state, 0, 0, 0), lua.LUA_OK);

  const sourcePaths = [settingsPath, classifierPath];
  if (modules.includes('selection')) sourcePaths.push(selectionPath);
  if (modules.includes('transfer')) sourcePaths.push(transferPath);
  if (modules.includes('server')) sourcePaths.push(serverPath);
  for (const sourcePath of sourcePaths) {
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
  const status = lua.lua_pcall(state, 0, resultCount, 0);
  assert.equal(status, lua.LUA_OK, status === lua.LUA_OK
    ? undefined
    : String.fromCharCode(...lua.lua_tostring(state, -1)));
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

test('Smart Storage selects the nearest compatible accessible destination deterministically', () => {
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    settings.FoodContainerTypes = { crate = true }
    local function container(typeName, capacity, used, access)
      return {
        getType = function() return typeName end,
        getCapacity = function() return capacity end,
        getContentsWeight = function() return used end,
        isAccessible = function() return access end,
      }
    end
    local a = container('crate', 10, 0, true)
    local b = container('crate', 10, 0, true)
    local rejectedType = container('counter', 10, 0, true)
    local rejectedCapacity = container('crate', 1, 1, true)
    local rejectedAccess = container('crate', 10, 0, false)
    local selected = SmartStorage.Selection.choose({
      { container = rejectedType, x = 0, y = 0, z = 0, distance = 0 },
      { container = rejectedCapacity, x = 0, y = 0, z = 0, distance = 0 },
      { container = rejectedAccess, x = 0, y = 0, z = 0, distance = 0 },
      { container = b, x = 2, y = 1, z = 0, distance = 2 },
      { container = a, x = 1, y = 2, z = 0, distance = 2 },
    }, 'Food', settings, {})
    return selected == a
  `, 1, { modules: ['selection'] });
  assert.deepEqual(values, [true]);
});

test('Smart Storage rejects destinations outside the configured radius and breaks equal distances by x y z', () => {
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    settings.SearchRadius = 3
    settings.FoodContainerTypes = { crate = true }
    local function c() return {
      getType = function() return 'crate' end,
      getCapacity = function() return 10 end,
      getContentsWeight = function() return 0 end,
      isAccessible = function() return true end,
    } end
    local first, second, third, outside = c(), c(), c(), c()
    local selected = SmartStorage.Selection.choose({
      { container = outside, x = 4, y = 0, z = 0, distance = 4 },
      { container = third, x = 1, y = 0, z = 1, distance = 2 },
      { container = second, x = 1, y = 1, z = 0, distance = 2 },
      { container = first, x = 1, y = 0, z = 0, distance = 2 },
    }, 'Food', settings, {})
    return selected == first
  `, 1, { modules: ['selection'] });
  assert.deepEqual(values, [true]);
});

test('Smart Storage validates request shape, rate limits, max items, duplicate IDs, and client item IDs', () => {
  const values = evaluateSmartStorage(`
    local player = {}
    local valid, validReason = SmartStorage.Server.validateRequest(player, { category = 'Food', requestId = 'request-1' }, 100)
    local rate, rateReason = SmartStorage.Server.validateRequest(player, { category = 'Food', requestId = 'request-2' }, 100)
    local duplicate, duplicateReason = SmartStorage.Server.validateRequest(player, { category = 'Food', requestId = 'request-1' }, 102)
    local hostile, hostileReason = SmartStorage.Server.validateRequest(player, { category = 'Food', requestId = 'request-3', itemIds = { 7 } }, 102)
    local tooMany, tooManyReason = SmartStorage.Server.validateRequest({}, {
      category = 'Food', requestId = 'request-4', maxItems = 201,
    }, 100)
    local disabled, disabledReason = SmartStorage.Server.validateRequest({}, { category = 'Weapons', requestId = 'request-5' }, 100)
    return valid ~= nil, validReason == nil,
      rate == nil, rateReason,
      duplicate == nil, duplicateReason,
      hostile == nil, hostileReason,
      tooMany == nil, tooManyReason,
      disabled == nil, disabledReason
  `, 12, { modules: ['server'] });
  assert.deepEqual(values, [
    true, true, true, 'rate_limited', true, 'duplicate', true, 'client_item_ids',
    true, 'invalid_request', true, 'disabled_category',
  ]);
});

test('Smart Storage revalidates each transfer and returns deterministic outcome counts', () => {
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    settings.FoodContainerTypes = { crate = true }
    local sourceItems = {}
    local source = {
      getItems = function() return sourceItems end,
      Remove = function(_, item)
        for index = 1, #sourceItems do
          if sourceItems[index] == item then table.remove(sourceItems, index); return true end
        end
        return false
      end,
      AddItem = function(_, item) sourceItems[#sourceItems + 1] = item; return item end,
    }
    local destinationItems = {}
    local destination = {
      getType = function() return 'crate' end,
      getCapacity = function() return 10 end,
      getContentsWeight = function() return #destinationItems end,
      isAccessible = function() return true end,
      hasRoomFor = function() return true end,
      getItems = function() return destinationItems end,
      AddItem = function(_, item) destinationItems[#destinationItems + 1] = item; return item end,
      Remove = function(_, item)
        for index = 1, #destinationItems do
          if destinationItems[index] == item then table.remove(destinationItems, index); return true end
        end
        return false
      end,
    }
    local function item(category, favorite)
      local result = {
        getCategory = function() return category end,
        getCondition = function() return 100 end,
        getConditionMax = function() return 100 end,
        isFavorite = function() return favorite end,
        getContainer = function() return source end,
      }
      sourceItems[#sourceItems + 1] = result
      return result
    end
    local allowed = item('Food', false)
    local protected = item('Food', true)
    local mismatched = item('Weapon', false)
    local summary = SmartStorage.Transfer.deposit({}, {
      category = 'Food', settings = settings, items = { allowed, protected, mismatched },
      candidates = { { container = destination, x = 0, y = 0, z = 0, distance = 0 } },
      requestId = 'transfer-1',
    })
    return summary.moved, summary.protected, summary.noDestination, summary.failed,
      #destinationItems, sourceItems[1] == protected
  `, 6, { modules: ['selection', 'transfer'] });
  assert.deepEqual(values, [1, 1, 0, 1, 1, true]);
});

test('Smart Storage server handler only moves player-owned bag items and caps each request', () => {
  const values = evaluateSmartStorage(`
    local rootItems, bagItems, destinationItems = {}, {}, {}
    local source = { getItems = function() return rootItems end }
    local bag = { getItems = function() return bagItems end }
    local food = {
      getCategory = function() return 'Food' end,
      getCondition = function() return 100 end,
      getConditionMax = function() return 100 end,
      getContainer = function() return bag end,
    }
    local bagItem = { getCategory = function() return 'Other' end, getInventory = function() return bag end }
    rootItems[1], bagItems[1] = bagItem, food
    bag.Remove = function(_, item) if item == food then bagItems[1] = nil; return true end end
    bag.AddItem = function(_, item) bagItems[#bagItems + 1] = item; return item end
    local destination = {
      getType = function() return 'crate' end,
      getCapacity = function() return 10 end,
      getContentsWeight = function() return #destinationItems end,
      isAccessible = function() return true end,
      hasRoomFor = function() return true end,
      getItems = function() return destinationItems end,
      AddItem = function(_, item) destinationItems[#destinationItems + 1] = item; return item end,
      Remove = function(_, item)
        for index = 1, #destinationItems do
          if destinationItems[index] == item then table.remove(destinationItems, index); return true end
        end
        return false
      end,
    }
    local worldObject = { getContainer = function() return destination end }
    local square = { getObjects = function() return { worldObject } end }
    local player = {
      getInventory = function() return source end,
      getCell = function() return { getGridSquare = function(_, x, y, z)
        if x == 0 and y == 0 and z == 0 then return square end
      end } end,
      getX = function() return 0 end, getY = function() return 0 end, getZ = function() return 0 end,
    }
    Events.OnClientCommand.handler('SmartStorage', 'deposit', player, { category = 'Food', requestId = 'owned-1' })
    return #destinationItems, sent.module, sent.command, sent.summary.moved,
      sent.summary.protected, sent.summary.noDestination, sent.summary.failed
  `, 7, {
    sandboxExpression: `{ FoodContainerTypes = 'crate', MaxItemsPerRequest = 1 }`,
    modules: ['selection', 'transfer', 'server'],
    bootstrap: `
      Events = { OnClientCommand = { Add = function(handler) Events.OnClientCommand.handler = handler end } }
      getTimestamp = function() return 100 end
      sendServerCommand = function(player, module, command, summary)
        sent = { player = player, module = module, command = command, summary = summary }
      end
    `,
  });
  assert.deepEqual(values, [1, 'SmartStorage', 'result', 1, 0, 0, 0]);
});

test('Smart Storage fails closed when an item leaves the server-enumerated inventory before transfer', () => {
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    settings.FoodContainerTypes = { crate = true }
    local sourceItems = {}
    local source = { getItems = function() return sourceItems end, Remove = function() return true end }
    local destinationItems = {}
    local destination = {
      getType = function() return 'crate' end,
      getCapacity = function() return 10 end,
      getContentsWeight = function() return #destinationItems end,
      isAccessible = function() return true end,
      hasRoomFor = function() return true end,
      AddItem = function(_, item) destinationItems[#destinationItems + 1] = item; return item end,
    }
    local item = {
      getCategory = function() return 'Food' end,
      getCondition = function() return 100 end,
      getConditionMax = function() return 100 end,
      getContainer = function() return source end,
    }
    sourceItems[1] = item
    local summary = SmartStorage.Transfer.deposit({}, {
      category = 'Food', requestId = 'owned-2', settings = settings, items = { item }, owned = {},
      candidates = { { container = destination, x = 0, y = 0, z = 0, distance = 0 } },
    })
    return summary.moved, summary.failed, #destinationItems
  `, 3, { modules: ['selection', 'transfer'] });
  assert.deepEqual(values, [0, 1, 0]);
});

test('Smart Storage rejects unknown and hostile request fields', () => {
  const values = evaluateSmartStorage(`
    local player = {}
    local extra, extraReason = SmartStorage.Server.validateRequest(player, {
      category = 'Food', requestId = 'shape-1', unexpected = true,
    }, 100)
    local hostile = setmetatable({ category = 'Food', requestId = 'shape-2' }, {
      __pairs = function() error('untrusted network table') end,
    })
    local hostileRequest, hostileReason = SmartStorage.Server.validateRequest({}, hostile, 100)
    local virtual = setmetatable({ category = 'Food', requestId = 'shape-3' }, {
      __index = function(_, key) if key == 'containerId' then return 99 end end,
    })
    local virtualRequest, virtualReason = SmartStorage.Server.validateRequest({}, virtual, 100)
    return extra == nil, extraReason, hostileRequest == nil, hostileReason,
      virtualRequest == nil, virtualReason
  `, 6, { modules: ['server'] });
  assert.deepEqual(values, [true, 'invalid_request', true, 'invalid_request', true, 'invalid_request']);
});

test('Smart Storage refuses no-op removals and restores an existing item after a failed add', () => {
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    settings.FoodContainerTypes = { crate = true }
    local function destination(add)
      local items = {}
      return {
        items = items,
        getType = function() return 'crate' end,
        getCapacity = function() return 10 end,
        getContentsWeight = function() return #items end,
        isAccessible = function() return true end,
        hasRoomFor = function() return true end,
        getItems = function() return items end,
        AddItem = add,
        Remove = function(_, item)
          for index = 1, #items do if items[index] == item then table.remove(items, index); item.container = nil; return true end end
          return false
        end,
      }
    end
    local function item(source)
      return {
        container = source,
        getCategory = function() return 'Food' end,
        getCondition = function() return 100 end,
        getConditionMax = function() return 100 end,
        getContainer = function(self) return self.container end,
      }
    end
    local noOpItems = {}
    local noOpSource
    noOpSource = {
      getItems = function() return noOpItems end,
      Remove = function() return true end,
      AddItem = function(_, value) noOpItems[#noOpItems + 1] = value; value.container = noOpSource; return value end,
    }
    local noOpItem = item(noOpSource); noOpItems[1] = noOpItem
    local noOpDestination = destination(function(self, value) self.items[#self.items + 1] = value; value.container = self; return value end)
    local noOp = SmartStorage.Transfer.deposit({}, {
      category = 'Food', settings = settings, items = { noOpItem }, owned = { [noOpSource] = true },
      candidates = { { container = noOpDestination, x = 0, y = 0, z = 0, distance = 0 } },
    })
    local failedRemoveItems = {}
    local failedRemoveSource
    failedRemoveSource = {
      getItems = function() return failedRemoveItems end,
      Remove = function(_, value) table.remove(failedRemoveItems, 1); value.container = nil; return false end,
      AddItem = function(_, value) failedRemoveItems[#failedRemoveItems + 1] = value; value.container = failedRemoveSource; return value end,
    }
    local failedRemoveItem = item(failedRemoveSource); failedRemoveItems[1] = failedRemoveItem
    local failedRemoveDestination = destination(function(self, value) self.items[#self.items + 1] = value; value.container = self; return value end)
    local failedRemove = SmartStorage.Transfer.deposit({}, {
      category = 'Food', settings = settings, items = { failedRemoveItem }, owned = { [failedRemoveSource] = true },
      candidates = { { container = failedRemoveDestination, x = 0, y = 0, z = 0, distance = 0 } },
    })
    local failedItems = {}
    local failedSource
    failedSource = {
      getItems = function() return failedItems end,
      Remove = function(_, value) table.remove(failedItems, 1); value.container = nil; return true end,
      AddItem = function(_, value) failedItems[#failedItems + 1] = value; value.container = failedSource; return value end,
    }
    local failedItem = item(failedSource); failedItems[1] = failedItem
    local failedDestination = destination(function() return false end)
    local failed = SmartStorage.Transfer.deposit({}, {
      category = 'Food', settings = settings, items = { failedItem }, owned = { [failedSource] = true },
      candidates = { { container = failedDestination, x = 0, y = 0, z = 0, distance = 0 } },
    })
    return noOp.moved, noOp.failed, #noOpItems, #noOpDestination.items,
      failedRemove.moved, failedRemove.failed, #failedRemoveItems, #failedRemoveDestination.items, failedRemoveItem.container == failedRemoveSource,
      failed.moved, failed.failed, #failedItems, #failedDestination.items, failedItem.container == failedSource
  `, 14, { modules: ['selection', 'transfer'] });
  assert.deepEqual(values, [0, 1, 1, 0, 0, 1, 1, 0, true, 0, 1, 1, 0, true]);
});

test('Smart Storage checks item-aware capacity and priority classification before transfer', () => {
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    settings.Ammo = true
    settings.CategoryPriority = { 'Ammo', 'Food' }
    settings.FoodContainerTypes = { crate = true }
    local sourceItems = {}
    local source = {
      getItems = function() return sourceItems end,
      Remove = function(_, value) table.remove(sourceItems, 1); value.container = nil; return true end,
      AddItem = function(_, value) sourceItems[#sourceItems + 1] = value; value.container = source; return value end,
    }
    local destinationItems = {}
    local destination = {
      getType = function() return 'crate' end,
      getCapacity = function() return 100 end,
      getContentsWeight = function() return 0 end,
      isAccessible = function() return true end,
      hasRoomFor = function(_, player, value) return value.heavy ~= true end,
      getItems = function() return destinationItems end,
      AddItem = function(_, value) destinationItems[#destinationItems + 1] = value; value.container = destination; return value end,
      Remove = function() return false end,
    }
    local function item(heavy, ammo)
      local value = {
        container = source, heavy = heavy,
        getCategory = function() return 'Food' end,
        hasTag = function(_, tag) return ammo and tag == 'AMMO' end,
        getCondition = function() return 100 end,
        getConditionMax = function() return 100 end,
        getContainer = function(self) return self.container end,
      }
      sourceItems[#sourceItems + 1] = value
      return value
    end
    local heavy = item(true, false)
    local overlap = item(false, true)
    local heavySummary = SmartStorage.Transfer.deposit({}, {
      category = 'Food', settings = settings, items = { heavy }, owned = { [source] = true },
      candidates = { { container = destination, x = 0, y = 0, z = 0, distance = 0 } },
    })
    local overlapSummary = SmartStorage.Transfer.deposit({}, {
      category = 'Food', settings = settings, items = { overlap }, owned = { [source] = true },
      candidates = { { container = destination, x = 0, y = 0, z = 0, distance = 0 } },
    })
    return heavySummary.moved, heavySummary.noDestination, overlapSummary.moved, overlapSummary.failed,
      #sourceItems, #destinationItems
  `, 6, { modules: ['selection', 'transfer'] });
  assert.deepEqual(values, [0, 1, 0, 1, 2, 0]);
});
