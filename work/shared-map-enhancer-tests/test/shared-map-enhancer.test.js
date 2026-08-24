const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { lauxlib, lua, lualib, to_luastring } = require('fengari');

const repositoryRoot = path.resolve(__dirname, '../../..');
const metadataPath = path.join(repositoryRoot, 'mods/SharedMapEnhancer/42/mod.info');
const readMetadata = (filePath) => Object.fromEntries(
  fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).map((line) => {
    const separator = line.indexOf('=');
    assert.notEqual(separator, -1, `metadata line is key=value: ${line}`);
    return [line.slice(0, separator), line.slice(separator + 1)];
  }),
);

const luaRoot = path.join(repositoryRoot, 'mods/SharedMapEnhancer/42/media/lua');

function luaError(state, fallback) {
  return lua.lua_tojsstring(state, -1) || fallback;
}

function luaFiles(rootPath) {
  return fs.readdirSync(rootPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(rootPath, entry.name);
    return entry.isDirectory() ? luaFiles(entryPath) : [entryPath];
  }).filter((filePath) => path.extname(filePath).toLowerCase() === '.lua');
}

function resolveLuaModule(moduleName) {
  assert.equal(typeof moduleName, 'string', 'Lua module name must be a string');
  const normalized = moduleName.replace(/\\/g, '/').replace(/\.lua$/i, '').toLowerCase();
  const matches = luaFiles(luaRoot).filter((filePath) => {
    const relative = path.relative(luaRoot, filePath).replace(/\\/g, '/').replace(/\.lua$/i, '').toLowerCase();
    return relative === normalized || path.posix.basename(relative) === normalized;
  });
  assert.equal(matches.length, 1, matches.length === 0
    ? `Unknown Shared Map Enhancer Lua module: ${moduleName}`
    : `Ambiguous Shared Map Enhancer Lua module: ${moduleName}`);
  return matches[0];
}

// Loads selected source files into one shared Fengari state for later task contracts.
function loadSharedMapEnhancer({ modules = [], bootstrap = '' } = {}) {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  assert.equal(lauxlib.luaL_loadstring(state, to_luastring(bootstrap)), lua.LUA_OK);
  if (lua.lua_pcall(state, 0, 0, 0) !== lua.LUA_OK) {
    throw new Error(`Shared Map Enhancer bootstrap failed: ${luaError(state, 'unknown error')}`);
  }
  for (const moduleName of modules) {
    const sourcePath = resolveLuaModule(moduleName);
    const source = fs.readFileSync(sourcePath, 'utf8');
    if (lauxlib.luaL_loadstring(state, to_luastring(source)) !== lua.LUA_OK) {
      throw new Error(`Shared Map Enhancer module ${moduleName} failed to load: ${luaError(state, 'unknown error')}`);
    }
    if (lua.lua_pcall(state, 0, 0, 0) !== lua.LUA_OK) {
      throw new Error(`Shared Map Enhancer module ${moduleName} failed at runtime: ${luaError(state, 'unknown error')}`);
    }
  }
  return { state, modules };
}

function evaluateLua(expression, nresults = lua.LUA_MULTRET, options = {}) {
  const { state } = loadSharedMapEnhancer(options);
  assert.equal(lauxlib.luaL_loadstring(state, to_luastring(expression)), lua.LUA_OK);
  assert.equal(lua.lua_pcall(state, 0, nresults, 0), lua.LUA_OK, luaError(state, 'evaluation failed'));
  const count = nresults === lua.LUA_MULTRET ? lua.lua_gettop(state) : nresults;
  const values = [];
  for (let index = count; index >= 1; index -= 1) {
    const type = lua.lua_type(state, -index);
    values.push(type === lua.LUA_TBOOLEAN ? lua.lua_toboolean(state, -index)
      : type === lua.LUA_TNUMBER ? Number(lua.lua_tonumber(state, -index))
        : type === lua.LUA_TSTRING ? lua.lua_tojsstring(state, -index)
          : type === lua.LUA_TNIL ? null : undefined);
  }
  return values;
}

