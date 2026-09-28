# Provenance and third-party notices

This release contains new project code and no vendored Codex, Astra-Ares or Jev Codex Router source or binaries. It does not modify their copyright notices, claim to be an official fork, or relicense external services. No third-party npm dependencies are installed. Node.js and development tooling have their own licenses.

Design references inspected on 2026-09-24:

| Source | Fixed reference | Design used as inspiration |
|---|---|---|
| [miuuyy/Astra-Ares](https://github.com/miuuyy/Astra-Ares) | `b2011446d88202329dcdc5163500ca818aba9dbb` | fixed executor identity, bounded generation lease, decision/commit separation, stale-state rejection |
| [0xNatoshi/jev-codex-router](https://github.com/0xNatoshi/jev-codex-router) | `8701ef788aa8cb0948f299538747fb01029d32b8` | local adapter, small decision projection vs full executor replay, operational bypass, observed-usage reporting |

The inspected repositories' top-level licenses are MIT. Astra-Ares also identifies patched OpenAI Codex components as Apache-2.0. Future source imports must preserve the exact applicable licenses/NOTICE and record provenance; these references alone do not grant rights to third-party account services or model weights.

Primary protocol references (mutable web documentation, accessed 2026-09-24):

- [Codex configuration reference](https://developers.openai.com/codex/config-reference/): custom provider, Responses wire API, environment headers, native auth and WebSocket configuration.
- [Codex App Server](https://developers.openai.com/codex/app-server): initialize / initialized / model/list; returned effort capabilities.
- [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning): request effort vs mid-conversation configuration updates and their restrictions. This release **does not implement configuration_update**.
- [TypeSafe API](https://docs.typesafe.ai/api): System One `state` + typed Choice questions, `/v1/systemone`.
- [TypeSafe language support](https://docs.typesafe.ai): Jev is text-based; real Chinese follow-up performance requires evaluation.
- [GitHub CLI repository creation](https://cli.github.com/manual/gh_repo_create): explicit public creation from a local source directory.

The ChatGPT backend path is an experimental compatibility route, not a promise that third-party proxying is officially supported. Native authentication/transport requirements may make a given client version incompatible. Never repair that by scraping or exporting credentials.
