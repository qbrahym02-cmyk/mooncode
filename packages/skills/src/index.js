import { readFile, readdir, stat, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const MAX_MANIFEST_BYTES = 32_000;
const VALID_MODES = new Set(["build", "plan", "design", "review"]);

// Skill manifests are small JSON files that describe reusable agent skills.
// They live under workspace/skills/<name>/skill.json and contain:
//   { name, description, mode, inputs[], prompt, tags[], compose[] }
// compose is an optional array of skill ids whose prompts should be run first.
export class SkillRegistry {
  constructor(workspaceRoot) {
    this.root = path.resolve(workspaceRoot);
    this.skillsDir = path.join(this.root, "skills");
    this.history = [];
  }

  async list() {
    const skills = [];
    let entries;
    try { entries = await readdir(this.skillsDir, { withFileTypes: true }); }
    catch (error) {
      if (error?.code === "ENOENT") return skills;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(this.skillsDir, entry.name, "skill.json");
      try {
        const info = await stat(manifestPath);
        if (!info.isFile() || info.size > MAX_MANIFEST_BYTES) continue;
        const raw = await readFile(manifestPath, "utf8");
        const manifest = JSON.parse(raw);
        if (!manifest.name) manifest.name = entry.name;
        skills.push({ ...manifest, id: entry.name, dir: `skills/${entry.name}`, manifestPath, builtin: false });
      } catch (error) {
        skills.push({ id: entry.name, error: error.message, dir: `skills/${entry.name}` });
      }
    }
    return skills;
  }

  async listAll() {
    const userSkills = await this.list();
    const builtins = BUILTIN_SKILLS.map((s) => ({ ...s, builtin: true }));
    return [...builtins, ...userSkills.filter((u) => !builtins.some((b) => b.id === u.id))];
  }

  async get(id) {
    const builtin = BUILTIN_SKILLS.find((skill) => skill.id === id);
    if (builtin) return builtin;
    const manifestPath = path.join(this.skillsDir, id, "skill.json");
    const raw = await readFile(manifestPath, "utf8");
    return JSON.parse(raw);
  }

  async create(id, manifest) {
    this.#validateId(id);
    this.#validateManifest(manifest);
    const skillDir = path.join(this.skillsDir, id);
    const manifestPath = path.join(skillDir, "skill.json");
    try {
      await stat(manifestPath);
      throw new Error(`Skill already exists: ${id}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await mkdir(skillDir, { recursive: true });
    const payload = JSON.stringify(manifest, null, 2);
    await writeFile(manifestPath, `${payload}\n`, "utf8");
    return { id, ...manifest };
  }

  async update(id, manifest) {
    if (BUILTIN_SKILLS.some((s) => s.id === id)) throw new Error(`Cannot update built-in skill: ${id}. Create a user override instead.`);
    this.#validateManifest(manifest);
    const manifestPath = path.join(this.skillsDir, id, "skill.json");
    const payload = JSON.stringify(manifest, null, 2);
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${payload}\n`, "utf8");
    return { id, ...manifest };
  }

  async delete(id) {
    if (BUILTIN_SKILLS.some((s) => s.id === id)) throw new Error(`Cannot delete built-in skill: ${id}`);
    const skillDir = path.join(this.skillsDir, id);
    await rm(skillDir, { recursive: true, force: true });
    return { deleted: id };
  }

  renderPrompt(manifest, inputs = {}) {
    let prompt = String(manifest.prompt || "");
    for (const [key, value] of Object.entries(inputs)) {
      prompt = prompt.replaceAll(new RegExp(`\\{\\{\\s*${escapeRegex(key)}\\s*\\}\\}`, "g"), String(value));
      prompt = prompt.replaceAll(new RegExp(`\\{\\{\\s*inputs\\.${escapeRegex(key)}\\s*\\}\\}`, "g"), String(value));
    }
    prompt = prompt.replaceAll(/\{\{\s*(\w+)\|([^}]+)\s*\}\}/g, (match, name, fallback) => {
      return inputs[name] != null ? String(inputs[name]) : fallback.trim();
    });
    prompt = prompt.replaceAll(/\{\{[^}]+\}\}/g, "");
    return prompt;
  }

  validateInputs(manifest, inputs = {}) {
    const errors = [];
    for (const field of manifest.inputs || []) {
      if (field.required && (inputs[field.name] == null || inputs[field.name] === "")) {
        errors.push(`Missing required input: ${field.name}`);
      }
    }
    return errors;
  }

  recordInvocation(id, inputs = {}, result = {}) {
    const entry = {
      id, inputs,
      result: { ok: result.ok, prompt: result.prompt?.slice(0, 200) },
      at: new Date().toISOString(),
    };
    this.history.unshift(entry);
    this.history = this.history.slice(0, 100);
    return entry;
  }

  getHistory(limit = 20) {
    return this.history.slice(0, Math.min(limit, 100));
  }

  async resolveComposition(manifest, visited = new Set()) {
    const chain = [];
    const compose = manifest.compose || [];
    for (const depId of compose) {
      if (visited.has(depId)) continue;
      visited.add(depId);
      try {
        const dep = await this.get(depId);
        const depChain = await this.resolveComposition(dep, visited);
        chain.push(...depChain, { id: depId, manifest: dep });
      } catch (error) {
        chain.push({ id: depId, error: error.message });
      }
    }
    return chain;
  }

  #validateId(id) {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Skill id must be lowercase letters, digits, and hyphens only");
    if (id.length > 64) throw new Error("Skill id too long (max 64 chars)");
  }

  #validateManifest(manifest) {
    if (!manifest || typeof manifest !== "object") throw new Error("Manifest must be an object");
    if (!manifest.prompt || typeof manifest.prompt !== "string") throw new Error("Manifest must have a 'prompt' string");
    if (manifest.mode && !VALID_MODES.has(manifest.mode)) throw new Error(`Invalid mode: ${manifest.mode}. Must be one of: ${[...VALID_MODES].join(", ")}`);
    if (manifest.inputs && !Array.isArray(manifest.inputs)) throw new Error("inputs must be an array");
    if (manifest.compose && !Array.isArray(manifest.compose)) throw new Error("compose must be an array of skill ids");
  }
}