test('metadata has the exact independent B42 identity', () => {
  assert.deepEqual(readMetadata(metadataPath), {
    name: 'Shared Map Enhancer B42',
    id: 'SharedMapEnhancer',
    modversion: '0.1.0',
    pzversion: '42.20',
    versionMin: '42.20.0',
  });
});

test('README documents independent local server-authoritative MVP installation', () => {
  const readme = fs.readFileSync(path.join(repositoryRoot, 'mods/SharedMapEnhancer/README.md'), 'utf8');
  for (const phrase of ['local installation', 'server-authoritative', 'Base', 'Loot', 'Danger', 'Vehicle', 'Medicine', 'Fuel', 'Expedition']) {
    assert.match(readme, new RegExp(phrase, 'i'), `README contains ${phrase}`);
  }
  assert.match(readme, /no Workshop (?:manifest or )?Workshop ID/i);
  assert.match(readme, /two-client.*acceptance|acceptance.*two-client/i);
});

test('root index lists all three independent mods without identity drift', () => {
  const rootReadme = fs.readFileSync(path.join(repositoryRoot, 'README.md'), 'utf8');
  assert.match(rootReadme, /Instant Skill Books/);
  assert.match(rootReadme, /Smart Storage/);
  assert.match(rootReadme, /Shared Map Enhancer/);
  assert.match(rootReadme, /3786090811/);
  assert.match(rootReadme, /SharedMapEnhancer/);
});

test('roadmap marks Shared Map Enhancer as the third mod in progress', () => {
  const roadmap = fs.readFileSync(path.join(repositoryRoot, 'docs/superpowers/specs/2026-08-23-coop-quality-of-life-roadmap.md'), 'utf8');
  assert.match(roadmap, /third mod.*in progress|Shared Map Enhancer.*in progress/i);
  assert.match(roadmap, /Workshop upload.*two-client.*acceptance|two-client.*Workshop upload/i);
  assert.match(roadmap, /Shared Map Enhancer B42/);
});

test('test harness is private CommonJS with the required script and Fengari', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, 'commonjs');
  assert.equal(pkg.scripts.test, 'node --test');
  assert.deepEqual(pkg.devDependencies, { fengari: '0.1.4' });
  assert.equal(typeof loadSharedMapEnhancer, 'function');
});

test('selected Lua modules load into the shared Fengari state', () => {
  const { state } = loadSharedMapEnhancer({ modules: ['TestFixture'] });
  assert.equal(lauxlib.luaL_loadstring(state, to_luastring('return SharedMapEnhancerTestFixture')), lua.LUA_OK);
  assert.equal(lua.lua_pcall(state, 0, 1, 0), lua.LUA_OK);
  assert.equal(lua.lua_tojsstring(state, -1), 'loaded');
});

const validCreate = `{
  requestId = 'r1', category = 'Base', title = '  Camp  ', note = '  safe  ',
  icon = 'House', color = 'green', x = 12, y = 34, z = 0, duration = '1h'
}`;

test('constants expose the exact MVP allowlists', () => {
  assert.deepEqual(evaluateLua(`return table.concat(Constants.categories, ','), table.concat(Constants.colors, ','), table.concat(Constants.icons, ','), table.concat(Constants.durations, ',')`, 4, { modules: ['constants'] }), [
    'Base,Loot,Danger,Vehicle,Medicine,Fuel,Expedition',
    'white,red,orange,yellow,green,cyan,blue,purple',
    'House,Target,Skull,SteeringWheel,MedCross,Fuel,Tent,Question,Star,Cross,Exclamation',
    'permanent,1h,8h,24h,7d',
  ]);
});

test('normalization trims editable text and converts duration', () => {
  assert.deepEqual(evaluateLua(`local m, r = Validation.normalizeCreate(${validCreate}, 1000, {}); return m.title, m.note, m.expiresAt, r`, 4, { modules: ['constants', 'validation'] }), ['Camp', 'safe', 4600, null]);
});

