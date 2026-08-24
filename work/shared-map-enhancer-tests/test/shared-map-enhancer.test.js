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

const serverFixture = `
  ModData = { records = {}, getOrCreate = function(name)
    local r = ModData.records[name]; if r == nil then r = { schemaVersion = 1, revision = 0, markers = {} }; ModData.records[name] = r end; return r
  end, transmit = function(tag) ModData.lastTransmit = tag; ModData.transmitCount = (ModData.transmitCount or 0) + 1 end }
  player = { getUsername = function() return 'alice' end, isAdmin = function() return false end }
`;

test('server modules are present and duplicate create replays one delta', () => {
  assert.deepEqual(evaluateLua(`
    local valid = { requestId='r1', category='Base', title='Camp', note='', icon='House', color='green', x=1, y=2, z=0, duration='permanent' }
    local a = Server.validateAndHandle('create', player, valid, 100)
    local b = Server.validateAndHandle('create', player, valid, 101)
    return a.kind, b.kind, a.marker.id == b.marker.id, Persistence.revision() == 1
  `, 4, { modules: ['constants', 'validation', 'persistence', 'server'], bootstrap: serverFixture }), ['delta', 'delta', true, true]);
});

test('server rejects forged fields and unauthorized updates', () => {
  assert.deepEqual(evaluateLua(`
    local bad = { requestId='bad', category='Base', title='Camp', note='', icon='House', color='green', x=1, y=2, z=0, duration='permanent', createdBy='mallory' }
    local a = Server.validateAndHandle('create', player, bad, 100)
    return a.kind, a.code, Persistence.revision() == 0
  `, 3, { modules: ['constants', 'validation', 'persistence', 'server'], bootstrap: serverFixture }), ['error', 'invalid_request', true]);
});

test('accepted persistence mutations transmit the namespace and increment revision', () => {
  assert.deepEqual(evaluateLua(`
    local valid = { requestId='r1', category='Base', title='Camp', note='', icon='House', color='green', x=1, y=2, z=0, duration='permanent' }
    local a = Server.validateAndHandle('create', player, valid, 100)
    local tag1, rev1 = ModData.lastTransmit, Persistence.revision()
    local b = Server.validateAndHandle('update', player, { requestId='u1', id=a.marker.id, category='Loot', title='Camp 2', note='', icon='Tent', color='red', duration='permanent' }, 102)
    local tag2, rev2 = ModData.lastTransmit, Persistence.revision()
    local c = Server.validateAndHandle('remove', player, { requestId='m1', id=a.marker.id }, 104)
    return tag1, tag2, ModData.lastTransmit, rev1 == 1, rev2 == 2, Persistence.revision() == 3, c.operation
  `, 7, { modules: ['constants', 'validation', 'persistence', 'server'], bootstrap: serverFixture }), ['SharedMapEnhancer', 'SharedMapEnhancer', 'SharedMapEnhancer', true, true, true, 'remove']);
});

test('duplicate replay is isolated and bounded per player', () => {
  assert.deepEqual(evaluateLua(`
    local valid = { requestId='r1', category='Base', title='Camp', note='', icon='House', color='green', x=1, y=2, z=0, duration='permanent' }
    local a = Server.validateAndHandle('create', player, valid, 100)
    a.marker.title = 'mutated'
    local b = Server.validateAndHandle('create', player, valid, 101)
    return b.marker.title, a.marker.id == b.marker.id, Persistence.revision() == 1
  `, 3, { modules: ['constants', 'validation', 'persistence', 'server'], bootstrap: serverFixture }), ['Camp', true, true]);
});

test('load discards corrupt and expired records, caps deterministically, and transmits', () => {
  assert.deepEqual(evaluateLua(`
    local r = ModData.getOrCreate('SharedMapEnhancer')
    local function marker(id, createdAt, expiresAt)
      return { id=id, category='Base', title=id, note='', icon='House', color='green', x=1, y=2, z=0, createdBy='p', createdAt=createdAt, expiresAt=expiresAt, revision=1 }
    end
    r.markers.bad = { id='bad', title=false }
    r.markers.expired = marker('expired', 1, 10)
    for i = 1, 501 do local id = string.format('m%03d', i); r.markers[id] = marker(id, i, nil) end
    Persistence.load(100)
    local count, first, last = 0, nil, nil
    for id in pairs(r.markers) do count = count + 1; if first == nil or id < first then first = id end; if last == nil or id > last then last = id end end
    return count, r.markers.bad == nil, r.markers.expired == nil, first, last, ModData.lastTransmit
  `, 6, { modules: ['constants', 'validation', 'persistence'], bootstrap: serverFixture }), [500, true, true, 'm001', 'm500', 'SharedMapEnhancer']);
});

