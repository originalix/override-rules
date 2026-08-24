const crypto = require('node:crypto');
const fs = require('node:fs');

const AI_POLICY = 'AI';
const AI_CATEGORY = 'CATEGORY-AI-!CN';
const AI_SOURCE_URL =
  'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat';

const DOMAIN_TYPE_TO_FIELD = {
  0: 'domain_keyword',
  1: 'domain_regex',
  2: 'domain_suffix',
  3: 'domain',
};

const QX_TYPE_TO_FIELD = {
  host: 'domain',
  'host-suffix': 'domain_suffix',
  'host-keyword': 'domain_keyword',
  'ip-cidr': 'ip_cidr',
  'ip6-cidr': 'ip_cidr',
};

const MIHOMO_TYPE_TO_FIELD = {
  DOMAIN: 'domain',
  'DOMAIN-SUFFIX': 'domain_suffix',
  'DOMAIN-KEYWORD': 'domain_keyword',
  'DOMAIN-REGEX': 'domain_regex',
  'IP-CIDR': 'ip_cidr',
  'IP-CIDR6': 'ip_cidr',
  'PROCESS-NAME': 'process_name',
};

// Quantumult X has no regular-expression hostname rule. This wildcard is the
// narrowest supported representation of the sole regex currently present in
// Loyalsoldier's CATEGORY-AI-!CN.
const QX_REGEX_APPROXIMATIONS = new Map([
  [
    '^chatgpt-async-webps-prod-\\S+-\\d+\\.webpubsub\\.azure\\.com$',
    'chatgpt-async-webps-prod-*-*.webpubsub.azure.com',
  ],
]);

const QX_WILDCARD_TO_REGEX = new Map(
  [...QX_REGEX_APPROXIMATIONS].map(([regex, wildcard]) => [wildcard, regex]),
);

function readVarint(buffer, state) {
  let value = 0;
  let multiplier = 1;

  while (state.offset < buffer.length) {
    const byte = buffer[state.offset++];
    value += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) return value;
    multiplier *= 128;
    if (!Number.isSafeInteger(value) || multiplier > Number.MAX_SAFE_INTEGER) {
      throw new Error('protobuf varint exceeds JavaScript safe integer range');
    }
  }

  throw new Error('unexpected end of protobuf varint');
}

function forEachProtobufField(buffer, visitor) {
  const state = { offset: 0 };

  while (state.offset < buffer.length) {
    const key = readVarint(buffer, state);
    const fieldNumber = Math.floor(key / 8);
    const wireType = key % 8;

    if (wireType === 0) {
      visitor(fieldNumber, wireType, readVarint(buffer, state));
      continue;
    }

    if (wireType === 1 || wireType === 5) {
      const length = wireType === 1 ? 8 : 4;
      const end = state.offset + length;
      if (end > buffer.length) throw new Error('truncated protobuf fixed-width field');
      visitor(fieldNumber, wireType, buffer.subarray(state.offset, end));
      state.offset = end;
      continue;
    }

    if (wireType === 2) {
      const length = readVarint(buffer, state);
      const end = state.offset + length;
      if (end > buffer.length) throw new Error('truncated protobuf length-delimited field');
      visitor(fieldNumber, wireType, buffer.subarray(state.offset, end));
      state.offset = end;
      continue;
    }

    throw new Error(`unsupported protobuf wire type: ${wireType}`);
  }
}

function parseDomainMessage(buffer) {
  let type = 0;
  let value = '';

  forEachProtobufField(buffer, (fieldNumber, wireType, fieldValue) => {
    if (fieldNumber === 1 && wireType === 0) type = fieldValue;
    if (fieldNumber === 2 && wireType === 2) value = fieldValue.toString('utf8');
  });

  if (!value) throw new Error('GeoSite domain entry is missing a value');
  return { type, value };
}

function parseGeoSiteMessage(buffer) {
  let code = '';
  const domains = [];

  forEachProtobufField(buffer, (fieldNumber, wireType, fieldValue) => {
    if (fieldNumber === 1 && wireType === 2) code = fieldValue.toString('utf8');
    if (fieldNumber === 2 && wireType === 2) domains.push(parseDomainMessage(fieldValue));
  });

  return { code, domains };
}

function extractGeoSiteCategory(buffer, category) {
  const matches = [];

  forEachProtobufField(buffer, (fieldNumber, wireType, fieldValue) => {
    if (fieldNumber !== 1 || wireType !== 2) return;
    const site = parseGeoSiteMessage(fieldValue);
    if (site.code.toUpperCase() === category.toUpperCase()) matches.push(site);
  });

  if (matches.length !== 1) {
    throw new Error(`expected exactly one GeoSite category ${category}, found ${matches.length}`);
  }

  return matches[0].domains.map(({ type, value }) => {
    const field = DOMAIN_TYPE_TO_FIELD[type];
    if (!field) throw new Error(`unsupported GeoSite domain type ${type} for ${value}`);
    return { field, value };
  });
}