test('normalization rejects client authoritative and unknown fields', () => {
  assert.deepEqual(evaluateLua(`local a = ${validCreate}; a.id = 'evil'; local m, r = Validation.normalizeCreate(a, 1000, {}); return m, r`, 2, { modules: ['constants', 'validation'] }), [null, 'invalid_request']);
  assert.deepEqual(evaluateLua(`local a = ${validCreate}; a.extra = true; local m, r = Validation.normalizeCreate(a, 1000, {}); return m, r`, 2, { modules: ['constants', 'validation'] }), [null, 'invalid_request']);
});

test('normalization enforces text, finite integer coordinates, and allowlists', () => {
  assert.deepEqual(evaluateLua(`local a = ${validCreate}; a.title = ' '; local m, r = Validation.normalizeCreate(a, 1000, {}); return m, r`, 2, { modules: ['constants', 'validation'] }), [null, 'invalid_text']);
  assert.deepEqual(evaluateLua(`local a = ${validCreate}; a.x = 1.5; local m, r = Validation.normalizeCreate(a, 1000, {}); return m, r`, 2, { modules: ['constants', 'validation'] }), [null, 'invalid_coordinates']);
  assert.deepEqual(evaluateLua(`local a = ${validCreate}; a.category = 'Unknown'; local m, r = Validation.normalizeCreate(a, 1000, {}); return m, r`, 2, { modules: ['constants', 'validation'] }), [null, 'invalid_category']);
  assert.deepEqual(evaluateLua(`local a = ${validCreate}; a.icon = 'Unknown'; local m, r = Validation.normalizeCreate(a, 1000, {}); return m, r`, 2, { modules: ['constants', 'validation'] }), [null, 'invalid_icon']);
});

test('normalization handles permanent and all finite durations', () => {
  assert.deepEqual(evaluateLua(`local a = ${validCreate}; a.duration = 'permanent'; local p = Validation.normalizeCreate(a, 1000, {}); a.duration = '8h'; local h = Validation.normalizeCreate(a, 1000, {}); a.duration = '24h'; local d = Validation.normalizeCreate(a, 1000, {}); return p.expiresAt, h.expiresAt, d.expiresAt`, 3, { modules: ['constants', 'validation'] }), [null, 29800, '87400']);
});

test('request shapes and marker validity reject malformed or expired values', () => {
  assert.deepEqual(evaluateLua(`local ok, r = Validation.validateRequestShape('create', ${validCreate}); local bad, br = Validation.validateRequestShape('remove', { requestId = 'x', id = 'i', extra = true }); return ok, r, bad, br`, 4, { modules: ['constants', 'validation'] }), [true, null, false, 'invalid_request']);
  assert.deepEqual(evaluateLua(`local m = ${validCreate}; m.requestId = nil; m.duration = nil; m.createdBy = 'p'; m.id = 'i'; m.createdAt = 1; m.revision = 1; m.expiresAt = 2; local ok, r = Validation.isValidMarker(m, 3); return ok, r`, 2, { modules: ['constants', 'validation'] }), [false, 'expired']);
  assert.deepEqual(evaluateLua(`local m = ${validCreate}; m.requestId = nil; m.duration = nil; m.createdBy = 'p'; m.id = 'i'; m.createdAt = 1; m.revision = 1; m.note = false; local ok, r = Validation.isValidMarker(m, 0); return ok, r`, 2, { modules: ['constants', 'validation'] }), [false, 'invalid_text']);
});

test('normalization preserves server fields during update and enforces marker limit', () => {
  assert.deepEqual(evaluateLua(`local e = { id='i', createdBy='p', createdAt=50, revision=2, category='Base', title='Old', note='', icon='House', color='green', x=1, y=2, z=0, expiresAt=nil }; local a = { requestId='u', id='i', category='Loot', title=' New ', note='', icon='Tent', color='red', duration='8h' }; local m, r = Validation.normalizeUpdate(a, e, 100, {}); return m.id, m.createdBy, m.createdAt, m.revision, m.title, m.expiresAt, r`, 7, { modules: ['constants', 'validation'] }), ['i', 'p', 50, 2, 'New', 28900, null]);
  assert.deepEqual(evaluateLua(`local m, r = Validation.normalizeCreate(${validCreate}, 1000, { markerCount = 500, maxMarkers = 500 }); return m, r`, 2, { modules: ['constants', 'validation'] }), [null, 'limit_reached']);
});
