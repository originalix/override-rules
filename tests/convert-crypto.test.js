const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CONVERT_FILE = path.join(ROOT, 'convert.js');
const FAKE_PROXIES_FILE = path.join(ROOT, 'yaml_generator', 'fake_proxies.json');
const CRYPTO_RULESET_FILE = path.join(ROOT, 'ruleset', 'Crypto.list');
const QUANTUMULTX_CRYPTO_FILE = path.join(ROOT, 'quantumultx', 'Crypto.list');

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

assert.equal(
  config['rule-providers'].Crypto.url,
  'https://gcore.jsdelivr.net/gh/originalix/override-rules@refs/heads/main/ruleset/Crypto.list',
  'expected Crypto rule provider URL to point at the active main branch'
);
assert.ok(
  config.rules.includes('RULE-SET,Crypto,Crypto'),
  'expected Crypto ruleset to be routed to the Crypto proxy group'
);

const clashRuleset = fs.readFileSync(CRYPTO_RULESET_FILE, 'utf8');
assert.match(
  clashRuleset,
  /^DOMAIN,api\.hyperliquid\.xyz$/m,
  'expected Clash Crypto ruleset to include the Hyperliquid API host'
);
assert.match(
  clashRuleset,
  /^DOMAIN-SUFFIX,hyperliquid\.xyz$/m,
  'expected Clash Crypto ruleset to include all Hyperliquid subdomains'
);
assert.match(
  clashRuleset,
  /^DOMAIN-SUFFIX,onekeycn\.com$/m,
  'expected Clash Crypto ruleset to include OneKey CN domains'
);
assert.match(
  clashRuleset,
  /^DOMAIN-SUFFIX,onekeytest\.com$/m,
  'expected Clash Crypto ruleset to include OneKey test domains'
);

const quantumultxRuleset = fs.readFileSync(QUANTUMULTX_CRYPTO_FILE, 'utf8');
assert.match(
  quantumultxRuleset,
  /^host,api\.hyperliquid\.xyz,Crypto$/m,
  'expected QuantumultX Crypto ruleset to include the Hyperliquid API host'
);
assert.match(
  quantumultxRuleset,
  /^host-suffix,hyperliquid\.xyz,Crypto$/m,
  'expected QuantumultX Crypto ruleset to include all Hyperliquid subdomains'
);
assert.match(
  quantumultxRuleset,
  /^host-suffix,onekeycn\.com,Crypto$/m,
  'expected QuantumultX Crypto ruleset to include OneKey CN domains'
);
assert.match(
  quantumultxRuleset,
  /^host-suffix,onekeytest\.com,Crypto$/m,
  'expected QuantumultX Crypto ruleset to include OneKey test domains'
);
