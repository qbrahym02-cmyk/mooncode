/**
 * v3.1.0: Plugin SDK — 20+ hooks for extending Moon Code.
 *
 * Plugins are functions that receive a PluginInput and return Hooks.
 *
 * Usage:
 *   export default function myPlugin(input, options) {
 *     return {
 *       tool: { name: "my-tool", description: "...", execute: async (args) => {...} },
 *       "chat.message": async (message) => { console.log("New message:", message) },
 *       "permission.ask": (permission, path, action) => "allow",
 *     };
 *   }
 */

/**
 * @typedef {Object} PluginInput
 * @property {Object} client - Moon Code client SDK
 * @property {Object} project - project info
 * @property {string} directory - working directory
 * @property {string} [worktree] - worktree path if applicable
 * @property {Object} serverUrl - server URL
 */

/**
 * @typedef {Object} Hooks
 * @property {Function} [dispose] - cleanup when plugin unloads
 * @property {Function} [event] - listen to all events
 * @property {Function} [config] - provide config
 * @property {Object} [tool] - define a custom tool
 * @property {Object} [auth] - authentication hook
 * @property {Object} [provider] - provide LLM models
 * @property {Function} ["chat.message"] - new message hook
 * @property {Function} ["chat.params"] - modify LLM params
 * @property {Function} ["chat.headers"] - add HTTP headers
 * @property {Function} ["permission.ask"] - override permission
 * @property {Function} ["command.execute.before"] - pre-command hook
 * @property {Function} ["tool.execute.before"] - pre-tool hook
 * @property {Function} ["tool.execute.after"] - post-tool hook
 * @property {Function} ["shell.env"] - inject shell env vars
 * @property {Function} ["experimental.chat.messages.transform"]
 * @property {Function} ["experimental.chat.system.transform"]
 * @property {Function} ["experimental.provider.small_model"]
 * @property {Function} ["experimental.session.compacting"]
 * @property {Function} ["experimental.compaction.autocontinue"]
 * @property {Function} ["experimental.text.complete"]
 * @property {Function} ["tool.definition"] - modify tool definitions sent to LLM
 */

export const HOOK_NAMES = [
  "dispose", "event", "config", "tool", "auth", "provider",
  "chat.message", "chat.params", "chat.headers",
  "permission.ask", "command.execute.before",
  "tool.execute.before", "tool.execute.after",
  "shell.env",
  "experimental.chat.messages.transform",
  "experimental.chat.system.transform",
  "experimental.provider.small_model",
  "experimental.session.compacting",
  "experimental.compaction.autocontinue",
  "experimental.text.complete",
  "tool.definition",
];

/**
 * Plugin Loader — resolves, installs, and loads plugins.
 */
export class PluginLoader {
  constructor() {
    /** @type {Map<string, { loaded: boolean, hooks: Hooks, error: string | null }>} */
    this.plugins = new Map();
  }

  /**
   * Load a plugin from a module path or URL.
   */
  async load(spec, input) {
    try {
      const mod = await import(spec);
      const pluginFn = mod.default || mod;
      if (typeof pluginFn !== "function") {
        throw new Error("Plugin must export a function as default");
      }
      const hooks = await pluginFn(input, {});
      this.plugins.set(spec, { loaded: true, hooks, error: null });
      return { ok: true, hooks };
    } catch (error) {
      this.plugins.set(spec, { loaded: false, hooks: null, error: error.message });
      return { ok: false, error: error.message };
    }
  }

  /**
   * Execute a hook across all loaded plugins.
   */
  async runHook(name, ...args) {
    const results = [];
    for (const [spec, plugin] of this.plugins) {
      if (!plugin.loaded || !plugin.hooks) continue;
      const hook = plugin.hooks[name];
      if (typeof hook === "function") {
        try {
          const result = await hook(...args);
          if (result !== undefined) results.push({ plugin: spec, result });
        } catch (error) {
          console.error(`[plugin] ${spec} hook "${name}" failed:`, error.message);
        }
      }
    }
    return results;
  }

  /**
   * Get all custom tools from loaded plugins.
   */
  getTools() {
    const tools = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.loaded && plugin.hooks?.tool) {
        tools.push(plugin.hooks.tool);
      }
    }
    return tools;
  }

  /**
   * Dispose all plugins.
   */
  async dispose() {
    for (const [spec, plugin] of this.plugins) {
      if (plugin.loaded && plugin.hooks?.dispose) {
        try { await plugin.hooks.dispose(); } catch {}
      }
    }
    this.plugins.clear();
  }

  list() {
    return [...this.plugins.entries()].map(([spec, p]) => ({ spec, loaded: p.loaded, error: p.error }));
  }
}
