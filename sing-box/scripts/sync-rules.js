const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const {
  AI_CATEGORY,
  AI_SOURCE_URL,
  assertSameEntries,
  entriesToRuleSet,
  extractGeoSiteCategory,
  hashEntries,
  jsonContent,
  parseMihomo,
  parseQuantumultX,
  renderQuantumultXAI,
  uniqueEntries,
  writeFileIfChanged,
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

function download(url) {
  return execFileSync('curl', ['-fsSL', '--max-time', '30', url], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function output(relativePath, content, pending) {
  pending.set(path.join(ROOT, relativePath), content);
}

function main() {
  const geosite = download(AI_SOURCE_URL);
  const aiEntries = uniqueEntries(extractGeoSiteCategory(geosite, AI_CATEGORY));
  if (!aiEntries.length) throw new Error(`${AI_CATEGORY} is empty`);

  const pending = new Map();
  output('quantumultx/AI.list', renderQuantumultXAI(aiEntries), pending);
  output('sing-box/rule-set/AI.json', jsonContent(entriesToRuleSet(aiEntries)), pending);

  const qxCrypto = uniqueEntries(parseQuantumultX(read('quantumultx/Crypto.list'), 'Crypto'));
  const mihomoCrypto = uniqueEntries(parseMihomo(read('ruleset/Crypto.list')));
  assertSameEntries(qxCrypto, mihomoCrypto, 'Mihomo and Quantumult X Crypto rules');
  output('sing-box/rule-set/Crypto.json', jsonContent(entriesToRuleSet(qxCrypto)), pending);

  const sources = {
    AI: {
      source: AI_SOURCE_URL,
      category: AI_CATEGORY,
      entries: aiEntries.length,
      rules_sha256: hashEntries(aiEntries),
      quantumult_x_regex_approximations: 1,
    },
    Crypto: {
      sources: ['ruleset/Crypto.list', 'quantumultx/Crypto.list'],
      entries: qxCrypto.length,
      rules_sha256: hashEntries(qxCrypto),
    },
  };

  for (const [tag, relativeSource] of LOCAL_RULE_SETS) {
    const entries = uniqueEntries(parseMihomo(read(relativeSource)));
    output(`sing-box/rule-set/${tag}.json`, jsonContent(entriesToRuleSet(entries)), pending);
    sources[tag] = {
      source: relativeSource,
      entries: entries.length,
      rules_sha256: hashEntries(entries),
    };
  }

  output('sing-box/rule-set/sources.json', jsonContent(sources), pending);

  const changed = [];
  for (const [filePath, content] of pending) {
    if (writeFileIfChanged(filePath, content)) changed.push(path.relative(ROOT, filePath));
  }

  console.log(
    `AI ${aiEntries.length} rules; Crypto ${qxCrypto.length} rules; ` +
      `${changed.length ? `updated ${changed.join(', ')}` : 'no changes'}`,
  );
}

try {
  main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
