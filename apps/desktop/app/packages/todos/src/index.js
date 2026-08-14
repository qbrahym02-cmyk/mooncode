/**
 * Todo list manager for agent sessions. The agent maintains a structured list
 * of tasks it plans to execute, updates their status as it progresses, and
 * surfaces the list to the UI so the user can see what's happening.
 *
 * Each todo has: id, content, status (pending/in_progress/completed), and
 * optional subtasks. The list is per-session and persisted in the session's
 * state object.
 */
export class TodoList {
  constructor() {
    this.items = new Map();
    this.order = [];
  }

  add(content, options = {}) {
    const id = options.id || crypto.randomUUID();
    const item = {
      id,
      content: String(content),
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      subtasks: options.subtasks || [],
      priority: options.priority || "normal",
    };
    this.items.set(id, item);
    this.order.push(id);
    return item;
  }

  update(id, patch) {
    const item = this.items.get(id);
    if (!item) throw new Error(`Todo not found: ${id}`);
    if (patch.content !== undefined) item.content = String(patch.content);
    if (patch.status !== undefined) {
      if (!["pending", "in_progress", "completed", "skipped"].includes(patch.status)) {
        throw new Error(`Invalid status: ${patch.status}`);
      }
      item.status = patch.status;
    }
    if (patch.priority !== undefined) item.priority = patch.priority;
    if (patch.subtasks !== undefined) item.subtasks = patch.subtasks;
    item.updatedAt = new Date().toISOString();
    return item;
  }

  remove(id) {
    const existed = this.items.delete(id);
    if (existed) this.order = this.order.filter((i) => i !== id);
    return { removed: existed };
  }

  get(id) { return this.items.get(id) || null; }

  list() {
    return this.order.map((id) => this.items.get(id)).filter(Boolean);
  }

  summary() {
    const items = this.list();
    return {
      total: items.length,
      pending: items.filter((i) => i.status === "pending").length,
      inProgress: items.filter((i) => i.status === "in_progress").length,
      completed: items.filter((i) => i.status === "completed").length,
      skipped: items.filter((i) => i.status === "skipped").length,
      progress: items.length ? Math.round(items.filter((i) => i.status === "completed").length / items.length * 100) : 0,
    };
  }

  clear() {
    this.items.clear();
    this.order = [];
  }

  toJSON() { return this.list(); }

  static fromJSON(items = []) {
    const list = new TodoList();
    for (const item of items) {
      list.items.set(item.id, item);
      list.order.push(item.id);
    }
    return list;
  }
}
