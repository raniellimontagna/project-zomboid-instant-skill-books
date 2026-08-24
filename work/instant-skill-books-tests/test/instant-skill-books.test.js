const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
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
  '../../../mods/InstantSkillBooks/42/media/lua/shared/InstantSkillBooks/InstantSkillBooks.lua',
);
const metadataPath = path.resolve(
  __dirname,
  '../../../mods/InstantSkillBooks/42/mod.info',
);
const sandboxOptionsPath = path.resolve(
  __dirname,
  '../../../mods/InstantSkillBooks/42/media/sandbox-options.txt',
);
const translationPaths = {
  EN: path.resolve(
    __dirname,
    '../../../mods/InstantSkillBooks/42/media/lua/shared/Translate/EN/Sandbox.json',
  ),
  PTBR: path.resolve(
    __dirname,
    '../../../mods/InstantSkillBooks/42/media/lua/shared/Translate/PTBR/Sandbox.json',
  ),
};
const repositoryRoot = path.resolve(__dirname, '../../..');
const documentationPaths = [
  path.join(repositoryRoot, 'README.md'),
  path.join(repositoryRoot, 'mods/InstantSkillBooks/README.md'),
];

const documentedInstantLearningOptions = [
  ['InstantSkillBooks', 'true'],
  ['InstantRecipeMagazines', 'false'],
  ['InstantTechnicalManuals', 'false'],
  ['InstantEducationalVHS', 'false'],
];

const workshopMetadata = [
  'version=1',
  'id=3786090811',
  'title=Instant Skill Books [B42]',
  'description=Instant Learning v2.0.0 adds independently configurable instant completion for eligible skill books (enabled by default) and recipe magazines (disabled by default), while preserving Project Zomboid\'s native server-authoritative reading, completion, and XP handling. Technical manuals and educational VHS have visible disabled settings reserved for a future update and remain inactive. Install the same version on the server and every client. Requires Build 42.20 or newer.',
  'tags=Build 42;Multiplayer;Skills',
  'visibility=public',
  '',
].join('\n');
const requiredWorkshopEntries = [
  'preview.png',
  'workshop.txt',
  'Contents/mods/InstantSkillBooks/42/mod.info',
  'Contents/mods/InstantSkillBooks/42/media/sandbox-options.txt',
  'Contents/mods/InstantSkillBooks/42/media/lua/shared/Translate/EN/Sandbox.json',
  'Contents/mods/InstantSkillBooks/42/media/lua/shared/Translate/PTBR/Sandbox.json',
  'Contents/mods/InstantSkillBooks/42/media/lua/shared/InstantSkillBooks/InstantSkillBooks.lua',
];
const forbiddenPackagePathSegments = [
  'test',
  'tests',
  'node_modules',
  'docs',
  '.worktrees',
  'work',
];

function createWorkshopStagingFixture(temporaryPath) {
  const stagingPath = path.join(temporaryPath, 'InstantSkillBooks-Workshop');
  const modPath = path.join(stagingPath, 'Contents/mods/InstantSkillBooks');
  fs.mkdirSync(modPath, { recursive: true });
  fs.cpSync(path.join(repositoryRoot, 'mods/InstantSkillBooks'), modPath, { recursive: true });
  fs.mkdirSync(path.join(modPath, 'common'), { recursive: true });
  fs.copyFileSync(
    path.join(repositoryRoot, 'assets/instant-skill-books-cover.png'),
    path.join(stagingPath, 'preview.png'),
  );
  fs.writeFileSync(path.join(stagingPath, 'workshop.txt'), workshopMetadata);
  return { stagingPath, modPath };
}

function listRelativeFiles(rootPath) {
  return fs.readdirSync(rootPath, { recursive: true })
    .filter((entry) => fs.statSync(path.join(rootPath, entry)).isFile())
    .map((entry) => entry.split(path.sep).join('/'))
    .sort();
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(rootPath, archivePath) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entryName of listRelativeFiles(rootPath)) {
    const name = Buffer.from(entryName);
    const data = fs.readFileSync(path.join(rootPath, entryName));
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    const localPart = Buffer.concat([localHeader, name, data]);
    localParts.push(localPart);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(Buffer.concat([centralHeader, name]));
    localOffset += localPart.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(centralParts.length, 8);
  endOfCentralDirectory.writeUInt16LE(centralParts.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(localOffset, 16);
  fs.writeFileSync(
    archivePath,
    Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]),
  );
}

