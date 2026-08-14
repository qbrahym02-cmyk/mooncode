/**
 * v3.1.0: WebSocket transport for OpenAI Realtime API.
 * Enables real-time streaming with lower latency than SSE.
 */
import { WebSocket } from "node:ws"; // or native WebSocket in Node 22+

export class RealtimeTransport {
  constructor(url, apiKey) {
    this.url = url;
    this.apiKey = apiKey;
    this.ws = null;
    this.listeners = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url, {
        headers: { "authorization": `Bearer ${this.apiKey}`, "openai-beta": "realtime=v1" },
      });
      this.ws.on("open", () => { resolve(); });
      this.ws.on("error", (err) => reject(err));
      this.ws.on("message", (data) => {
        try {
          const event = JSON.parse(data.toString());
          this.#dispatch(event.type, event);
        } catch {}
      });
      this.ws.on("close", () => this.#dispatch("close", {}));
    });
  }

  send(event) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(event)); }

  on(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }

  #dispatch(type, data) {
    for (const cb of this.listeners.get(type) || []) cb(data);
  }

  close() { this.ws?.close(); }
}
