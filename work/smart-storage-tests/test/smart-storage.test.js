const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { lauxlib, lua, lualib, to_luastring } = require('fengari');

const repositoryRoot = path.resolve(__dirname, '../../..');
const smartStorageRoot = path.join(repositoryRoot, 'mods/SmartStorage');
const metadataPath = path.join(smartStorageRoot, '42/mod.info');
const readmePath = path.join(smartStorageRoot, 'README.md');

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
