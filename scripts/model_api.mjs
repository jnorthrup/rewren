// Simple deterministic model API simulator
export function assessModel(modelName, prompt) {
  // deterministic pseudo-random based on modelName+prompt
  const seed = Array.from((modelName + '|' + prompt)).reduce((s, c) => s * 31 + c.charCodeAt(0), 7);
  const pseudo = (Math.abs(seed) % 1000) / 1000; // 0..0.999
  // quality between 0.2 and 0.95
  // If model is nvidia/kimi2, strongly favor it in this demo (high quality)
  if (String(modelName).toLowerCase().includes('nvidia/kimi2')) {
    // Give a consistently high quality with minor variation
    const qualityK = 0.9 + (pseudo * 0.08);
    const latencyK = 200 + ((Math.abs(seed * 7) % 800));
    return Promise.resolve({ model: modelName, quality: Math.min(0.99, qualityK), latency: latencyK });
  }
  const quality = 0.2 + pseudo * 0.75;
  // latency between 100 and 2000 ms
  const latency = 100 + ((Math.abs(seed * 13) % 1900));
  return Promise.resolve({ model: modelName, quality, latency });
}