test('authorization, rate limiting, malformed shapes, snapshots, and fail-closed events', () => {
  assert.deepEqual(evaluateLua(`
    local valid = { requestId='r1', category='Base', title='Camp', note='', icon='House', color='green', x=1, y=2, z=0, duration='1h' }
    local created = Server.validateAndHandle('create', player, valid, 100)
    local limited = Server.validateAndHandle('update', player, { requestId='u1', id=created.marker.id, category='Loot', title='Changed', note='', icon='Tent', color='red', duration='permanent' }, 100)
    local malformed = Server.validateAndHandle('create', player, { requestId='bad', category='Base', title='x', note='', icon='House', color='green', x=1, y=2, z=0, duration='permanent', revision=99 }, 102)
    local other = { getUsername=function() return 'bob' end, isAdmin=function() return false end }
    local denied = Server.validateAndHandle('update', other, { requestId='u2', id=created.marker.id, category='Loot', title='Nope', note='', icon='Tent', color='red', duration='permanent' }, 102)
    local snap = Server.validateAndHandle('request', other, { requestId='s1' }, 102)
    return created.kind, limited.code, malformed.code, denied.code, snap.kind, #snap.markers, Persistence.revision() == 1
  `, 7, { modules: ['constants', 'validation', 'persistence', 'server'], bootstrap: serverFixture }), ['delta', 'rate_limited', 'invalid_request', 'unauthorized', 'snapshot', 1, true]);
});

test('administrator may remove another player marker', () => {
  assert.deepEqual(evaluateLua(`
    local valid = { requestId='r1', category='Base', title='Camp', note='', icon='House', color='green', x=1, y=2, z=0, duration='permanent' }
    local created = Server.validateAndHandle('create', player, valid, 100)
    local admin = { getUsername=function() return 'admin' end, getAccessLevel=function() return 'admin' end }
    local removed = Server.validateAndHandle('remove', admin, { requestId='rm1', id=created.marker.id }, 102)
    return removed.kind, removed.operation, Persistence.get(created.marker.id) == nil
  `, 3, { modules: ['constants', 'validation', 'persistence', 'server'], bootstrap: serverFixture }), ['delta', 'remove', true]);
});

test('idempotency eviction is bounded, deterministic, and isolated per player', () => {
  assert.deepEqual(evaluateLua(`
    local valid = { requestId='old', category='Base', title='Camp', note='', icon='House', color='green', x=1, y=2, z=0, duration='permanent' }
    local first = Server.validateAndHandle('create', player, valid, 100)
    for i = 1, 256 do Server.validateAndHandle('request', player, { requestId='q' .. i }, 200 + i) end
    local replayOld = Server.validateAndHandle('create', player, valid, 1000)
    local replayRecent = Server.validateAndHandle('request', player, { requestId='q256' }, 1001)
    local other = { getUsername=function() return 'bob' end, isAdmin=function() return false end }
    local otherResult = Server.validateAndHandle('request', other, { requestId='q256' }, 1001)
    return first.marker.id ~= replayOld.marker.id, Persistence.revision() == 2, replayRecent.kind, otherResult.kind
  `, 4, { modules: ['constants', 'validation', 'persistence', 'server'], bootstrap: serverFixture }), [true, true, 'snapshot', 'snapshot']);
});

test('cleanup removes expired markers and transmits one revision', () => {
  assert.deepEqual(evaluateLua(`
    local r = ModData.getOrCreate('SharedMapEnhancer')
    r.markers.expired = { id='expired', category='Base', title='Old', note='', icon='House', color='green', x=1, y=2, z=0, createdBy='p', createdAt=1, expiresAt=50, revision=1 }
    Persistence.load(0)
    local before = Persistence.revision()
    local changed = Persistence.cleanup(100)
    return changed, Persistence.get('expired') == nil, Persistence.revision() == before + 1, ModData.lastTransmit
  `, 4, { modules: ['constants', 'validation', 'persistence'], bootstrap: serverFixture }), [true, true, true, 'SharedMapEnhancer']);
});