function readZipEntryNames(archivePath) {
  const archive = fs.readFileSync(archivePath);
  const endOffset = archive.length - 22;
  assert.equal(archive.readUInt32LE(endOffset), 0x06054b50, 'valid ZIP end record');
  const entryCount = archive.readUInt16LE(endOffset + 10);
  let offset = archive.readUInt32LE(endOffset + 16);
  const entries = [];

  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(archive.readUInt32LE(offset), 0x02014b50, 'valid ZIP central record');
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    entries.push(archive.subarray(offset + 46, offset + 46 + nameLength).toString());
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries.sort();
}

function assertPackageExcludesDevelopmentArtifacts(entries, packageName) {
  for (const forbiddenPathSegment of forbiddenPackagePathSegments) {
    assert.equal(
      entries.some((entry) => entry.split('/').includes(forbiddenPathSegment)),
      false,
      `${packageName} excludes ${forbiddenPathSegment}`,
    );
  }
}

const instantLearningOptions = [
  {
    name: 'InstantSkillBooks',
    defaultValue: 'true',
    page: 'InstantLearning',
    translation: 'InstantLearning_InstantSkillBooks',
  },
  {
    name: 'InstantRecipeMagazines',
    defaultValue: 'false',
    page: 'InstantLearning',
    translation: 'InstantLearning_InstantRecipeMagazines',
  },
  {
    name: 'InstantTechnicalManuals',
    defaultValue: 'false',
    page: 'InstantLearning',
    translation: 'InstantLearning_InstantTechnicalManuals',
  },
  {
    name: 'InstantEducationalVHS',
    defaultValue: 'false',
    page: 'InstantLearning',
    translation: 'InstantLearning_InstantEducationalVHS',
  },
];

function encodeLuaBoolean(value) {
  return value === undefined ? 'nil' : value ? 'true' : 'false';
}

function encodeInstantLearning(settings) {
  if (settings === undefined) {
    return '{}';
  }

  return `{ InstantSkillBooks = ${encodeLuaBoolean(settings.InstantSkillBooks)}, InstantRecipeMagazines = ${encodeLuaBoolean(settings.InstantRecipeMagazines)}, InstantTechnicalManuals = ${encodeLuaBoolean(settings.InstantTechnicalManuals)}, InstantEducationalVHS = ${encodeLuaBoolean(settings.InstantEducationalVHS)} }`;
}

