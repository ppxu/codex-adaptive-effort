# Install and run the npm package

Requires Node.js **22.16+** and npm. Native integration also requires your existing Codex installation and normal login. The package contains original CAE runtime code with no runtime dependencies, install hooks or bundled native binaries.

The unreleased source package also includes all linked public documentation and the original synthetic validation evidence. Its installed links are checked offline. The first published archive contains selected guides only; use the [online documentation](https://github.com/ppxu/codex-adaptive-effort/tree/main/docs) if a local documentation link is missing. See [troubleshooting](TROUBLESHOOTING.md) for setup and control errors.

## Package availability

[`codex-adaptive-effort@0.1.0-alpha.1`](https://www.npmjs.com/package/codex-adaptive-effort/v/0.1.0-alpha.1) was published on 2026-09-29. The registry's version, `alpha` tag and SHA-512 integrity were checked against the reviewed archive, followed by an anonymous registry installation into a temporary prefix. See [release evidence](VALIDATION.md#npm-registry-publication--2026-09-29).

Install from npm:

```bash
npm install --global --ignore-scripts codex-adaptive-effort@alpha
cae --version
cae --help
```

To pin the exact release, use `codex-adaptive-effort@0.1.0-alpha.1`. Installing a reviewed Git commit remains an alternative (requires Git):

```bash
# Replace REVIEWED_COMMIT with the full tested Git commit SHA.
npm install --global --ignore-scripts github:ppxu/codex-adaptive-effort#REVIEWED_COMMIT
```

No administrator privileges should be necessary with a user-owned Node installation. If `cae` is not found, add npm's global executable directory to your `PATH` (`npm prefix --global`: the `bin` subdirectory on macOS/Linux, or the prefix itself on Windows). Do not put credentials in command arguments.

## Use a dedicated working directory

Global installation makes the command available from any directory; configuration remains local to the directory you choose. It does not create or modify `~/.codex/config.toml`. Keep the same working directory in each terminal, or pass the same explicit `--config PATH`.

```bash
mkdir cae-trial
cd cae-trial
cae doctor
cae probe > capabilities.local.json
```

If the native CLI is not on `PATH`, use `--codex /path/to/trusted/codex` for doctor/probe. Select `MODEL_ID` from the actual capability capture. Do not use a model ID copied from a fixture.

For the [validated desktop version](DESKTOP_LAUNCHER.md):

```bash
cae desktop start --model "$MODEL_ID" --auth chatgpt --enable-upstream
# In a second terminal, from the same cae-trial directory:
cae desktop status
cae desktop stop
```

The first launch creates `.cae/desktop/config.json`. Later starts can omit `--model` and reuse that configuration. Startup is foreground and still enforces native signature/version/capability/provider checks. Use a new local chat in the experimental window. Default mode is shadow with the baseline evaluator; Jev remains separately opt-in. Starting the launcher does not submit a task. Sending a task uses the normal model allowance.

For CLI integration, follow [local validation](LOCAL_VALIDATION.md). The [desktop guide](DESKTOP_LAUNCHER.md) covers manual controls, Jev opt-in and recovery. Both use the installed `cae` command; no repository checkout is needed.

## Upgrade, remove or install a local archive

Stop the experimental instance before replacing the package: generated desktop launchers reference the installed package path. Upgrade with the same `npm install --global ...@alpha` command. A CAE upgrade does not widen native desktop compatibility or change stored configuration.

```bash
cae desktop stop
npm uninstall --global codex-adaptive-effort
```

Removal leaves your project-local `.cae` directory intact. Stop the experiment and return to ordinary Codex to restore the normal route. Never remove native login files.

From a source checkout, a local archive can be built and installed without any registry publication:

```bash
npm ci --ignore-scripts
npm run verify
npm pack --ignore-scripts
npm install --global --ignore-scripts ./codex-adaptive-effort-0.1.0-alpha.1.tgz
cae --version
```

The explicit `package.json` file list excludes `.cae`, captures, dotenv, credentials, logs, source manifests, tests and maintenance scripts. Archives are ignored by Git. The automated package test builds and installs an archive into a temporary prefix offline, checks the actual command shim, version/help, synthetic initialization and launch arguments, and verifies that desktop startup still refuses missing authorization before native inspection. It never installs globally into the user's prefix or starts a real model.