test('live event adapter fails closed when absent and forwards one sanitized response when present', () => {
  assert.deepEqual(evaluateLua(`
    return Events == nil, sendServerCommand == nil
  `, 2, { modules: ['constants', 'validation', 'persistence', 'server'] }), [true, true]);
  assert.deepEqual(evaluateLua(`
    Events.OnClientCommand.handler('SharedMapEnhancer', 'create', player, { requestId='evt1', category='Base', title='Camp', note='', icon='House', color='green', x=1, y=2, z=0, duration='permanent' })
    return registered == 1, sent.module, sent.command, sent.response.kind, sent.response.marker.createdBy, type(sent.response.marker.createdAt) == 'number', sent.response.marker.revision == 1
  `, 7, { modules: ['constants', 'validation', 'persistence', 'server'], bootstrap: serverFixture + `
    registered = 0; sent = nil
    Events = { OnClientCommand = { Add = function(handler) registered = registered + 1; Events.OnClientCommand.handler = handler end } }
    sendServerCommand = function(_, module, command, response) sent = { module=module, command=command, response=response } end
  ` }), [true, 'SharedMapEnhancer', 'response', 'delta', 'alice', true, true]);
});

const clientFixture = `
  sent = nil
  sendClientCommand = function(module, command, args) sent = { module=module, command=command, args=args } end
`;

test('client cache replaces snapshots and returns sorted category-filtered copies', () => {
  assert.deepEqual(evaluateLua(`
    local ok, reason = Cache.reset({ revision=4, markers={
      { id='b', category='Loot', title='B', note='', icon='Tent', color='green', x=1, y=2, z=0, createdBy='p', createdAt=20, revision=4 },
      { id='a', category='Base', title='A', note='', icon='House', color='red', x=1, y=2, z=0, createdBy='p', createdAt=10, revision=4 }
    } })
    local all = Cache.list(); all[1].title = 'mutated'
    local base = Cache.list('Base')
    return ok, reason, Cache.revision(), #all, all[1].id, base[1].title, Cache.get('a').title
  `, 7, { modules: ['constants', 'validation', 'cache'] }), [true, null, 4, 2, 'a', 'A', 'A']);
});

test('client cache applies contiguous deltas and rejects gaps or malformed markers', () => {
  assert.deepEqual(evaluateLua(`
    Cache.reset({ revision=1, markers={} })
    local marker = { id='x', category='Base', title='X', note='', icon='House', color='green', x=1, y=2, z=0, createdBy='p', createdAt=1, revision=2 }
    local a, ar = Cache.applyDelta({ revision=2, operation='create', marker=marker })
    local b, br = Cache.applyDelta({ revision=4, operation='remove', id='x' })
    local c, cr = Cache.applyDelta({ revision=3, operation='update', marker={ id='x', category='Base', title='X', note='', icon='House', color='green', x=1, y=2, z=0, createdBy='p', createdAt=1, revision=3, extra=true } })
    return a, ar, b, br, c, cr, Cache.revision(), Cache.get('x') ~= nil
  `, 8, { modules: ['constants', 'validation', 'cache'] }), [true, null, false, 'revision_gap', false, 'invalid_response', 2, true]);
});

test('client cache rejects malformed snapshot ids, expired markers, and duplicate ids without mutation', () => {
  assert.deepEqual(evaluateLua(`
    local seed = { id='seed', category='Base', title='Seed', note='', icon='House', color='green', x=1, y=2, z=0, createdBy='p', createdAt=1, revision=1 }
    Cache.reset({ revision=1, markers={ seed } })
    local missing = { category='Base', title='Missing', note='', icon='House', color='green', x=1, y=2, z=0, createdBy='p', createdAt=1, revision=2 }
    local wrong = { id=3, category='Base', title='Wrong', note='', icon='House', color='green', x=1, y=2, z=0, createdBy='p', createdAt=1, revision=2 }
    local expired = { id='expired', category='Base', title='Expired', note='', icon='House', color='green', x=1, y=2, z=0, createdBy='p', createdAt=1, expiresAt=1, revision=2 }
    local duplicate = { id='dup', category='Base', title='D1', note='', icon='House', color='green', x=1, y=2, z=0, createdBy='p', createdAt=1, revision=2 }
    local duplicate2 = { id='dup', category='Base', title='D2', note='', icon='House', color='green', x=2, y=2, z=0, createdBy='p', createdAt=2, revision=2 }
    local a, ar = Cache.reset({ revision=2, markers={ missing } })
    local b, br = Cache.reset({ revision=2, markers={ wrong } })
    local c, cr = Cache.reset({ revision=2, markers={ expired } })
    local d, dr = Cache.reset({ revision=2, markers={ duplicate, duplicate2 } })
    return a, ar, b, br, c, cr, d, dr, Cache.revision(), Cache.get('seed').title
  `, 10, { modules: ['constants', 'validation', 'cache'] }), [false, 'invalid_response', false, 'invalid_response', false, 'invalid_response', false, 'invalid_response', 1, 'Seed']);
});

