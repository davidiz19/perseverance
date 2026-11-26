// Mini TelemetryAPI inspired by Open MCT (src/api/telemetry/TelemetryAPI.js):
// providers register with addProvider; each datum is described by metadata
// (key, name, unit, provider, meaning). Views call request() for history and
// subscribe() for live values, never talking to a source directly.
export class TelemetryAPI {
  #providers = [];
  #metadata = new Map();

  addProvider(provider) {
    this.#providers.unshift(provider); // later providers win, like Open MCT
    for (const m of provider.metadata) this.#metadata.set(m.key, { ...m, provider: provider.name, source: provider });
  }
  getMetadata(key) { return this.#metadata.get(key); }
  keys() { return [...this.#metadata.keys()]; }
  #find(key, cap) { return this.#providers.find((p) => p[cap]?.(key)); }

  async request(key) {
    const p = this.#find(key, 'supportsRequest');
    if (!p) throw new Error(`No provider for ${key}`);
    return p.request(key); // → [{ t: Date, value: number }]
  }
  subscribe(key, callback) {
    const p = this.#find(key, 'supportsSubscribe');
    if (!p) throw new Error(`No live provider for ${key}`);
    return p.subscribe(key, callback); // returns unsubscribe
  }
}
