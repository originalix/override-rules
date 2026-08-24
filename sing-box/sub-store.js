// Sub-Store file script for sing-box/config.json.
// Arguments: type=collection&name=collection-subscription

const args = typeof $arguments === 'object' && $arguments ? $arguments : {};
const parser = ProxyUtils.JSON5 || JSON;
const collectionType = /^1$|col|collection|组合/i.test(args.type || 'collection')
  ? 'collection'
  : 'subscription';
const artifactName = args.name || 'collection-subscription';

let config;
try {
  config = parser.parse($content ?? $files[0]);
} catch (error) {
  throw new Error(`sing-box base config is invalid: ${error.message || error}`);
}

const produceOptions = {
  'include-unsupported-proxy': args.includeUnsupportedProxy,
};
let artifact;

if (args.url) {
  artifact = await produceArtifact({
    name: artifactName,
    type: collectionType,
    platform: 'sing-box',
    produceOpts: produceOptions,
    subscription: {
      name: artifactName,
      url: args.url,
      source: 'remote',
    },
  });
} else {
  artifact = await produceArtifact({
    name: artifactName,
    type: collectionType,
    platform: 'sing-box',
    produceOpts: produceOptions,
  });
}

const produced = JSON.parse(artifact);
const nodes = [...(produced.outbounds || []), ...(produced.endpoints || [])];
const nodeTags = nodes.map((node) => node.tag).filter(Boolean);
const uniqueNodeTags = [...new Set(nodeTags)];

if (!uniqueNodeTags.length) {
  throw new Error(`subscription ${artifactName} produced no sing-box nodes`);
}
if (uniqueNodeTags.length !== nodeTags.length) {
  throw new Error(`subscription ${artifactName} contains duplicate node tags`);
}

const baseOutbounds = Array.isArray(config.outbounds) ? config.outbounds : [];
const baseTags = new Set(baseOutbounds.map((outbound) => outbound.tag));
for (const tag of uniqueNodeTags) {
  if (baseTags.has(tag)) throw new Error(`node tag conflicts with base outbound: ${tag}`);
}

const policyTags = new Set(['AI', 'Crypto', 'GitHub', 'Discord']);
for (const outbound of baseOutbounds) {
  if (outbound.tag === 'auto') {
    outbound.outbounds = [...uniqueNodeTags];
  } else if (outbound.tag === 'select') {
    outbound.outbounds = ['auto', ...uniqueNodeTags];
  } else if (policyTags.has(outbound.tag)) {
    outbound.outbounds = ['select', 'auto', ...uniqueNodeTags];
  }
}

config.outbounds = [...baseOutbounds, ...(produced.outbounds || [])];
config.endpoints = [...(config.endpoints || []), ...(produced.endpoints || [])];
$content = JSON.stringify(config, null, 2);
