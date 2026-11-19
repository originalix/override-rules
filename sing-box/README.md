# sing-box rules and Sub-Store profile

GitHub, Discord and the other Special Sites share one selector. Their rules are
merged from `ruleset/GitHub.list`, `Discord.list` and `SpecialSitesExtra.list`.
The AI list combines Loyalsoldier’s `CATEGORY-AI-!CN` with the domains,
domain keywords and IP ranges in `ruleset/AIPinned.list`. These pinned rules
take priority over the other service rules in the sing-box and Mihomo profiles.

Quantumult X cannot express regular-expression hostname rules. The single
regex currently present in `CATEGORY-AI-!CN` is emitted as the narrowest
supported `host-wildcard` rule. The generator fails if another unsupported
regex appears.

## Refresh and verify rules

```sh
node sing-box/scripts/sync-rules.js
node sing-box/scripts/verify.js
```

`sync-rules.js` generates `ruleset/SpecialSites.list`, the Quantumult X
`SpecialSites.list` and `AI.list`, and the JSON files in `sing-box/rule-set/`.

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