function parseLines(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function parseQuantumultX(content, expectedPolicy) {
  return parseLines(content).map((line) => {
    const [type, value, policy] = line.split(',').map((part) => part.trim());
    if (!type || !value || !policy) throw new Error(`invalid Quantumult X rule: ${line}`);
    if (expectedPolicy && policy !== expectedPolicy) {
      throw new Error(`expected Quantumult X policy ${expectedPolicy}, found ${policy}: ${line}`);
    }

    if (type === 'host-wildcard') {
      const regex = QX_WILDCARD_TO_REGEX.get(value);
      if (!regex) throw new Error(`unsupported Quantumult X wildcard rule: ${line}`);
      return { field: 'domain_regex', value: regex };
    }

    const field = QX_TYPE_TO_FIELD[type];
    if (!field) throw new Error(`unsupported Quantumult X rule type ${type}: ${line}`);
    return { field, value };
  });
}

function parseMihomo(content) {
  return parseLines(content).map((line) => {
    const [type, value] = line.split(',').map((part) => part.trim());
    const field = MIHOMO_TYPE_TO_FIELD[type];
    if (!field) throw new Error(`unsupported Mihomo rule type ${type}: ${line}`);
    if (!value) throw new Error(`invalid Mihomo rule: ${line}`);
    return { field, value };
  });
}

function uniqueEntries(entries) {
  const seen = new Set();
  return entries.filter(({ field, value }) => {
    const key = `${field}\u0000${value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function entriesToRuleSet(entries) {
  const grouped = new Map();
  for (const { field, value } of uniqueEntries(entries)) {
    if (!grouped.has(field)) grouped.set(field, []);
    grouped.get(field).push(value);
  }

  const primaryFields = [
    'domain',
    'domain_suffix',
    'domain_keyword',
    'domain_regex',
    'ip_cidr',
  ];
  const primaryRule = {};
  for (const field of primaryFields) {
    if (grouped.has(field)) primaryRule[field] = grouped.get(field);
  }

  const rules = [];
  if (Object.keys(primaryRule).length) rules.push(primaryRule);

  // Process fields are not combined with destination fields: sing-box would
  // otherwise AND them instead of preserving the list's OR semantics.
  if (grouped.has('process_name')) {
    rules.push({ process_name: grouped.get('process_name') });
  }

  const known = new Set([...primaryFields, 'process_name']);
  for (const field of grouped.keys()) {
    if (!known.has(field)) throw new Error(`cannot serialize sing-box rule field ${field}`);
  }

  return { version: 4, rules };
}

function ruleSetToEntries(ruleSet) {
  const fields = [
    'domain',
    'domain_suffix',
    'domain_keyword',
    'domain_regex',
    'ip_cidr',
    'process_name',
  ];
  const entries = [];

  for (const rule of ruleSet.rules || []) {
    for (const field of fields) {
      const values = rule[field] === undefined ? [] : [].concat(rule[field]);
      for (const value of values) entries.push({ field, value });
    }
  }

  return uniqueEntries(entries);
}

function renderQuantumultXAI(entries) {
  const lines = [
    '# > AI Services',
    '# >> Generated from Mihomo GEOSITE,CATEGORY-AI-!CN',
    `# >> Source: ${AI_SOURCE_URL}`,
    '# >> Do not edit manually; run node sing-box/scripts/sync-rules.js',
    '',
  ];

  for (const { field, value } of uniqueEntries(entries)) {
    if (field === 'domain') lines.push(`host,${value},${AI_POLICY}`);
    else if (field === 'domain_suffix') lines.push(`host-suffix,${value},${AI_POLICY}`);
    else if (field === 'domain_keyword') lines.push(`host-keyword,${value},${AI_POLICY}`);
    else if (field === 'domain_regex') {
      const wildcard = QX_REGEX_APPROXIMATIONS.get(value);
      if (!wildcard) throw new Error(`Quantumult X cannot represent GeoSite regex: ${value}`);
      lines.push(`# Regex approximation: ${value}`);
      lines.push(`host-wildcard,${wildcard},${AI_POLICY}`);
    } else {
      throw new Error(`Quantumult X AI output does not support ${field}: ${value}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function entryKey({ field, value }) {
  return `${field}\u0000${value}`;
}

function compareEntrySets(left, right) {
  const leftSet = new Set(uniqueEntries(left).map(entryKey));
  const rightSet = new Set(uniqueEntries(right).map(entryKey));
  return {
    onlyLeft: [...leftSet].filter((key) => !rightSet.has(key)),
    onlyRight: [...rightSet].filter((key) => !leftSet.has(key)),
  };
}

function assertSameEntries(left, right, label) {
  const diff = compareEntrySets(left, right);
  if (diff.onlyLeft.length || diff.onlyRight.length) {
    throw new Error(
      `${label} differs: only-left=${diff.onlyLeft.slice(0, 5).join(', ')}, ` +
        `only-right=${diff.onlyRight.slice(0, 5).join(', ')}`,
    );
  }
}

function hashEntries(entries) {
  const normalized = uniqueEntries(entries).map(entryKey).sort().join('\n');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function writeFileIfChanged(filePath, content) {
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (current === content) return false;
  fs.mkdirSync(require('node:path').dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return true;
}

function jsonContent(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

module.exports = {
  AI_CATEGORY,
  AI_POLICY,
  AI_SOURCE_URL,
  assertSameEntries,
  entriesToRuleSet,
  extractGeoSiteCategory,
  hashEntries,
  jsonContent,
  parseMihomo,
  parseQuantumultX,
  renderQuantumultXAI,
  ruleSetToEntries,
  uniqueEntries,
  writeFileIfChanged,
};