function loadProduction({ server = false, instantLearning, instantLearningExpression } = {}) {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  const encodedInstantLearning = instantLearningExpression
    ?? (instantLearning === null ? 'nil' : encodeInstantLearning(instantLearning));

  const script = `
    require = function() end
    CharacterTrait = { ILLITERATE = "Illiterate" }
    SkillBook = {
      Mechanics = { perk = "Mechanics" },
    }
    SandboxVars = {
      InstantLearning = ${encodedInstantLearning},
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

function evaluateV2Case({ category, settings, settingsExpression, server = false }) {
  const state = loadProduction({
    server,
    instantLearning: settings,
    instantLearningExpression: settingsExpression,
  });
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
    learnedRecipesThrows: `
      getNumberOfPages = function() return 100 end,
      getLearnedRecipes = function()
        error("learned recipes unavailable")
      end,
    `,
    learnedRecipesIsEmptyThrows: `
      getNumberOfPages = function() return 100 end,
      getLearnedRecipes = function()
        return { isEmpty = function() error("recipe collection unavailable") end }
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
    return duration,
      ISReadABook.durationCalls,
      #diagnostics,
      diagnostics[1] == "[InstantLearning] eligibility check failed"
  `;

  const status = lauxlib.luaL_loadstring(state, to_luastring(script));
  assert.equal(status, lua.LUA_OK);
  assert.equal(lua.lua_pcall(state, 0, 4, 0), lua.LUA_OK);
  const result = {
    duration: lua.lua_tointeger(state, -4),
    durationCalls: lua.lua_tointeger(state, -3),
    diagnosticCount: lua.lua_tointeger(state, -2),
    hasNamespacedDiagnostic: lua.lua_toboolean(state, -1),
  };
  lua.lua_pop(state, 4);
  return result;
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
      diagnostics[1] == "[InstantLearning] eligibility check failed"
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

test('v2 settings fail safely for malformed values and recipe capability API errors', () => {
  const nonTableSkill = evaluateV2Case({
    category: 'skill',
    settingsExpression: '"not a table"',
  });
  assert.equal(nonTableSkill.duration, 1, 'non-table settings retain skill-book default');
  assert.equal(nonTableSkill.durationCalls, 1);
  assert.equal(nonTableSkill.diagnosticCount, 0);

  const invalidSkillOption = evaluateV2Case({
    category: 'skill',
    settingsExpression: '{ InstantSkillBooks = "enabled" }',
  });
  assert.equal(invalidSkillOption.duration, 1, 'invalid skill option retains default');
  assert.equal(invalidSkillOption.durationCalls, 1);
  assert.equal(invalidSkillOption.diagnosticCount, 0);

  const invalidRecipeOption = evaluateV2Case({
    category: 'recipe',
    settingsExpression: '{ InstantRecipeMagazines = "enabled" }',
  });
  assert.equal(invalidRecipeOption.duration, 777, 'invalid recipe option retains default');
  assert.equal(invalidRecipeOption.durationCalls, 1);
  assert.equal(invalidRecipeOption.diagnosticCount, 0);

  for (const category of ['learnedRecipesThrows', 'learnedRecipesIsEmptyThrows']) {
    const serverResult = evaluateV2Case({
      category,
      settings: { InstantRecipeMagazines: true },
      server: true,
    });
    assert.equal(serverResult.duration, 777, `${category}: vanilla fallback`);
    assert.equal(serverResult.durationCalls, 1, `${category}: vanilla called once`);
    assert.equal(serverResult.diagnosticCount, 1, `${category}: server diagnostic`);
    assert.equal(serverResult.hasNamespacedDiagnostic, true, `${category}: diagnostic prefix`);

    const clientResult = evaluateV2Case({
      category,
      settings: { InstantRecipeMagazines: true },
      server: false,
    });
    assert.equal(clientResult.duration, 777, `${category}: client vanilla fallback`);
    assert.equal(clientResult.durationCalls, 1, `${category}: client vanilla called once`);
    assert.equal(clientResult.diagnosticCount, 0, `${category}: client has no diagnostic`);
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

test('Build 42 sandbox metadata registers all Instant Learning options', () => {
  const sandboxOptions = fs.readFileSync(sandboxOptionsPath, 'utf8');
  assert.match(sandboxOptions, /^VERSION\s*=\s*1\s*,/m);

  for (const { name, defaultValue, page, translation } of instantLearningOptions) {
    const optionPattern = new RegExp(
      `option\\s+InstantLearning\\.${name}\\s*\\{[^}]*type\\s*=\\s*boolean[^}]*default\\s*=\\s*${defaultValue}\\b[^}]*page\\s*=\\s*${page}\\b[^}]*translation\\s*=\\s*${translation}\\b[^}]*\\}`,
    );
    assert.match(
      sandboxOptions,
      optionPattern,
      `${name} metadata includes exact page and translation`,
    );
  }
});

test('Instant Learning sandbox options have English and Brazilian Portuguese labels and tooltips', () => {
  const translations = Object.fromEntries(
    Object.entries(translationPaths).map(([locale, filePath]) => {
      assert.equal(fs.existsSync(filePath), true, `${locale} translation exists`);
      return [locale, JSON.parse(fs.readFileSync(filePath, 'utf8'))];
    }),
  );

  for (const locale of ['EN', 'PTBR']) {
    const pageLabel = translations[locale].Sandbox_InstantLearning;
    assert.equal(typeof pageLabel, 'string', `${locale} Sandbox_InstantLearning label`);
    assert.notEqual(pageLabel.trim(), '', `${locale} Sandbox_InstantLearning label is non-empty`);
  }

  for (const { name } of instantLearningOptions) {
    for (const locale of ['EN', 'PTBR']) {
      const translation = translations[locale];
      const labelKey = `Sandbox_InstantLearning_${name}`;
      const tooltipKey = `${labelKey}_tooltip`;
      assert.equal(typeof translation[labelKey], 'string', `${locale} ${labelKey} label`);
      assert.notEqual(translation[labelKey].trim(), '', `${locale} ${labelKey} label is non-empty`);
      assert.equal(typeof translation[tooltipKey], 'string', `${locale} ${tooltipKey} tooltip`);
      assert.notEqual(translation[tooltipKey].trim(), '', `${locale} ${tooltipKey} tooltip is non-empty`);
    }
  }
});

test('v2 documentation publishes all settings, defaults, version, and Workshop ID', () => {
  for (const documentationPath of documentationPaths) {
    const documentation = fs.readFileSync(documentationPath, 'utf8');
    assert.match(documentation, /2\.0\.0/, `${path.basename(documentationPath)} names v2`);
    assert.match(documentation, /3786090811/, `${path.basename(documentationPath)} names Workshop ID`);

    for (const [name, defaultValue] of documentedInstantLearningOptions) {
      assert.match(
        documentation,
        new RegExp(`\\\`${name}\\\`[^\\n]*\\\`${defaultValue}\\\``),
        `${path.basename(documentationPath)} documents ${name} default`,
      );
    }
  }

  const metadata = fs.readFileSync(metadataPath, 'utf8');
  assert.match(metadata, /^modversion=2\.0\.0$/m);
});

