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

// Kept as the contract seam for the Lua modules added by later tasks.
function loadSharedMapEnhancer({ modules = [], bootstrap = '' } = {}) {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  assert.equal(lauxlib.luaL_loadstring(state, to_luastring(bootstrap)), lua.LUA_OK);
  assert.equal(lua.lua_pcall(state, 0, 0, 0), lua.LUA_OK);
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