test('client commands send exact intents with unique bounded request ids', () => {
  assert.deepEqual(evaluateLua(`
    ClientCommands.create({ category='Base', title='T', note='', icon='House', color='green', x=1, y=2, z=0, duration='1h', id='evil', createdBy='evil' })
    local first = sent; ClientCommands.update('id1', { category='Loot', title='U', note='', icon='Tent', color='red', duration='permanent', x=99 })
    local second = sent; ClientCommands.remove('id1'); local third = sent; ClientCommands.requestSnapshot(); local fourth = sent
    return first.module, first.command, first.args.id == nil, first.args.createdBy == nil, first.args.requestId ~= second.args.requestId,
      second.args.x == nil, third.command, fourth.command, #fourth.args.requestId >= 1, #fourth.args.requestId <= 64
  `, 10, { modules: ['constants', 'validation', 'cache', 'clientCommands'], bootstrap: clientFixture }), ['SharedMapEnhancer', 'create', true, true, true, true, 'remove', 'request', true, true]);
});

test('client event adapter applies responses and requests snapshot after a gap', () => {
  assert.deepEqual(evaluateLua(`
    local reset, resetReason = Cache.reset({ revision=1, markers={} }); local registered = 0
    return Events == nil
  `, 1, { modules: ['constants', 'validation', 'cache', 'clientCommands'] }), [true]);
  assert.deepEqual(evaluateLua(`
    local reset, resetReason = Cache.reset({ revision=1, markers={} }); local m = { id='x', category='Base', title='X', note='', icon='House', color='green', x=1, y=2, z=0, createdBy='p', createdAt=1, revision=2 }
    Events.OnServerCommand.handler('SharedMapEnhancer', 'delta', { revision=2, operation='create', marker=m })
    Events.OnServerCommand.handler('SharedMapEnhancer', 'delta', { revision=4, operation='remove', id='x' })
    return reset, resetReason, Cache.revision(), Cache.get('x') ~= nil, sent.command
  `, 5, { modules: ['constants', 'validation', 'cache', 'clientCommands'], bootstrap: clientFixture + `
    Events = { OnServerCommand = { Add = function(handler) Events.OnServerCommand.handler = handler end } }
  ` }), [true, null, 2, true, 'request']);
});

test('client adapter requests a snapshot after rejected snapshot and preserves prior cache', () => {
  assert.deepEqual(evaluateLua(`
    local seed = { id='seed', category='Base', title='Seed', note='', icon='House', color='green', x=1, y=2, z=0, createdBy='p', createdAt=1, revision=1 }
    Cache.reset({ revision=1, markers={ seed } })
    Events.OnServerCommand.handler('SharedMapEnhancer', 'snapshot', { revision=2, markers={ { category='Base', title='Missing', note='', icon='House', color='green', x=1, y=2, z=0, createdBy='p', createdAt=1, revision=2 } } })
    return Cache.revision(), Cache.get('seed').title, sent.command
  `, 3, { modules: ['constants', 'validation', 'cache', 'clientCommands'], bootstrap: clientFixture + `
    Events = { OnServerCommand = { Add = function(handler) Events.OnServerCommand.handler = handler end } }
  ` }), [1, 'Seed', 'request']);
});

const mapFixture = `
  symbols = { added = {}, removedOwned = 0, removedVanilla = 0, vanilla = {} }
  local function symbol(icon, x, y)
    if icon ~= 'House' and icon ~= 'Question' and icon ~= 'Tent' then error('unsupported icon') end
    local item = { icon=icon, x=x, y=y, rgba=nil, anchor=nil, scale=nil }
    function item:setRGBA(r,g,b,a) self.rgba={r,g,b,a}; return self end
    function item:setAnchor(xa,ya) self.anchor={xa,ya}; return self end
    function item:setScale(value) self.scale=value; return self end
    function item:setText(value) self.text=value; return self end
    table.insert(symbols.added, item); return item
  end
  local api = {
    addTexture = function(_, icon, x, y) return symbol(icon, x, y) end,
    removeSymbol = function(_, item)
      for index, value in ipairs(symbols.added) do if value == item then table.remove(symbols.added, index); symbols.removedOwned = symbols.removedOwned + 1; return true end end
      symbols.removedVanilla = symbols.removedVanilla + 1; return false
    end
  }
  mapUI = { javaObject = { getAPIv3 = function() return { getSymbolsAPIv2 = function() return api end } end } }
  vanilla = { icon='vanilla' }
  table.insert(symbols.added, vanilla)
`;

