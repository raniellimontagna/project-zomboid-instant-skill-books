const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const { lauxlib, lua, lualib, to_luastring } = require('fengari');

const repositoryRoot = path.resolve(__dirname, '../../..');
const smartStorageRoot = path.join(repositoryRoot, 'mods/SmartStorage');
const rootReadmePath = path.join(repositoryRoot, 'README.md');
const instantSkillBooksReadmePath = path.join(repositoryRoot, 'mods/InstantSkillBooks/README.md');
const roadmapPath = path.join(
  repositoryRoot,
  'docs/superpowers/specs/2026-08-23-coop-quality-of-life-roadmap.md',
);
const releaseZipPath = path.join(repositoryRoot, 'outputs/SmartStorage-0.1.0.zip');
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
const englishUiPath = path.join(
  smartStorageRoot,
  '42/media/lua/shared/Translate/EN/UI.json',
);
const portugueseUiPath = path.join(
  smartStorageRoot,
  '42/media/lua/shared/Translate/PTBR/UI.json',
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
const contextMenuPath = path.join(
  smartStorageRoot,
  '42/media/lua/client/SmartStorage/ContextMenu.lua',
);
const clientCommandsPath = path.join(
  smartStorageRoot,
  '42/media/lua/client/SmartStorage/ClientCommands.lua',
);
const resultPath = path.join(
  smartStorageRoot,
  '42/media/lua/client/SmartStorage/Result.lua',
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

function readZipFiles(filePath) {
  const archive = fs.readFileSync(filePath);
  const endOfCentralDirectory = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const endOffset = archive.lastIndexOf(endOfCentralDirectory);
  assert.notEqual(endOffset, -1, 'ZIP has an end-of-central-directory record');

  const entryCount = archive.readUInt16LE(endOffset + 10);
  let offset = archive.readUInt32LE(endOffset + 16);
  const entries = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(archive.readUInt32LE(offset), 0x02014b50, 'ZIP has a central-directory entry');
    const compressionMethod = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localHeaderOffset = archive.readUInt32LE(offset + 42);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    assert.equal(archive.readUInt32LE(localHeaderOffset), 0x04034b50, 'ZIP has a local-file entry');
    const localNameLength = archive.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressedData = archive.subarray(dataOffset, dataOffset + compressedSize);
    const contents = compressionMethod === 0
      ? compressedData
      : compressionMethod === 8
        ? zlib.inflateRawSync(compressedData)
        : assert.fail(`unsupported ZIP compression method ${compressionMethod}`);
    assert.equal(contents.length, uncompressedSize, `${name} extracts to its recorded size`);
    entries.set(name, contents);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntries(filePath) {
  return [...readZipFiles(filePath).keys()].sort();
}

function smartStorageSourceEntries() {
  const sourceRoot = path.join(smartStorageRoot, '42');
  const sourceEntries = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile()) {
        sourceEntries.push(
          path.posix.join('SmartStorage', path.relative(smartStorageRoot, entryPath).replaceAll(path.sep, '/')),
        );
      }
    }
  }
  visit(sourceRoot);
  return sourceEntries.sort();
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

test('Smart Storage release documentation indexes both mods and documents every server setting', () => {
  const rootReadme = fs.readFileSync(rootReadmePath, 'utf8');
  const instantSkillBooksReadme = fs.readFileSync(instantSkillBooksReadmePath, 'utf8');
  const smartStorageReadme = fs.readFileSync(readmePath, 'utf8');

  assert.match(rootReadme, /## Available mods/);
  assert.match(rootReadme, /\[Instant Skill Books\]\(mods\/InstantSkillBooks\/README\.md\)/);
  assert.match(rootReadme, /\[Smart Storage\]\(mods\/SmartStorage\/README\.md\)/);
  assert.match(instantSkillBooksReadme, /3786090811/);
  assert.match(instantSkillBooksReadme, /WorkshopItems=3786090811/);
  assert.match(smartStorageReadme, /server-authoritative/i);
  assert.match(smartStorageReadme, /\*ItemTypes.*full item types/i);
  assert.match(smartStorageReadme, /\*ContainerTypes.*container types/i);
  assert.match(smartStorageReadme, /four practical starter categories.*`crate`/i);
  assert.match(smartStorageReadme, /admins can override.*add verified container types/i);

  const options = fs.readFileSync(sandboxOptionsPath, 'utf8');
  for (const match of options.matchAll(/option SmartStorage\.([A-Za-z]+) \{ type = \w+, default = (true|false|\d+|"[^"]*"),/g)) {
    const [, option, defaultValue] = match;
    assert.match(smartStorageReadme, new RegExp('`SmartStorage\\.' + option + '`'));
    assert.match(smartStorageReadme, new RegExp('`' + defaultValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '`'));
  }
});

test('Smart Storage release documentation records implementation while retaining live follow-ups', () => {
  const roadmap = fs.readFileSync(roadmapPath, 'utf8');
  const smartStorageReadme = fs.readFileSync(readmePath, 'utf8');
  assert.match(roadmap, /Smart Storage B42.*implemented/i);
  assert.match(roadmap, /Workshop upload.*follow-up/i);
  assert.match(roadmap, /two-client.*follow-up/i);
  assert.match(smartStorageReadme, /two clients/i);
  assert.match(smartStorageReadme, /Workshop upload/i);
});

test('Smart Storage release ZIP exactly packages its Build 42 source tree', () => {
  assert.equal(fs.existsSync(releaseZipPath), true, 'release ZIP exists');
  const files = readZipFiles(releaseZipPath);
  const entries = readZipEntries(releaseZipPath);
  assert.deepEqual(entries, smartStorageSourceEntries());
  for (const entry of entries) {
    const sourcePath = path.join(
      smartStorageRoot,
      entry.replace(/^SmartStorage\//, '').replaceAll('/', path.sep),
    );
    assert.deepEqual(files.get(entry), fs.readFileSync(sourcePath), `${entry} matches the source package`);
  }
  assert.equal(files.get('SmartStorage/42/mod.info').toString('utf8'), [
    'name=Smart Storage B42',
    'id=SmartStorage',
    'modversion=0.1.0',
    'pzversion=42.20',
    'versionMin=42.20.0',
    '',
  ].join('\n'));
  for (const requiredPath of [
    'SmartStorage/42/mod.info',
    'SmartStorage/42/media/sandbox-options.txt',
    'SmartStorage/42/media/lua/shared/SmartStorage/Settings.lua',
    'SmartStorage/42/media/lua/shared/SmartStorage/Classifier.lua',
    'SmartStorage/42/media/lua/shared/SmartStorage/Protection.lua',
    'SmartStorage/42/media/lua/shared/SmartStorage/Selection.lua',
    'SmartStorage/42/media/lua/server/SmartStorage/Server.lua',
    'SmartStorage/42/media/lua/server/SmartStorage/Transfer.lua',
    'SmartStorage/42/media/lua/client/SmartStorage/ContextMenu.lua',
    'SmartStorage/42/media/lua/client/SmartStorage/ClientCommands.lua',
    'SmartStorage/42/media/lua/client/SmartStorage/Result.lua',
    'SmartStorage/42/media/lua/shared/Translate/EN/UI.json',
    'SmartStorage/42/media/lua/shared/Translate/PTBR/UI.json',
  ]) {
    assert.ok(entries.includes(requiredPath), `${requiredPath} is packaged`);
  }
  for (const entry of entries) {
    assert.match(entry, /^SmartStorage\/42\//, `${entry} remains inside the mod layout`);
    assert.doesNotMatch(entry, /(?:^|\/)(?:test|tests|node_modules|docs|\.worktrees|\.superpowers)(?:\/|$)|workshop\.txt$/i);
  }
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
    ItemTag = {
      AMMO = {}, IS_SEED = {}, FERTILIZER = {}, COMPOST = {},
      FISHING_ROD = {}, FISHING_LINE = {}, FISHING_HOOK = {},
      HAMMER = {}, SAW = {}, SCREWDRIVER = {}, WRENCH = {},
      CROWBAR = {}, PIPE_WRENCH = {}, PRY_BAR = {}, BLOW_TORCH = {},
      PLASTER_BUCKET = {}, WALLPAPER_PASTE = {}, PAINTBRUSH = {},
      HOLD_DIRT = {}, TAKE_DIRT = {}, SLEDGEHAMMER = {}, CLUB_HAMMER = {},
      STONE_MAUL = {}, PICK_AXE = {}, CHOP_TREE = {}, DIG_PLOW = {},
      DIG_GRAVE = {}, REMOVE_STUMP = {}, CUT_PLANT = {}, IS_CUTTING = {},
      PETROL = {}, IS_FIRE_FUEL = {}, IS_FIRE_FUEL_SINGLE_USE = {},
    }
    assertItemTag = function(value, expected)
      if type(value) == 'string' then error('production passed a string ItemTag') end
      return value == expected
    end
    makeWorldCandidate = function(container, x, y, z, distance, accessible)
      local square, object
      object = {
        getContainer = function() return container end,
        getSquare = function() return square end,
      }
      square = { getObjects = function() return { object } end }
      container.getParent = function() return object end
      return {
        container = container, object = object, square = square,
        x = x, y = y, z = z, distance = distance, accessible = accessible,
      }
    end
    ${extraBootstrap}
  `;
  assert.equal(lauxlib.luaL_loadstring(state, to_luastring(bootstrap)), lua.LUA_OK);
  assert.equal(lua.lua_pcall(state, 0, 0, 0), lua.LUA_OK);

  const sourcePaths = [settingsPath, classifierPath];
  if (modules.includes('selection')) sourcePaths.push(selectionPath);
  if (modules.includes('transfer')) sourcePaths.push(transferPath);
  if (modules.includes('server')) sourcePaths.push(serverPath);
  if (modules.includes('clientCommands')) sourcePaths.push(clientCommandsPath);
  if (modules.includes('contextMenu')) sourcePaths.push(contextMenuPath);
  if (modules.includes('result')) sourcePaths.push(resultPath);
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

test('Smart Storage applies starter container defaults only when values are absent', () => {
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    return (settings.FoodContainerTypes or {}).crate == true,
      (settings.ToolsContainerTypes or {}).crate == true,
      (settings.MedicineContainerTypes or {}).crate == true,
      (settings.ConstructionContainerTypes or {}).crate == true,
      (settings.WeaponsContainerTypes or {}).crate == true,
      (settings.AmmoContainerTypes or {}).crate == true
  `, 6);
  assert.deepEqual(values, [true, true, true, true, false, false]);
});

test('Smart Storage keeps malformed or explicitly empty container settings fail-closed', () => {
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    return (settings.FoodContainerTypes or {}).crate == true,
      (settings.ToolsContainerTypes or {}).crate == true,
      (settings.MedicineContainerTypes or {}).crate == true,
      (settings.ConstructionContainerTypes or {}).crate == true,
      (settings.WeaponsContainerTypes or {}).crate == true,
      (settings.AmmoContainerTypes or {}).crate == true
  `, 6, {
    sandboxExpression: `{ FoodContainerTypes = 42, ToolsContainerTypes = {}, MedicineContainerTypes = false, ConstructionContainerTypes = '   ', WeaponsContainerTypes = '', AmmoContainerTypes = 'crate' }`,
  });
  assert.deepEqual(values, [false, false, false, false, false, true]);
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
    local ammo = { hasTag = function(_, tag) return assertItemTag(tag, ItemTag.AMMO) end }
    local seed = { hasTag = function(_, tag) return assertItemTag(tag, ItemTag.IS_SEED) end }
    local foodAllowlist = {
      getFullType = function() return 'Base.CustomFood' end,
      getCategory = function() return 'Other' end,
    }
    local medicine = {
      getFullType = function() return 'Base.Pills' end,
      getCategory = function() return 'Other' end,
    }
    local medical = {
      getStringItemType = function() return 'Medical' end,
      getCategory = function() return 'Other' end,
    }
    return SmartStorage.Classifier.classify(food, defaults),
      SmartStorage.Classifier.classify(weapon, defaults),
      SmartStorage.Classifier.classify(ammo, defaults),
      SmartStorage.Classifier.classify(seed, defaults),
      SmartStorage.Classifier.classify(foodAllowlist, defaults),
      SmartStorage.Classifier.classify(medicine, defaults),
      SmartStorage.Classifier.classify(medical, defaults)
  `, 7, {
    sandboxExpression: `{ FoodItemTypes = 'Base.CustomFood', MedicineItemTypes = 'Base.Pills' }`,
  });
  assert.deepEqual(values, ['Food', 'Weapons', 'Ammo', 'Farming', 'Food', 'Medicine', 'Medicine']);
});

test('Smart Storage resolves overlaps by active CategoryPriority', () => {
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    settings.Ammo = true
    settings.CategoryPriority = { 'Ammo', 'Food' }
    local item = {
      getCategory = function() return 'Food' end,
      hasTag = function(_, tag) return assertItemTag(tag, ItemTag.AMMO) end,
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

test('Smart Storage passes B42 ItemTag tokens to hasTag', () => {
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    settings.Ammo = true
    local item = {
      hasTag = function(_, tag) return assertItemTag(tag, ItemTag.AMMO) end,
    }
    return SmartStorage.Classifier.classify(item, settings)
  `, 1);
  assert.deepEqual(values, ['Ammo']);
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
    const containerDefault = ['Food', 'Tools', 'Medicine', 'Construction'].includes(category)
      ? 'crate'
      : '';
    assert.match(
      options,
      new RegExp(`option SmartStorage\\.${category}ContainerTypes \\{ type = string, default = "${containerDefault}",`),
    );
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

test('Smart Storage provides sandbox labels and UI labels in their proper translation files', () => {
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
    for (const key of Object.keys(translations)) {
      assert.doesNotMatch(key, /^UI_SmartStorage_/);
    }
  }
  for (const translationPath of [englishUiPath, portugueseUiPath]) {
    assert.equal(fs.existsSync(translationPath), true, `${translationPath} exists`);
    const translations = JSON.parse(fs.readFileSync(translationPath, 'utf8'));
    for (const key of [
      'UI_SmartStorage_DepositCompatible', 'UI_SmartStorage_Moved',
      'UI_SmartStorage_Protected', 'UI_SmartStorage_NoDestination',
      'UI_SmartStorage_Failed', 'UI_SmartStorage_Reason_rate_limited',
    ]) {
      assert.equal(typeof translations[key], 'string');
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
    local ammoSettings = SmartStorage.Settings.read()
    ammoSettings.Ammo = true
    local tagged = base()
    tagged.getCategory = function() return 'Other' end
    tagged.hasTag = function(_, tag) return assertItemTag(tag, ItemTag.AMMO) end
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
    local taggedAllowed, taggedReason = SmartStorage.Protection.check(tagged, character, ammoSettings)
    return equippedAllowed, equippedReason, wornAllowed, wornReason,
      favoriteAllowed, favoriteReason, brokenAllowed, brokenReason,
      lowAllowed, lowReason, filledAllowed, filledReasonValue,
      unknownAllowed, unknownReason, validAllowed, validReason,
      taggedAllowed, taggedReason
  `, 18);
  assert.deepEqual(values, [
    false, 'equipped', false, 'worn', false, 'favorite', false, 'low_condition',
    false, 'low_condition', false, 'filled_container', false, 'invalid', true, null,
    true, null,
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
    local function container(typeName, capacity, used)
      return {
        getType = function() return typeName end,
        getCapacity = function() return capacity end,
        getContentsWeight = function() return used end,
      }
    end
    local a = container('crate', 10, 0)
    local b = container('crate', 10, 0)
    local rejectedType = container('counter', 10, 0)
    local rejectedCapacity = container('crate', 1, 1)
    local rejectedAccess = container('crate', 10, 0)
    local selected = SmartStorage.Selection.choose({
      makeWorldCandidate(rejectedType, 0, 0, 0, 0, true),
      makeWorldCandidate(rejectedCapacity, 0, 0, 0, 0, true),
      makeWorldCandidate(rejectedAccess, 0, 0, 0, 0, false),
      makeWorldCandidate(b, 2, 1, 0, 2, true),
      makeWorldCandidate(a, 1, 2, 0, 2, true),
    }, 'Food', settings, {})
    return selected == a
  `, 1, { modules: ['selection'] });
  assert.deepEqual(values, [true]);
});

test('Smart Storage selection requires a server-derived access flag and never calls ItemContainer:isAccessible', () => {
  const selection = fs.readFileSync(selectionPath, 'utf8');
  assert.doesNotMatch(selection, /isAccessible/);
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    settings.FoodContainerTypes = { crate = true }
    local container = {
      getType = function() return 'crate' end,
      getCapacity = function() return 10 end,
      getContentsWeight = function() return 0 end,
    }
    local accepted = SmartStorage.Selection.choose({
      makeWorldCandidate(container, 0, 0, 0, 0, true),
    }, 'Food', settings, {})
    local rejected = SmartStorage.Selection.choose({
      makeWorldCandidate(container, 0, 0, 0, 0, nil),
    }, 'Food', settings, {})
    return accepted == container, rejected == nil
  `, 2, { modules: ['selection'] });
  assert.deepEqual(values, [true, true]);
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
    } end
    local first, second, third, outside = c(), c(), c(), c()
    local selected = SmartStorage.Selection.choose({
      makeWorldCandidate(outside, 4, 0, 0, 4, true),
      makeWorldCandidate(third, 1, 0, 1, 2, true),
      makeWorldCandidate(second, 1, 1, 0, 2, true),
      makeWorldCandidate(first, 1, 0, 0, 2, true),
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
      candidates = { makeWorldCandidate(destination, 0, 0, 0, 0, true) },
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
    local square
    local worldObject = {
      getContainer = function() return destination end,
      getSquare = function() return square end,
    }
    destination.getParent = function() return worldObject end
    square = {
      getObjects = function() return { worldObject } end,
      isBlockedTo = function() return false end,
      isWindowTo = function() return false end,
    }
    local player = {
      getInventory = function() return source end,
      getCell = function() return { getGridSquare = function(_, x, y, z)
        if x == 0 and y == 0 and z == 0 then return square end
      end } end,
      getX = function() return 0 end, getY = function() return 0 end, getZ = function() return 0 end,
      getCurrentSquare = function() return square end,
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

test('Smart Storage accepts an ordinary accessible world container through the target-square B42 access seam', () => {
  const values = evaluateSmartStorage(`
    local sourceItems, destinationItems = {}, {}
    local source = {
      getItems = function() return sourceItems end,
      Remove = function(_, item) if sourceItems[1] == item then sourceItems[1] = nil; return true end end,
      AddItem = function(_, item) sourceItems[1] = item; return item end,
    }
    local food = {
      getCategory = function() return 'Food' end,
      getCondition = function() return 100 end,
      getConditionMax = function() return 100 end,
      getContainer = function() return source end,
    }
    sourceItems[1] = food
    local destination = {
      getType = function() return 'crate' end,
      getCapacity = function() return 10 end,
      getContentsWeight = function() return #destinationItems end,
      hasRoomFor = function() return true end,
      getItems = function() return destinationItems end,
      AddItem = function(_, item) destinationItems[#destinationItems + 1] = item; return item end,
      Remove = function(_, item) if destinationItems[1] == item then destinationItems[1] = nil; return true end end,
    }
    local playerSquare = {}
    local targetSquare, worldObject
    worldObject = {
      getContainer = function() return destination end,
      getSquare = function() return targetSquare end,
    }
    destination.getParent = function() return worldObject end
    targetSquare = {
      getObjects = function() return { worldObject } end,
    }
    playerSquare.canReachTo = function(_, square) return square == targetSquare end
    local player = {
      getInventory = function() return source end,
      getCell = function() return { getGridSquare = function(_, x, y, z)
        if x == 1 and y == 0 and z == 0 then return targetSquare end
      end } end,
      getX = function() return 0 end, getY = function() return 0 end, getZ = function() return 0 end,
      getCurrentSquare = function() return playerSquare end,
    }
    Events.OnClientCommand.handler('SmartStorage', 'deposit', player, { category = 'Food', requestId = 'world-access-1' })
    return #destinationItems, sent.summary.moved, sent.summary.noDestination, sent.summary.failed
  `, 4, {
    sandboxExpression: `{ FoodContainerTypes = 'crate', SearchRadius = 1 }`,
    modules: ['selection', 'transfer', 'server'],
    bootstrap: `
      Events = { OnClientCommand = { Add = function(handler) Events.OnClientCommand.handler = handler end } }
      getTimestamp = function() return 100 end
      sendServerCommand = function(_, _, _, summary) sent = { summary = summary } end
    `,
  });
  assert.deepEqual(values, [1, 1, 0, 0]);
});

test('Smart Storage rejects a non-adjacent target when Build 42 reachability finds an intermediate block', () => {
  const values = evaluateSmartStorage(`
    local sourceItems, destinationItems = {}, {}
    local source = {
      getItems = function() return sourceItems end,
      Remove = function(_, item) if sourceItems[1] == item then sourceItems[1] = nil; return true end end,
      AddItem = function(_, item) sourceItems[1] = item; return item end,
    }
    local food = {
      getCategory = function() return 'Food' end,
      getCondition = function() return 100 end,
      getConditionMax = function() return 100 end,
      getContainer = function() return source end,
    }
    sourceItems[1] = food
    local destination = {
      getType = function() return 'crate' end,
      getCapacity = function() return 10 end,
      getContentsWeight = function() return #destinationItems end,
      hasRoomFor = function() return true end,
      getItems = function() return destinationItems end,
      AddItem = function(_, item) destinationItems[#destinationItems + 1] = item; return item end,
      Remove = function(_, item) if destinationItems[1] == item then destinationItems[1] = nil; return true end end,
    }
    local playerSquare = { reachCalls = 0 }
    local targetSquare, worldObject
    worldObject = {
      getContainer = function() return destination end,
      getSquare = function() return targetSquare end,
    }
    destination.getParent = function() return worldObject end
    targetSquare = {
      getObjects = function() return { worldObject } end,
      -- These edge helpers deliberately report no local obstruction.  The
      -- server must use canReachTo so an intermediate obstruction still wins.
      isBlockedTo = function() return false end,
      isWindowTo = function() return false end,
    }
    playerSquare.canReachTo = function(_, square)
      playerSquare.reachCalls = playerSquare.reachCalls + 1
      return square ~= targetSquare
    end
    local player = {
      getInventory = function() return source end,
      getCell = function() return { getGridSquare = function(_, x, y, z)
        if x == 2 and y == 0 and z == 0 then return targetSquare end
      end } end,
      getX = function() return 0 end, getY = function() return 0 end, getZ = function() return 0 end,
      getCurrentSquare = function() return playerSquare end,
    }
    Events.OnClientCommand.handler('SmartStorage', 'deposit', player, { category = 'Food', requestId = 'path-deny-1' })
    return #destinationItems, #sourceItems, sent.summary.noDestination, sent.summary.failed,
      playerSquare.reachCalls, sent.summary.moved
  `, 6, {
    sandboxExpression: `{ FoodContainerTypes = 'crate', SearchRadius = 3 }`,
    modules: ['selection', 'transfer', 'server'],
    bootstrap: `
      Events = { OnClientCommand = { Add = function(handler) Events.OnClientCommand.handler = handler end } }
      getTimestamp = function() return 100 end
      sendServerCommand = function(_, _, _, summary) sent = { summary = summary } end
    `,
  });
  assert.deepEqual(values, [0, 1, 1, 0, 1, 0]);
});

test('Smart Storage fails closed for unknown square access and identifiable non-world or vehicle parents', () => {
  const values = evaluateSmartStorage(`
    local function attempt(kind, requestId)
      local sourceItems, destinationItems = {}, {}
      local source = {
        getItems = function() return sourceItems end,
        Remove = function(_, item) if sourceItems[1] == item then sourceItems[1] = nil; return true end end,
        AddItem = function(_, item) sourceItems[1] = item; return item end,
      }
      local food = {
        getCategory = function() return 'Food' end,
        getCondition = function() return 100 end,
        getConditionMax = function() return 100 end,
        getContainer = function() return source end,
      }
      sourceItems[1] = food
      local destination = {
        getType = function() return 'crate' end,
        getCapacity = function() return 10 end,
        getContentsWeight = function() return #destinationItems end,
        hasRoomFor = function() return true end,
        getItems = function() return destinationItems end,
        AddItem = function(_, item) destinationItems[#destinationItems + 1] = item; return item end,
        Remove = function(_, item) if destinationItems[1] == item then destinationItems[1] = nil; return true end end,
      }
      local playerSquare = {}
      local targetSquare, worldObject
      worldObject = {
        getContainer = function() return destination end,
        getSquare = function() return targetSquare end,
      }
      if kind == 'vehicle' then worldObject.getVehicle = function() return {} end end
      destination.getParent = function()
        if kind == 'unknown-parent' then return {} end
        return worldObject
      end
      targetSquare = { getObjects = function() return { worldObject } end }
      local player = {
        getInventory = function() return source end,
        getCell = function() return { getGridSquare = function(_, x, y, z)
          if ((kind == 'unknown-access' and x == 1) or (kind ~= 'unknown-access' and x == 0)) and y == 0 and z == 0 then
            return targetSquare
          end
        end } end,
        getX = function() return 0 end, getY = function() return 0 end, getZ = function() return 0 end,
        getCurrentSquare = function() return kind == 'unknown-access' and playerSquare or targetSquare end,
      }
      Events.OnClientCommand.handler('SmartStorage', 'deposit', player, { category = 'Food', requestId = requestId })
      return #destinationItems, #sourceItems, sent.summary.noDestination, sent.summary.failed
    end
    local unknownAccess = { attempt('unknown-access', 'world-deny-1') }
    local unknownParent = { attempt('unknown-parent', 'world-deny-2') }
    local vehicle = { attempt('vehicle', 'world-deny-3') }
    return unknownAccess[1], unknownAccess[2], unknownAccess[3], unknownAccess[4],
      unknownParent[1], unknownParent[2], unknownParent[3], unknownParent[4],
      vehicle[1], vehicle[2], vehicle[3], vehicle[4]
  `, 12, {
    sandboxExpression: `{ FoodContainerTypes = 'crate', SearchRadius = 1 }`,
    modules: ['selection', 'transfer', 'server'],
    bootstrap: `
      Events = { OnClientCommand = { Add = function(handler) Events.OnClientCommand.handler = handler end } }
      getTimestamp = function() return 100 end
      sendServerCommand = function(_, _, _, summary) sent = { summary = summary } end
    `,
  });
  assert.deepEqual(values, [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0]);
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
      candidates = { makeWorldCandidate(destination, 0, 0, 0, 0, true) },
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
      candidates = { makeWorldCandidate(noOpDestination, 0, 0, 0, 0, true) },
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
      candidates = { makeWorldCandidate(failedRemoveDestination, 0, 0, 0, 0, true) },
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
      candidates = { makeWorldCandidate(failedDestination, 0, 0, 0, 0, true) },
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
      hasRoomFor = function(_, player, value) return value.heavy ~= true end,
      getItems = function() return destinationItems end,
      AddItem = function(_, value) destinationItems[#destinationItems + 1] = value; value.container = destination; return value end,
      Remove = function() return false end,
    }
    local function item(heavy, ammo)
      local value = {
        container = source, heavy = heavy,
        getCategory = function() return 'Food' end,
        hasTag = function(_, tag) return ammo and assertItemTag(tag, ItemTag.AMMO) end,
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
      candidates = { makeWorldCandidate(destination, 0, 0, 0, 0, true) },
    })
    local overlapSummary = SmartStorage.Transfer.deposit({}, {
      category = 'Food', settings = settings, items = { overlap }, owned = { [source] = true },
      candidates = { makeWorldCandidate(destination, 0, 0, 0, 0, true) },
    })
    return heavySummary.moved, heavySummary.noDestination, overlapSummary.moved, overlapSummary.failed,
      #sourceItems, #destinationItems
  `, 6, { modules: ['selection', 'transfer'] });
  assert.deepEqual(values, [0, 1, 0, 1, 2, 0]);
});

test('Smart Storage treats a returned destination stack as a completed merge', () => {
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    settings.FoodContainerTypes = { crate = true }
    local sourceItems = {}
    local source
    source = {
      getItems = function() return sourceItems end,
      Remove = function(_, value) table.remove(sourceItems, 1); value.container = nil; return true end,
      AddItem = function(_, value) sourceItems[#sourceItems + 1] = value; value.container = source; return value end,
    }
    local incoming = {
      container = source,
      getCategory = function() return 'Food' end,
      getCondition = function() return 100 end,
      getConditionMax = function() return 100 end,
      getContainer = function(self) return self.container end,
    }
    sourceItems[1] = incoming
    local stack = { merged = false }
    local destinationItems = { stack }
    local destination = {
      getType = function() return 'crate' end,
      getCapacity = function() return 10 end,
      getContentsWeight = function() return 1 end,
      hasRoomFor = function() return true end,
      getItems = function() return destinationItems end,
      AddItem = function(_, value) stack.merged = value == incoming; return stack end,
      Remove = function(_, value)
        for index = 1, #destinationItems do
          if destinationItems[index] == value then table.remove(destinationItems, index); return true end
        end
        return false
      end,
    }
    local summary = SmartStorage.Transfer.deposit({}, {
      category = 'Food', settings = settings, items = { incoming }, owned = { [source] = true },
      candidates = { makeWorldCandidate(destination, 0, 0, 0, 0, true) },
    })
    return summary.moved, summary.failed, #sourceItems, #destinationItems, stack.merged
  `, 5, { modules: ['selection', 'transfer'] });
  assert.deepEqual(values, [1, 0, 0, 1, true]);
});

test('Smart Storage restores after a no-op add into an unchanged non-empty destination', () => {
  const values = evaluateSmartStorage(`
    local settings = SmartStorage.Settings.read()
    settings.FoodContainerTypes = { crate = true }
    local sourceItems = {}
    local source
    source = {
      getItems = function() return sourceItems end,
      Remove = function(_, value) table.remove(sourceItems, 1); value.container = nil; return true end,
      AddItem = function(_, value) sourceItems[#sourceItems + 1] = value; value.container = source; return value end,
    }
    local item = {
      container = source,
      getCategory = function() return 'Food' end,
      getCondition = function() return 100 end,
      getConditionMax = function() return 100 end,
      getContainer = function(self) return self.container end,
    }
    sourceItems[1] = item
    local existing = {}
    local destinationItems = { existing }
    local destination = {
      getType = function() return 'crate' end,
      getCapacity = function() return 10 end,
      getContentsWeight = function() return 1 end,
      hasRoomFor = function() return true end,
      getItems = function() return destinationItems end,
      AddItem = function() return false end,
      Remove = function(_, value)
        for index = 1, #destinationItems do
          if destinationItems[index] == value then table.remove(destinationItems, index); return true end
        end
        return false
      end,
    }
    local summary = SmartStorage.Transfer.deposit({}, {
      category = 'Food', settings = settings, items = { item }, owned = { [source] = true },
      candidates = { makeWorldCandidate(destination, 0, 0, 0, 0, true) },
    })
    return summary.moved, summary.failed, #sourceItems, sourceItems[1] == item,
      #destinationItems, destinationItems[1] == existing
  `, 6, { modules: ['selection', 'transfer'] });
  assert.deepEqual(values, [0, 1, 1, true, 1, true]);
});

test('Smart Storage adds a localized inventory action only for an eligible category and sends intent with a local nonce', () => {
  const values = evaluateSmartStorage(`
    local food = { getCategory = function() return 'Food' end }
    local unknown = { getCategory = function() return 'Mystery' end }
    local context = {
      addOption = function(_, label, target, callback, category)
        option = { label = label, target = target, callback = callback, category = category }
      end,
    }
    Events.OnFillInventoryObjectContextMenu.handler(0, context, { unknown, food })
    option.callback(option.target, option.category)
    option.callback(option.target, option.category)
    local eligibleLabel = option.label
    local first, second = sent[1], sent[2]
    local function exactRequestShape(args)
      local count = 0
      for key in pairs(args) do
        if key ~= 'category' and key ~= 'requestId' then return false end
        count = count + 1
      end
      return count == 2 and args.category ~= nil and args.requestId ~= nil
    end
    option = nil
    Events.OnFillInventoryObjectContextMenu.handler(0, context, { unknown })
    return eligibleLabel, #sent == 2, first.player == player and second.player == player,
      first.module, first.command, first.args.category, second.args.category,
      exactRequestShape(first.args), exactRequestShape(second.args),
      type(first.args.requestId) == 'string' and #first.args.requestId > 0,
      type(second.args.requestId) == 'string' and #second.args.requestId > 0,
      first.args.requestId ~= second.args.requestId, option == nil,
      first.args.itemIds == nil, first.args.items == nil, first.args.containerId == nil
  `, 16, {
    modules: ['clientCommands', 'contextMenu'],
    bootstrap: `
      player = {}
      Events = { OnFillInventoryObjectContextMenu = { Add = function(handler)
        Events.OnFillInventoryObjectContextMenu.handler = handler
      end } }
      getPlayer = function() return player end
      sendClientCommand = function(target, module, command, args)
        sent = sent or {}
        sent[#sent + 1] = { player = target, module = module, command = command, args = args }
      end
      getText = function(key)
        if key == 'UI_SmartStorage_DepositCompatible' then return 'Depositar itens compativeis' end
        return key
      end
    `,
  });
  assert.deepEqual(values, [
    'Depositar itens compativeis', true, true, 'SmartStorage', 'deposit', 'Food', 'Food',
    true, true, true, true, true,
    true, true, true, true,
  ]);
});

test('Smart Storage client action source has no inventory mutation or client item identifier path', () => {
  for (const sourcePath of [contextMenuPath, clientCommandsPath, resultPath]) {
    assert.equal(fs.existsSync(sourcePath), true, `${sourcePath} exists`);
    const source = fs.readFileSync(sourcePath, 'utf8');
    assert.doesNotMatch(source, /(?:\.|:)Remove\s*\(|(?:\.|:)AddItem\s*\(|removeItem\s*\(|setCondition\s*\(/i);
    assert.doesNotMatch(source, /itemIds|containerId|destinationId/i);
  }
});

test('Smart Storage formats a localized server result and displays it only for SmartStorage/result', () => {
  const values = evaluateSmartStorage(`
    Events.OnServerCommand.handler('Other', 'result', { moved = 99 })
    local ignored = shown == nil
    Events.OnServerCommand.handler('SmartStorage', 'result', {
      moved = 2, protected = 1, noDestination = 0, failed = 3,
    })
    return ignored, shown.player == player, shown.text
  `, 3, {
    modules: ['result'],
    bootstrap: `
      player = {}
      Events = { OnServerCommand = { Add = function(handler) Events.OnServerCommand.handler = handler end } }
      getPlayer = function() return player end
      HaloTextHelper = { addText = function(target, message) shown = { player = target, text = message } end }
      getText = function(key)
        local values = {
          UI_SmartStorage_Moved = 'Movidos', UI_SmartStorage_Protected = 'Protegidos',
          UI_SmartStorage_NoDestination = 'Sem destino', UI_SmartStorage_Failed = 'Falhas',
        }
        return values[key] or key
      end
    `,
  });
  assert.deepEqual(values, [true, true, 'Movidos: 2 | Protegidos: 1 | Sem destino: 0 | Falhas: 3']);
});

test('Smart Storage safely clamps malformed results and appends an available localized reason', () => {
  const values = evaluateSmartStorage(`
    Events.OnServerCommand.handler('SmartStorage', 'result', {
      moved = -2, protected = 'one', noDestination = 4.9, failed = nil, reason = 'rate_limited',
    })
    local known = shown.text
    Events.OnServerCommand.handler('SmartStorage', 'result', 'invalid')
    return known, shown.text
  `, 2, {
    modules: ['result'],
    bootstrap: `
      Events = { OnServerCommand = { Add = function(handler) Events.OnServerCommand.handler = handler end } }
      getPlayer = function() return {} end
      HaloTextHelper = { addText = function(_, message) shown = { text = message } end }
      getText = function(key)
        local values = {
          UI_SmartStorage_Moved = 'Movidos', UI_SmartStorage_Protected = 'Protegidos',
          UI_SmartStorage_NoDestination = 'Sem destino', UI_SmartStorage_Failed = 'Falhas',
          UI_SmartStorage_Reason_rate_limited = 'Aguarde antes de tentar novamente',
        }
        return values[key] or key
      end
    `,
  });
  assert.deepEqual(values, [
    'Movidos: 0 | Protegidos: 0 | Sem destino: 4 | Falhas: 0 | Aguarde antes de tentar novamente',
    'Movidos: 0 | Protegidos: 0 | Sem destino: 0 | Falhas: 0',
  ]);
});

test('Smart Storage result formatting survives throwing localization and non-finite counts', () => {
  const values = evaluateSmartStorage(`
    local ok = pcall(Events.OnServerCommand.handler, 'SmartStorage', 'result', {
      moved = 0 / 0, protected = math.huge, noDestination = -math.huge, failed = 3.9,
    })
    return ok, shown.text
  `, 2, {
    modules: ['result'],
    bootstrap: `
      Events = { OnServerCommand = { Add = function(handler) Events.OnServerCommand.handler = handler end } }
      getPlayer = function() return {} end
      HaloTextHelper = { addText = function(_, message) shown = { text = message } end }
      getText = function() error('translation unavailable') end
    `,
  });
  assert.deepEqual(values, [
    true,
    'Movidos: 0 | Protegidos: 0 | Sem destino: 0 | Falhas: 3',
  ]);
});