test('Workshop package fixture is hermetic and its ZIP has only release entries', () => {
  const temporaryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'instant-skill-books-workshop-'));
  try {
    const { stagingPath, modPath } = createWorkshopStagingFixture(temporaryPath);
    const fixtureMetadata = Object.fromEntries(
      fs
      .readFileSync(path.join(stagingPath, 'workshop.txt'), 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('=');
        assert.notEqual(separator, -1, `workshop metadata line is key=value: ${line}`);
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
    );
    assert.equal(fixtureMetadata.version, '1');
    assert.equal(fixtureMetadata.id, '3786090811');
    assert.equal(fixtureMetadata.visibility, 'public');
    assert.match(fixtureMetadata.description, /Instant Learning v2\.0\.0/);

    const stagedFiles = listRelativeFiles(stagingPath);
    for (const requiredEntry of requiredWorkshopEntries) {
      assert.equal(
        stagedFiles.includes(requiredEntry),
        true,
        `staging includes ${requiredEntry}`,
      );
    }
    assert.match(fs.readFileSync(path.join(modPath, '42/mod.info'), 'utf8'), /^modversion=2\.0\.0$/m);
    assertPackageExcludesDevelopmentArtifacts(stagedFiles, 'staging');

    const archivePath = path.join(temporaryPath, 'InstantSkillBooks-Workshop-Ready-v2.zip');
    createStoredZip(stagingPath, archivePath);
    const archiveEntries = readZipEntryNames(archivePath);
    assert.deepEqual(archiveEntries, stagedFiles, 'ZIP contains the complete staging fixture');
    for (const requiredEntry of requiredWorkshopEntries) {
      assert.equal(archiveEntries.includes(requiredEntry), true, `ZIP includes ${requiredEntry}`);
    }
    assertPackageExcludesDevelopmentArtifacts(archiveEntries, 'ZIP');
  } finally {
    fs.rmSync(temporaryPath, { recursive: true, force: true });
  }
});

test('repository migration keeps Instant Skill Books under mods and preserves published identity', () => {
  assert.equal(fs.existsSync(path.join(repositoryRoot, 'mods/InstantSkillBooks')), true);
  assert.equal(fs.existsSync(path.join(repositoryRoot, 'InstantSkillBooks')), false);

  const metadata = Object.fromEntries(
    fs.readFileSync(metadataPath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
  assert.equal(metadata.id, 'InstantSkillBooks');
  assert.equal(metadata.modversion, '2.0.0');
  assert.equal(metadata.pzversion, '42.20');
  assert.equal(metadata.versionMin, '42.20.0');
});
