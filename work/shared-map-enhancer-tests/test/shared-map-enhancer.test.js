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
