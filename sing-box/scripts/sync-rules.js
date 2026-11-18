const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const {
  AI_CATEGORY,
  AI_SOURCE_URL,
  LOCAL_RULE_SETS,
  SPECIAL_SITE_SOURCES,
  assertSameEntries,
  entriesToRuleSet,
  extractGeoSiteCategory,
  hashEntries,
  jsonContent,
  parseMihomo,
  parseQuantumultX,
  renderQuantumultX,
  uniqueEntries,
  writeFileIfChanged,
} = require('./rules-lib');

const ROOT = path.resolve(__dirname, '../..');

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
  const upstreamAI = extractGeoSiteCategory(geosite, AI_CATEGORY);
  if (!upstreamAI.length) throw new Error(`${AI_CATEGORY} is empty`);

  const aiEntries = uniqueEntries([...upstreamAI, ...parseMihomo(read('ruleset/AIPinned.list'))]);
  const pending = new Map();
  output('quantumultx/AI.list', renderQuantumultX(aiEntries, 'AI', [
    `# AI from ${AI_CATEGORY} and ruleset/AIPinned.list`,
    `# GeoSite source: ${AI_SOURCE_URL}`,
  ]), pending);
  output('sing-box/rule-set/AI.json', jsonContent(entriesToRuleSet(aiEntries)), pending);

  const qxCrypto = uniqueEntries(parseQuantumultX(read('quantumultx/Crypto.list'), 'Crypto'));
  const mihomoCrypto = uniqueEntries(parseMihomo(read('ruleset/Crypto.list')));
  assertSameEntries(qxCrypto, mihomoCrypto, 'Mihomo and Quantumult X Crypto rules');
  output('sing-box/rule-set/Crypto.json', jsonContent(entriesToRuleSet(qxCrypto)), pending);

  const sources = {
    AI: {
      source: AI_SOURCE_URL,
      category: AI_CATEGORY,
      pinned_source: 'ruleset/AIPinned.list',
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

  const specialList = SPECIAL_SITE_SOURCES.map(source => read(source).trim()).join('\n\n') + '\n';
  const specialEntries = uniqueEntries(parseMihomo(specialList));
  const specialHeader = `# Generated from ${SPECIAL_SITE_SOURCES.join(', ')}\n`;
  output('ruleset/SpecialSites.list', specialHeader + specialList, pending);
  output('quantumultx/SpecialSites.list', renderQuantumultX(specialEntries, 'Special Sites', [
    '# GitHub, Discord, and Special Sites',
    '# Load before AI.list to keep Grok and GitHub Copilot on Special Sites.',
  ]), pending);
  output('sing-box/rule-set/SpecialSites.json', jsonContent(entriesToRuleSet(specialEntries)), pending);
  sources.SpecialSites = {
    sources: SPECIAL_SITE_SOURCES,
    entries: specialEntries.length,
    rules_sha256: hashEntries(specialEntries),
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