function escapeRegex(value) {
  return String(value).replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const BUILTIN_SKILLS = [
  {
    id: "analyze-project",
    name: "تحليل المشروع",
    description: "افحص بنية المشروع واقترح خطة تحسين عملية",
    mode: "plan",
    inputs: [],
    tags: ["analysis", "planning"],
    prompt: "حلّل بنية هذا المشروع ثم اقترح خطة تحسين عملية: نقاط القوة، المخاطر، الفرص، والخطوات القابلة للتنفيذ.",
  },
  {
    id: "design-artifact",
    name: "تصميم artifact",
    description: "صمّم واجهة أصلية متجاوبة كـ HTML artifact",
    mode: "design",
    inputs: [{ name: "brief", type: "string", required: true, description: "وصف الواجهة المطلوبة" }],
    tags: ["design", "html"],
    prompt: "صمّم واجهة أصلية متجاوبة لهذا المشروع وأنشئها كـ HTML artifact. استخدم design tokens إن وُجدت.\n\nBrief: {{brief}}",
  },
  {
    id: "quality-check",
    name: "فحص الجودة",
    description: "ابحث عن الأخطاء المحتملة وشغّل الاختبارات الآمنة",
    mode: "build",
    inputs: [],
    tags: ["quality", "tests"],
    prompt: "ابحث عن الأخطاء المحتملة في المشروع، شغّل الاختبارات الآمنة، واقترح إصلاحات مع موافقتي قبل أي تعديل.",
  },
  {
    id: "auto-fix",
    name: "إصلاح تلقائي",
    description: "اكتشف وأصلح المشاكل الشائعة في الملفات تلقائيًا",
    mode: "build",
    inputs: [{ name: "path", type: "string", required: true, description: "ملف أو مجلد للإصلاح" }],
    tags: ["fix", "lint"],
    prompt: "استخدم أداة auto_fix على المسار: {{path}}. اعرض التغييرات المقترحة أولاً، ثم اطلب موافقتي قبل التطبيق.",
  },
  {
    id: "explain-code",
    name: "شرح الكود",
    description: "اشرح بنية ملف معين باستخدام parse_ast",
    mode: "review",
    inputs: [{ name: "path", type: "string", required: true, description: "ملف لشرحه" }],
    tags: ["docs", "review"],
    prompt: "استخدم parse_ast على {{path}} ثم اشرح بنية الملف: الدوال، الفئات، الواردات، والتصديرات.",
  },
];
