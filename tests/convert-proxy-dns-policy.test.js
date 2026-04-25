const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CONVERT_FILE = path.join(ROOT, 'convert.js');

function loadMain(args = {}) {
  const code = fs.readFileSync(CONVERT_FILE, 'utf8');
  const sandbox = { $arguments: args, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'convert.js' });
  return sandbox.main;
}

const privateNameservers = [
  'https://private-dns-a.example/dns-query/token',
  'https://private-dns-b.example/dns-query/token',
];

const main = loadMain();
const config = main({
  dns: {
    'proxy-server-nameserver': privateNameservers,
    'proxy-server-nameserver-policy': {
      'c14d037.ndvfxyvj.sbs': privateNameservers,
      'e21g6ix.bvwbcajc.sbs': privateNameservers,
      'unused.example': privateNameservers,
    },
  },
  proxies: [
    {
      name: 'Amy Taiwan',
      type: 'ss',
      server: 'c14d037.ndvfxyvj.sbs',
      port: 19355,
      cipher: '2022-blake3-aes-128-gcm',
      password: 'redacted',
    },
    {
      name: 'Amy Japan',
      type: 'ss',
      server: 'e21g6ix.bvwbcajc.sbs',
      port: 19002,
      cipher: '2022-blake3-aes-128-gcm',
      password: 'redacted',
    },
  ],
});

const policy = config.dns['proxy-server-nameserver-policy'];

assert.deepEqual(
  Array.from(policy['c14d037.ndvfxyvj.sbs']),
  privateNameservers,
  'expected existing proxy-server nameserver policy to be preserved'
);
assert.deepEqual(
  Array.from(policy['e21g6ix.bvwbcajc.sbs']),
  privateNameservers,
  'expected second existing proxy-server nameserver policy to be preserved'
);
assert.equal(
  policy['unused.example'],
  undefined,
  'expected input proxy-server nameserver policy to be limited to existing proxy servers'
);
assert.equal(
  config.dns['proxy-server-nameserver'][0],
  privateNameservers[0],
  'expected existing proxy-server nameservers to be preserved before defaults'
);

const configWithoutInputDns = main({ proxies: [{ name: 'Other', server: 'other.example' }] });

assert.equal(
  configWithoutInputDns.dns['proxy-server-nameserver-policy'],
  undefined,
  'expected no proxy-server nameserver policy without an input DNS policy'
);