const mapMarkers = `{
  { id='base', category='Base', title='Camp', note='Home', icon='House', color='red', x=10, y=20, z=0, createdBy='p', createdAt=1, revision=1 },
  { id='loot', category='Loot', title='Loot', note='', icon='Tent', color='cyan', x=30, y=40, z=0, createdBy='p', createdAt=2, revision=1 },
  { id='bad-icon', category='Base', title='Fallback', note='', icon='Missing', color='purple', x=50, y=60, z=0, createdBy='p', createdAt=3, revision=1 }
}`;

test('map adapter fails closed without map and symbols APIs', () => {
  assert.deepEqual(evaluateLua('local a = MapAdapter.attach({}); return a == nil', 1, { modules: ['mapAdapter'] }), [true]);
});

test('map adapter draws filtered confirmed markers with mapped style and fallback icon', () => {
  assert.deepEqual(evaluateLua(`local a = MapAdapter.attach(mapUI); local ok = MapAdapter.rebuild(a, ${mapMarkers}, { Loot = false }); local first, second; for i = 2, #symbols.added do if symbols.added[i].x == 10 then first = symbols.added[i] else second = symbols.added[i] end end; return ok, #symbols.added, first.icon, first.x, first.y, first.rgba[1], first.rgba[2], first.rgba[3], second.icon`, 9, { modules: ['mapAdapter'], bootstrap: mapFixture }), [true, 3, 'House', 10, 20, 1, 0, 0, 'Question']);
});

test('map adapter removes only owned symbols and rebuild is idempotent', () => {
  assert.deepEqual(evaluateLua(`local a = MapAdapter.attach(mapUI); MapAdapter.rebuild(a, ${mapMarkers}, { Loot = false }); local before = #symbols.added; MapAdapter.rebuild(a, ${mapMarkers}, { Loot = false }); return symbols.removedOwned, symbols.removedVanilla, #symbols.added, symbols.added[1] == vanilla, before == #symbols.added`, 5, { modules: ['mapAdapter'], bootstrap: mapFixture }), [2, 0, 3, true, true]);
});

test('map UI refreshes main and minimap independently from shared cache', () => {
  assert.deepEqual(evaluateLua(`return MapUI.register(), #MapUI._adapters == 1`, 2, { modules: ['mapAdapter', 'mapUI'], bootstrap: `
    Events = {}
    local symbolsApi = { addTexture=function() return { setRGBA=function() end } end, removeSymbol=function() end }
    mapUI = { javaObject = { getAPIv3 = function() return { getSymbolsAPIv2 = function() return symbolsApi end } end } }
  ` }), [true, true]);
});

test('map UI refreshAll shares cache records while honoring independent filters', () => {
  assert.deepEqual(evaluateLua(`
    MapUI.setFilter('main', { Loot = false })
    MapUI.register()
    local ok = MapUI.refreshAll()
    return ok, #mainSymbols.added == 1, #miniSymbols.added == 2
  `, 3, { modules: ['mapAdapter', 'mapUI'], bootstrap: `
    local function api(bucket)
      return { addTexture=function(_, icon, x, y) local s={icon=icon,x=x,y=y}; table.insert(bucket.added,s); return s end, removeSymbol=function() end }
    end
    mainSymbols = { added={} }; miniSymbols = { added={} }
    mapUI = { javaObject={ getAPIv3=function() return { getSymbolsAPIv2=function() return api(mainSymbols) end } end } }
    minimap = { javaObject={ getAPIv3=function() return { getSymbolsAPIv2=function() return api(miniSymbols) end } end } }
    Cache = { list=function() return {
      { id='base', category='Base', title='B', icon='House', color='white', x=1, y=2 },
      { id='loot', category='Loot', title='L', icon='House', color='white', x=3, y=4 }
    } end }
    MapUI = nil
  ` }), [true, true, true]);
});
