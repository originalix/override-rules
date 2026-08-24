const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const {
  assertSameEntries,
  hashEntries,
  parseMihomo,
  parseQuantumultX,
  ruleSetToEntries,
  uniqueEntries,
} = require('./rules-lib');

const ROOT = path.resolve(__dirname, '../..');
const RULE_SET_DIR = path.join(ROOT, 'sing-box/rule-set');

const LOCAL_RULE_SETS = [
  ['AdditionalCDNResources', 'ruleset/AdditionalCDNResources.list'],
  ['AdditionalFilter', 'ruleset/AdditionalFilter.list'],
  ['Discord', 'ruleset/Discord.list'],
  ['EHentai', 'ruleset/EHentai.list'],
  ['GoogleFCM', 'ruleset/FirebaseCloudMessaging.list'],
  ['GitHub', 'ruleset/GitHub.list'],
  ['SteamFix', 'ruleset/SteamFix.list'],
  ['TikTok', 'ruleset/TikTok.list'],
  ['TruthSocial', 'ruleset/TruthSocial.list'],
  ['Weibo', 'ruleset/Weibo.list'],
];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function verifySourceMetadata(tag, entries, sources) {
  if (!sources[tag]) throw new Error(`missing sources.json metadata for ${tag}`);
  if (sources[tag].entries !== uniqueEntries(entries).length) {
    throw new Error(`${tag} source entry count is stale`);
  }
  if (sources[tag].rules_sha256 !== hashEntries(entries)) {
    throw new Error(`${tag} source hash is stale`);
  }
}

async function verifySubStoreScript() {
  const context = {
    $arguments: { type: 'collection', name: 'fixture' },
    $content: read('sing-box/config.json'),
    $files: [],
    ProxyUtils: {},
    produceArtifact: async () =>
      JSON.stringify({
        outbounds: [
          { type: 'vless', tag: 'vless-fixture' },
          { type: 'anytls', tag: 'anytls-fixture' },
        ],
      }),
  };
  vm.createContext(context);

  const subStoreScript = read('sing-box/sub-store.js');
  await new vm.Script(`(async () => {\n${subStoreScript}\n})()`).runInContext(context);

  const generated = JSON.parse(context.$content);
  const outbounds = new Map(generated.outbounds.map((outbound) => [outbound.tag, outbound]));
  assert.deepEqual(
    [...outbounds.get('auto').outbounds],
    ['vless-fixture', 'anytls-fixture'],
  );
  assert.deepEqual(
    [...outbounds.get('select').outbounds],
    ['auto', 'vless-fixture', 'anytls-fixture'],
  );
  for (const policy of ['AI', 'Crypto', 'GitHub', 'Discord']) {
    assert.deepEqual(
      [...outbounds.get(policy).outbounds],
      ['select', 'auto', 'vless-fixture', 'anytls-fixture'],
    );
  }
  assert.equal(outbounds.get('vless-fixture').type, 'vless');
  assert.equal(outbounds.get('anytls-fixture').type, 'anytls');
}

async function main() {
  const sources = readJson('sing-box/rule-set/sources.json');

  const qxAI = parseQuantumultX(read('quantumultx/AI.list'), 'AI');
  const singBoxAI = ruleSetToEntries(readJson('sing-box/rule-set/AI.json'));
  assertSameEntries(qxAI, singBoxAI, 'Quantumult X and sing-box AI rules');
  verifySourceMetadata('AI', singBoxAI, sources);

  const qxCrypto = parseQuantumultX(read('quantumultx/Crypto.list'), 'Crypto');
  const mihomoCrypto = parseMihomo(read('ruleset/Crypto.list'));
  const singBoxCrypto = ruleSetToEntries(readJson('sing-box/rule-set/Crypto.json'));
  assertSameEntries(mihomoCrypto, qxCrypto, 'Mihomo and Quantumult X Crypto rules');
  assertSameEntries(mihomoCrypto, singBoxCrypto, 'Mihomo and sing-box Crypto rules');
  verifySourceMetadata('Crypto', singBoxCrypto, sources);

  for (const [tag, relativeSource] of LOCAL_RULE_SETS) {
    const sourceEntries = parseMihomo(read(relativeSource));
    const singBoxEntries = ruleSetToEntries(readJson(`sing-box/rule-set/${tag}.json`));
    assertSameEntries(sourceEntries, singBoxEntries, `${tag} rules`);
    verifySourceMetadata(tag, singBoxEntries, sources);
  }

  const config = readJson('sing-box/config.json');
  const ruleSetTags = new Set((config.route.rule_set || []).map((item) => item.tag));
  const outboundTags = new Set((config.outbounds || []).map((item) => item.tag));
  for (const rule of config.route.rules || []) {
    for (const tag of [].concat(rule.rule_set || [])) {
      if (!ruleSetTags.has(tag)) throw new Error(`route references missing rule-set ${tag}`);
    }
    if (rule.outbound && !outboundTags.has(rule.outbound)) {
      throw new Error(`route references missing outbound ${rule.outbound}`);
    }
  }
  if (!config.route.auto_detect_interface) throw new Error('route.auto_detect_interface must be enabled');

  await verifySubStoreScript();

  console.log(
    `verified AI=${uniqueEntries(singBoxAI).length}, ` +
      `Crypto=${uniqueEntries(singBoxCrypto).length}, ` +
      `${LOCAL_RULE_SETS.length} additional sing-box rule-sets`,
  );
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
