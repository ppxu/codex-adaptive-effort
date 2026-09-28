#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { loadConfig, readLocalToken } from '../src/config.mjs';
import { codexArgs } from '../src/codex.mjs';
import { verifyDesktopProvider, desktopControl } from '../src/desktop.mjs';
import { CaeError } from '../src/util.mjs';

async function main() {
  const [configPath, binary, ...input] = process.argv.slice(2);
  if (!configPath || !binary) throw new CaeError('desktop_bridge_arguments');
  const config = loadConfig(configPath);
  let index = 0;
  while (index < input.length) {
    if (['-c', '--config'].includes(input[index]) && index + 1 < input.length) index += 2;
    else if (input[index].startsWith('--config=')) ++index;
    else break;
  }
  const isVersion = input.length === 1 && ['--version', '-V'].includes(input[0]);
  if (!isVersion && input[index] !== 'app-server') throw new CaeError('desktop_bridge_command_unsupported');
  const args = isVersion ? input : codexArgs(config, 'chatgpt', input);
  const env = { ...process.env }; delete env.CODEX_CLI_PATH; delete env.TYPESAFE_API_KEY; delete env.CAE_LOCAL_TOKEN;
  if (!isVersion) {
    await verifyDesktopProvider(binary, args, config);
    const health = await fetch(`http://127.0.0.1:${config.port}/health`, { redirect: 'error',
      signal: AbortSignal.timeout(3000), headers: { 'x-cae-token': readLocalToken(config.tokenFile) } });
    const state = health.ok ? await health.json() : null;
    if (!state?.ok || !state.auditHealthy || state.model !== config.model) throw new CaeError('proxy_health_mismatch');
    await desktopControl(configPath, 'bridge-ready');
    env.CAE_LOCAL_TOKEN = readLocalToken(config.tokenFile);
  }
  const child = spawn(binary, args, { env, stdio: 'inherit' });
  let timer;
  const stop = () => { child.kill('SIGTERM'); timer ??= setTimeout(() => child.kill('SIGKILL'), 1000); timer.unref(); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  child.once('error', () => { console.error('CAE: codex_not_available'); process.exitCode = 1; });
  child.once('exit', code => { clearTimeout(timer); process.off('SIGTERM', stop); process.off('SIGINT', stop); process.exitCode = code ?? 1; });
}
main().catch(error => {
  console.error(`CAE: ${error instanceof CaeError ? error.code : 'desktop_bridge_failed'}`);
  process.exitCode = 1;
});
