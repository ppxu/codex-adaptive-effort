// Synthetic config/read protocol only; no credentials, network or generation.
import { createInterface } from 'node:readline';
const [scenario, ...args] = process.argv.slice(2);
const index = args.indexOf('app-server');
const local = args.slice(index + 1);
const effective = local.includes('-c') ? local : args.slice(0, index);
const values = {};
for (let i = 0; i < effective.length; ++i) if (effective[i] === '-c') {
  const pair = effective[++i], equal = pair.indexOf('=');
  try { values[pair.slice(0, equal)] = JSON.parse(pair.slice(equal + 1)); } catch {}
}
const provider = Object.fromEntries(Object.entries(values).filter(([k]) => k.startsWith('model_providers.cae.')).map(([k, v]) => [k.slice(20), v]));
provider.env_http_headers = { 'x-cae-token': 'CAE_LOCAL_TOKEN' };
if (scenario === 'secret') provider.experimental_bearer_token = 'synthetic-secret';
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  if (scenario === 'hang') return;
  if (message.method === 'initialized') return;
  if (message.method === 'initialize') { console.log(JSON.stringify({ id: message.id, result: {} })); return; }
  if (message.method !== 'config/read') process.exit(7);
  if (scenario === 'rpc-error') { console.log(JSON.stringify({ id: message.id, error: { message: 'synthetic-private-native-error' } })); return; }
  if (scenario === 'malformed') { console.log('not-json'); return; }
  console.log(JSON.stringify({ id: message.id, result: { config: { model: values.model,
    model_reasoning_effort: values.model_reasoning_effort, model_provider: scenario === 'mismatch' ? 'openai' : values.model_provider,
    model_providers: { cae: provider } } } }));
});
