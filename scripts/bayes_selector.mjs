import { assessModel } from './model_api.mjs';

async function run() {
  const candidates = ['nvidia/kimi2', 'openai/gpt-4o', 'openai/gpt-oss-120b', 'local/small-13b'];
  const prompt = process.argv.slice(2).join(' ') || 'Hello world';
  const prior = 1 / candidates.length;
  const items = [];
  for (const m of candidates) {
    const r = await assessModel(m, prompt);
    const quality = r.quality;
    const likelihood = Math.exp(quality * 2.0) / (1 + Math.exp(-quality));
    items.push({ model: m, quality, latency: r.latency, score: prior * likelihood });
  }
  const total = items.reduce((s, x) => s + x.score, 0) || 1;
  items.forEach((it) => (it.posterior = it.score / total));
  items.sort((a, b) => b.posterior - a.posterior);
  console.table(items.map(({ model, quality, latency, posterior }) => ({ model, quality: quality.toFixed(3), latency, posterior: posterior.toFixed(3) })));
  console.log('Selected:', items[0].model);
}

run().catch((e) => { console.error(e); process.exit(1); });
