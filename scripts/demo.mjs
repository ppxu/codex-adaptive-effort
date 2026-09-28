// Real loopback HTTP/SSE, synthetic evaluator and synthetic upstream only.
import assert from 'node:assert/strict';
import { harness, body, append, completedSse, eventually } from '../test/helpers.mjs';
import { report } from '../src/audit.mjs';
const h = await harness(null, { cfg: { mode: 'shadow' } });
try {
  const send = async value => { const r = await h.request(value); assert.equal(r.status, 200); const b = Buffer.from(await r.arrayBuffer()); assert.deepEqual(b, completedSse()); return JSON.parse(h.records.at(-1).bytes); };
  const stages = [];
  let observed = await send(body()); assert.equal(observed.reasoning.effort, 'high'); stages.push({ mode: 'shadow', upstreamEffort: 'high' });
  h.proxy.controller.control({ mode: 'auto' });
  observed = await send(body()); assert.equal(observed.reasoning.effort, 'low'); stages.push({ mode: 'auto', upstreamEffort: 'low' });
  await eventually(() => h.proxy.controller.active.size === 0);
  const calls = h.judge.calls; observed = await send(append(body())); assert.equal(h.judge.calls, calls); stages.push({ mode: 'auto', decision: 'reused compatible lease' });
  h.proxy.controller.control({ lockedEffort: 'medium' }); observed = await send(body()); assert.equal(observed.reasoning.effort, 'medium'); stages.push({ mode: 'manual', upstreamEffort: 'medium' });
  h.proxy.controller.control({ mode: 'off' }); observed = await send(body()); assert.equal(observed.reasoning.effort, 'high'); stages.push({ mode: 'off', upstreamEffort: 'high' });
  await eventually(() => h.events.filter(e => e.event === 'upstream_outcome').length === 5);
  console.log(JSON.stringify({ demo: 'PASS', realProvidersCalled: 0, realQuotaUsed: 0, scenarios: stages,
    syntheticUsageReport: report(h.events), note: 'This proves local wiring only; no model quality or savings measured.' }, null, 2));
} finally { await h.close(); }
