const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CONVERT_FILE = path.join(ROOT, 'convert.js');
const FAKE_PROXIES_FILE = path.join(ROOT, 'yaml_generator', 'fake_proxies.json');
const DISCORD_RULESET_FILE = path.join(ROOT, 'ruleset', 'Discord.list');

function loadMain(args = {}) {
  const code = fs.readFileSync(CONVERT_FILE, 'utf8');
  const sandbox = { $arguments: args, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'convert.js' });
  return sandbox.main;
}

function loadBaseConfig() {
  return JSON.parse(fs.readFileSync(FAKE_PROXIES_FILE, 'utf8'));
}

const main = loadMain();
const config = main(loadBaseConfig());
const discordGroup = config['proxy-groups'].find(group => group.name === 'Discord');

assert.ok(config['rule-providers'].Discord, 'expected Discord rule provider to exist');
assert.equal(
  config['rule-providers'].Discord.path,
  './ruleset/Discord.list',
  'expected Discord rule provider path to point to ruleset/Discord.list'
);
assert.equal(
  config['rule-providers'].Discord.url,
  'https://gcore.jsdelivr.net/gh/originalix/override-rules@master/ruleset/Discord.list',
  'expected Discord rule provider URL to point to the originalix fork'
);
assert.ok(
  config.rules.includes('RULE-SET,Discord,Discord'),
  'expected Discord ruleset to be routed to the Discord proxy group'
);
assert.ok(discordGroup, 'expected Discord proxy group to exist');
assert.ok(Array.isArray(discordGroup.proxies), 'expected Discord proxy group to expose selectable proxies');

const discordRuleset = fs.readFileSync(DISCORD_RULESET_FILE, 'utf8');
assert.match(
  discordRuleset,
  /^DOMAIN-SUFFIX,discord\.com$/m,
  'expected Discord ruleset to include discord.com'
);
