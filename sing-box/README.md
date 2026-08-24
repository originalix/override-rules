# sing-box rules and Sub-Store profile

This directory adds sing-box support without changing the existing Mihomo
converter. `Crypto` is checked against both existing Mihomo and Quantumult X
lists. `AI` is extracted from the same Loyalsoldier `geosite.dat` referenced by
`convert.js`; the Quantumult X AI list and sing-box AI rule-set are generated
from that extraction.

Quantumult X cannot express regular-expression hostname rules. The single
regex currently present in `CATEGORY-AI-!CN` is emitted as the narrowest
supported `host-wildcard` rule. The generator fails if another unsupported
regex appears.

## Refresh and verify rules

```sh
node sing-box/scripts/sync-rules.js
node sing-box/scripts/verify.js
```

`sync-rules.js` updates only `quantumultx/AI.list` and files under
`sing-box/rule-set/`. It does not modify Mihomo configuration or rule files.

## Sub-Store

Create a File artifact:

1. Use `sing-box/config.json` as the remote file source.
2. Add `sing-box/sub-store.js` as a remote file script.
3. Set script arguments to `type=collection&name=collection-subscription`.
4. Use the resulting `/api/file/<name>` URL as an SFA remote profile.

Repository raw URLs:

```text
https://raw.githubusercontent.com/originalix/override-rules/refs/heads/main/sing-box/config.json
https://raw.githubusercontent.com/originalix/override-rules/refs/heads/main/sing-box/sub-store.js
```

The profile targets SFA/sing-box 1.13, enables TUN loop protection, sends
public DNS through encrypted DoH over the selected proxy, and keeps local DNS
only for LAN names and proxy-server bootstrap resolution.
