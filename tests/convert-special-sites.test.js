const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CONVERT_FILE = path.join(ROOT, 'convert.js');
const FAKE_PROXIES_FILE = path.join(ROOT, 'yaml_generator', 'fake_proxies.json');

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
const groups = config['proxy-groups'].map(group => group.name);
assert.ok(groups.includes('Special Sites'));
assert.ok(!groups.includes('GitHub') && !groups.includes('Discord'));

for (const tag of ['AIPinned', 'SpecialSites']) {
  const provider = config['rule-providers'][tag];
  assert.equal(provider.path, `./ruleset/${tag}.list`);
  assert.equal(provider.url, `https://raw.githubusercontent.com/originalix/override-rules/refs/heads/main/ruleset/${tag}.list`);
}
const pinnedRule = config.rules.indexOf('RULE-SET,AIPinned,AI');
const sharedRule = config.rules.indexOf('RULE-SET,SpecialSites,Special Sites,no-resolve');
assert.ok(pinnedRule >= 0 && pinnedRule < sharedRule);
assert.ok(sharedRule < config.rules.indexOf('GEOSITE,CATEGORY-AI-!CN,AI'));

const shared = fs.readFileSync(path.join(ROOT, 'ruleset', 'SpecialSites.list'), 'utf8').split('\n');
for (const rule of ['DOMAIN-SUFFIX,github.com', 'DOMAIN-SUFFIX,discord.com', 'DOMAIN-SUFFIX,slack.com',
  'DOMAIN-SUFFIX,meet.google.com', 'IP-CIDR6,2a0a:a440::/29,no-resolve']) {
  assert.ok(shared.includes(rule), rule);
}
const pinned = fs.readFileSync(path.join(ROOT, 'ruleset', 'AIPinned.list'), 'utf8').split('\n');
for (const host of [
  'claude.ai', 'ant.dev', 'anthropic.com', 'anthropic.team', 'antspace.dev', 'chatbotclaude.com',
  'clau.de', 'claude.app', 'claude.com', 'claude.dev', 'claude.new', 'claude.site', 'claudeacademy.com',
  'claudemcpclient.com', 'claudemcpcontent.com', 'claudepages.dev', 'claudestudio.com', 'claudeusercontent.com',
]) {
  assert.ok(pinned.includes(`DOMAIN-SUFFIX,${host}`), host);
}
for (const rule of [
  'DOMAIN,anthropic.auth0.com',
  'DOMAIN-KEYWORD,datadog',
  'DOMAIN-KEYWORD,sift',
  'IP-CIDR,160.79.104.0/21,no-resolve',
  'IP-CIDR6,2607:6bc0::/32,no-resolve',
]) {
  assert.ok(pinned.includes(rule), rule);
}
