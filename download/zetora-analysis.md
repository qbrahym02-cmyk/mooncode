# تحليل شامل لمشروع Zetora v0.9.0

> تقرير تحليل هندسي موجّه للمطورين والمهندسين  
> التاريخ: 14 أغسطس 2026  
> الإصدار المُحلَّل: `zetora-source-v0.9.0`  
> الحجم: 7,338 سطر شفرة · 20 حزمة · 4 تطبيقات · 118 اختبارًا (كلها ناجحة)

---

## جدول المحتويات

1. [الملخص التنفيذي والتعريف بالمشروع](#1-الملخص-التنفيذي-والتعريف-بالمشروع)
2. [المعمارية: بنية Monorepo وتدفق الوكيل](#2-المعمارية-بنية-monorepo-وتدفق-الوكيل)
3. [التحليل الأمني](#3-التحليل-الأمني)
4. [نضج الإنتاج: ما الذي ينقص](#4-نضج-الإنتاج-ما-الذي-ينقص)
5. [المقارنة المرجعية: Pi وOpenDesign وOpenCode](#5-المقارنة-المرجعية-pi-وopendesign-وopencode)
6. [الديون التقنية ونقاط الضعف](#6-الديون-التقنية-ونقاط-الضعف)
7. [تقييم الاختبارات](#7-تقييم-الاختبارات)
8. [التوصيات والخلاصة](#8-التوصيات-والخلاصة)

---

## 1. الملخص التنفيذي والتعريف بالمشروع

### 1.1 ما هو Zetora؟

**Zetora (زيتورا)** هو مساحة عمل محلية للبرمجة والتصميم بالوكلاء (agentic workspace)، تعمل من نواة واحدة عبر ثلاث واجهات: **Web** و**Desktop** (Electron) و**TUI** (واجهة الطرفية). الفلسفة الأساسية للمنتج هي **local-first**: بيانات المستخدم تبقى على جهازه، وكل نموذج/مزوّد قابل للاستبدال، وكل عملية لها تبعات تطلب موافقة صريحة قبل التنفيذ.

المشروع يصرّح بكونه **إعادة تنفيذ مستقلة** (independent reimplementation) لقدرات مشابهة لثلاثة مشاريع مرجعية: Pi وOpen Design وOpenCode. وقد التزم بسياسة `CLEAN_ROOM.md` بعدم نسخ أي شفرة أو شعار أو أصل من هذه المراجع، بل استخدامها كمراجع وظيفية ومعمارية فقط. ملف `PROVENANCE.json` يوثّق لقطات الـcommit للمراجع الثلاثة ويؤكد أنها «research-only and not build inputs».

### 1.2 الأرقام الرئيسية

| المؤشر | القيمة |
|---|---|
| إجمالي أسطر الشفرة (JS) | 7,338 |
| عدد الحزم (packages) | 20 |
| عدد التطبيقات (apps) | 4 (web, server, desktop, tui) |
| عدد ملفات الاختبار | 18 |
| عدد حالات الاختبار | 118 (كلها ناجحة) |
| التبعيات التشغيلية | صفر لنسخة Web/TUI (Node.js 20.12+ قياسي فقط) |
| اللغة الأساسية | JavaScript (ES Modules) |
| الترخيص | All Rights Reserved (مع `[OWNER LEGAL NAME]` كحامل حقوق) |
| الإصدار | 0.9.0 |

### 1.3 أبرز نتائج التحليل

1. **معمارية نظيفة ومفصولة**: فصل واضح بين النواة (`kernel`)، الوكيل (`agent`)، المزوّدين (`providers`)، والأدوات (`tools`). كل حزمة لها مسؤولية واحدة محددة، والاعتمادات تتجه في اتجاه واحد (agent ← kernel/providers/tools).

2. **نموذج مخاطر أصلي ومبتكر**: نظام خماسي `observe/modify/execute/external/blocked` يُطبَّق في النواة من اليوم الأول، وهو أفضل من Pi الذي يعترف بأنه لا يوفّر افتراضيًا نظام صلاحيات يحاصر filesystem/process/network.

3. **تباين إصدار حرج**: `package.json` و`PROVENANCE.json` يقولان 0.9.0، لكن `CHANGELOG.md` يصل فقط إلى v0.5.0. هذا يعني أن **4 إصدارات (0.6–0.9) غير موثقة**، وهي تشمل حزمًا كاملة (collab, lsp, plugins, search-index, todos, security مع ED25519). هذا أكبر دين تقني في المشروع.

4. **أمان تطوري جيد لكنه غير مكتمل**: توقيع ED25519 للإضافات (v0.9) هو تحسين جوهري على SHA-256 المزيف في v0.6-0.8. كشف الأسرار (11 نمط) وحد المعدل وسجل التدقيق كلها ممتازة. لكن تنقص: CSP nonce، CSRF/origin checks، keychain OS، عزل العمليات.

5. **تخزين غير مناسب للإنتاج**: `JsonStore` ذري (atomic rename) لكنه JSON مسطّح مع قائمة انتظار تسلسلية. للإنتاج: مخطط SQLite + WAL + ترحيل schema + أرقام تسلسلية للأحداث.

6. **اختبارات كمية جيدة لكن نوعيًا ناقصة**: 118 اختبارًا ناجحًا يغطون الوحدات جيدًا، لكن لا توجد اختبارات E2E، لا اختبارات provider حقيقية (تتجاوز الشبكة)، لا اختبارات أمنية اختراقية، لا اختبارات load/stress، وتغطية `server.js` (55KB) ضعيفة.

7. **ملف خادم ضخم**: `apps/server/src/server.js` بـ55KB و1,800+ سطر في ملف واحد، يضم كل نقاط النهاية والـrouting ومعالجة multipart وSSE. يحتاج تقسيمًا عاجلًا.

8. **جاهز للنموذج الأولي، غير جاهز للإنتاج**: المشروع ناضج كـprototype ممتاز، لكن بعيد عن متطلبات الإنتاج: لا signing/notarization، لا auto-update موثّق، لا عزل حاويات لأوامر الوكيل، لا partial-tool-JSON recovery، لا WebSocket للطرفية (SSE فقط).

---

## 2. المعمارية: بنية Monorepo وتدفق الوكيل

### 2.1 البنية العامة

Zetora يستخدم بنية **monorepo** بسيطة بدون أدوات إدارة معقدة (لا Turborepo، لا Nx، لا Lerna). اعتماد `npm workspaces` يكفي لأن التطبيقات لا تحتاج تبعيات خارجية في نسخة Web/TUI.

```text
apps/
  web/        عميل المتصفح (HTML/CSS/JS خام، بدون framework)
  server/     خادم HTTP محلي + تقديم ملفات ثابتة
  desktop/    غلاف Electron
  tui/        عميل الطرفية المستقل (readline)
packages/
  kernel/     الأحداث (EventType) + سياسة المخاطر (Risk)
  agent/      حلقة الوكيل + الاستئناف + MCP + skills + context
  providers/  محولات النماذج (6 أنواع) + البث + الصور + تقدير التكلفة
  tools/      أدوات مساحة العمل (12 أداة) + Workspace class
  storage/    تخزين JSON ذري
  git/        تكامل Git: checkpoints + undo + فروع + worktrees + graph
  pty/        جلسات shell الدائمة
  artifacts/  سجل عارضين: 40+ امتداد
  watcher/    مراقب الملفات + SSE
  context/    ملفات السياق + ضغط السجل (compaction)
  mcp/        عميل Model Context Protocol (JSON-RPC 2.0 stdio)
  skills/     سجل المهارات + 5 builtins
  design/     design tokens + ورقة CSS + مرجع بصري
  autofix/    إصلاح تلقائي + تشخيص أخطاء (13 نمط)
  security/   ED25519 signing + trust registry + audit + rate-limit + secrets
  collab/     تحرير تعاوني (Lamport timestamps)
  lsp/        تشخيصات ESLint + TypeScript
  plugins/    سجل إضافات مع توقيع
  search-index/  فهرس trigram للبحث السريع
  todos/      قائمة مهام الجلسة
```

### 2.2 الحزم الـ20 وأدوارها

يبيّن الجدول التالي توزيع الشفرة عبر الحزم، مرتّبًا تنازليًا بالحجم:

| الحزمة | ملفات | أسطر | الدور |
|---|---:|---:|---|
| `providers` | 1 | 551 | محولات 6 مزوّدين + بث + صور + تقدير تكلفة |
| `tools` | 3 | 575 | Workspace class + 12 أداة + catalog |
| `agent` | 2 | 418 | حلقة الوكيل + الاستئناف + subagents |
| `security` | 4 | 364 | ED25519 + trust + audit + rate-limit + secrets |
| `git` | 1 | 317 | checkpoints + undo + branches + worktrees + graph |
| `autofix` | 1 | 311 | fixers + ESLint/Prettier + diagnoseError |
| `mcp` | 1 | 309 | عميل JSON-RPC 2.0 + registry |
| `pty` | 1 | 217 | جلسات shell دائمة |
| `skills` | 1 | 210 | manifests + CRUD + composition + 5 builtins |
| `collab` | 1 | 195 | تحرير تعاوني بنظام Lamport |
| `context` | 2 | 204 | ملفات سياق + compactor |
| `lsp` | 1 | 175 | ESLint + tsc one-shot |
| `search-index` | 1 | 176 | فهرس trigram |
| `artifacts` | 1 | 167 | عارض 40+ امتداد |
| `plugins` | 1 | 166 | سجل إضافات + توقيع |
| `design` | 1 | 153 | design tokens + CSS + reference |
| `todos` | 1 | 87 | قائمة مهام بسيطة |
| `watcher` | 1 | 84 | fs.watch + SSE |
| `kernel` | 3 | 75 | EventType + Risk + PRODUCT |

**ملاحظة**: الحزمة الأكبر (`providers` بـ551 سطرًا) تحتاج تقسيمًا — كل مزوّد يستحق ملفه الخاص. الحزمة الأصغر (`kernel` بـ75 سطرًا) مثال ممتاز على مبدأ «افعل شيئًا واحدًا وافعله جيدًا».

### 2.3 نمط الأحداث NDJSON

النواة تعرّف مفردات أحداث محايدة للعرض (presentation-neutral)، ما يسمح لطرفية وواجهة رسومية بعرض نفس التشغيل:

```js
// packages/kernel/src/events.js (مبسّط)
export const EventType = Object.freeze({
  RUN_STARTED: "run.started",
  TEXT_DELTA: "text.delta",
  TEXT_DONE: "text.done",
  TOOL_STARTED: "tool.started",
  TOOL_FINISHED: "tool.finished",
  APPROVAL_REQUIRED: "approval.required",
  APPROVAL_RESOLVED: "approval.resolved",
  RUN_RESUMED: "run.resumed",
  CONTEXT_COMPACTED: "context.compacted",
  USAGE: "usage",
  ERROR: "error",
  RUN_FINISHED: "run.finished",
});
```

هذه الأحداث تُبَث عبر **NDJSON stream** في `POST /api/chat` و`POST /api/agent/run`. كل سطر JSON object مستقل، ما يسهّل الاستهلاك التدريجي في المتصفح والـTUI على حد سواء. قرار ممتاز: فصل العرض عن المنطق من اليوم الأول.

### 2.4 تدفق الوكيل: context → provider → tool → approval

حلقة الوكيل في `AgentRunner.run()` (418 سطر) تتبع النمط التالي:

1. **بناء system prompt**: يجمع base prompt + ملفات السياق المُجمَّعة + design tokens (في وضع design) + وصف المهارات المتاحة.
2. **ضغط السجل**: إذا تجاوز التاريخ 30 رسالة، يُلخّص الـ22 الأقدم عبر نموذج، مع الاحتفاظ بآخر 8 رسائل حرفيًا.
3. **جمع أدوات MCP**: مخزّنة مؤقتًا 60 ثانية لتفادي إرهاق الخوادم.
4. **حلقة محدودة**: `maxSteps = min(input.maxSteps ?? 8, 12)` — حد أقصى 12 خطوة.
5. **استدعاء النموذج**: `callModel()` يطبّع 6 مزوّدين إلى شكل موحّد `{ text, toolCalls, stopReason, usage }`.
6. **بث deltas**: `onDelta` callback يُصدر `text.delta` فورًا.
7. **تقدير التكلفة**: `estimateCost()` يطابق النموذج مع جدول أسعار، يُراكم عبر الخطوات.
8. **معالجة tool calls**: لكل استدعاء:
   - يُصنّف المخاطرة عبر `toolRisk(name)`.
   - أدوات المراقبة تنفّذ مباشرة.
   - أدوات التعديل/التنفيذ/الخارجية تُوقِف الحلقة وتطلب موافقة.
   - عند الموافقة، يُنفّذ الأداة ثم **تُستأنف الحلقة تلقائيًا** مع نتيجة الأداة.
9. **إنهاء**: عند عدم وجود toolCalls أو بلوغ maxSteps، يُصدر `run.finished`.

```js
// packages/agent/src/runner.js (مقتطف مبسّط)
for (let step = 0; step < maxSteps; step += 1) {
  const response = await callModel({...}, { messages, tools, onDelta }, this.env);
  if (response.text) emit(createEvent(EventType.TEXT_DONE, { runId, text: response.text }));
  if (!response.toolCalls?.length) break;
  for (const call of response.toolCalls) {
    const risk = toolRisk(call.name);
    const result = await this.executeTool(call, false);
    if (result?.approvalRequired) {
      // وقف الحلقة، انتظر موافقة، استئناف بعدها
      await new Promise((resolve) => { this.pending.set(runId, { messages, resume: resolve }); });
      const resolved = await this.#executeAnyTool(call, true);
      messages.push({ role: "user", content: `Tool ${call.name} returned:\n${serialize(resolved)}` });
    }
  }
}
```

### 2.5 نظام المخاطر الخماسي

هذا من أكثر جوانب Zetora ابتكارًا. بدل ثنائي «آمن/خطير»، يُعرّف 5 مستويات:

| المستوى | المعنى | أمثلة |
|---|---|---|
| `OBSERVE` | قراءة فقط، لا موافقة | `list_files`, `read_file`, `search_text`, `grep`, `fetch_url`, `run_tests`, `parse_ast`, `search_index`, `todo_update` |
| `MODIFY` | يُعدّل الملفات، موافقة مطلوبة | `write_file`, `replace_text`, `auto_fix` |
| `EXECUTE` | يُنفّذ أوامر shell، موافقة مطلوبة | `run_command` |
| `EXTERNAL` | خارج مساحة العمل/نظام، موافقة مطلوبة دائمًا | `spawn_subagent`, `worktree`, كل أدوات `mcp.*`, `invoke_skill` |
| `BLOCKED` | ممنوع حتى مع الموافقة | أوامر خطرة (`rm -rf /`, `mkfs`, `dd of=/dev/`, fork bomb) |

تصنيف الأوامر في `classifyCommand()` يستخدم regex للكشف عن:
- **مدمّرة**: `rm -rf`, `mkfs`, `fdisk`, `shutdown`, `reboot`, `dd of=/dev/`, `chmod -R 777 /`, fork bombs.
- **قراءة فقط**: `pwd`, `ls`, `find`, `cat`, `grep`, `git status/diff/log`, `npm test`, `node --test`.

هذا التصنيف أفضل من Pi الذي يعترف README بأنه «لا يوفّر افتراضيًا نظام صلاحيات يحاصر filesystem/process/network/credentials». Zetora يبني هذه السياسة في النواة من v0.1.

### 2.6 Subagents: عزل المهام الفرعية

أداة `spawn_subagent` تُشغّل وكيلًا فرعيًا بمحادثة منفصلة (لا تاريخ موروث)، خطوات محدودة (max 8)، و**عمق = 1** لمنع recursion:

```js
async #spawnSubagent(input) {
  const subInput = {
    prompt: String(input.prompt || ""),
    maxSteps: Math.min(Number(input.maxSteps ?? 5), 8),
    provider: "demo",  // فرضي — يجب تحسينه ليأخذ مزوّد الأب
    stream: false,
  };
  const subEvents = [];
  const result = await this.run(subInput, (event) => subEvents.push(event));
  return { ok: result.status === "completed", text: result.text, steps: ..., usage: result.usage };
}
```

**نقطة ضعف**: الـsubagent يجبر على `provider: "demo"` بدل توريث مزوّد الأب. هذا يحدّ من فائدة الميزة في الإنتاج. يجب تمرير `input.provider` و`input.model` من الأب.

### 2.7 MCP: Model Context Protocol

عميل MCP يتحدث JSON-RPC 2.0 عبر stdio، بدون أي SDK خارجي. يُحقّق:

- `initialize` مع protocolVersion `2024-11-05`.
- `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`.
- أدوات من خوادم متعددة تُجمَّع بأسماء مُسمّاة `mcp.<serverId>.<toolName>` لتفادي التصادم.
- كل استدعاء MCP يُعامَل كـ`Risk.EXTERNAL` — موافقة إلزامية.
- تكوين في `.zetora/mcp.json` لكل مساحة عمل.

قرار سليم: تفضيل stdio transport بدل HTTP يبقي الخوادم معزولة ويسمح بإعادة استخدامها من أدوات أخرى. لكن **لا يوجد دعم SSE transport** (الذي يسمح بخوادم بعيدة)، ولا آلية لاكتشاف الخوادم تلقائيًا.

### 2.8 بيان الأحداث المشترك (Shared Event Contract)

قرار معماري ممتاز: **Web وDesktop وTUI هم عملاء لنفس النطاق**، لا تطبيقات منفصلة. هذا يتحقق عبر:

1. النواة تُصدر أحداثًا محايدة للعرض.
2. الخادم يبثها عبر NDJSON stream.
3. كل واجهة تستهلك نفس الـstream وتعرضه بطريقتها.

النتيجة: إضافة ميزة في النواة تظهر فورًا في كل الواجهات. هذا عكس المشاريع التي تبني واجهات منفصلة لكل منصة.

---

## 3. التحليل الأمني

### 3.1 حصر المسارات (Path Traversal Prevention)

`Workspace.resolve()` يطبّق فحصًا صارمًا:

```js
resolve(relative = ".") {
  const input = String(relative).replaceAll("\\", "/").replace(/^\/+/, "");
  if (input.includes("\0")) throw Object.assign(new Error("Invalid path"), { status: 400 });
  const candidate = path.resolve(this.root, input || ".");
  if (candidate !== this.root && !candidate.startsWith(`${this.root}${path.sep}`)) {
    throw Object.assign(new Error("Path escapes the selected workspace"), { status: 403 });
  }
  return candidate;
}
```

يحمي من:
- **Path traversal** (`../../../etc/passwd`).
- **Null byte injection** (`file\0.txt`).
- **Windows backslash** (يُطبَّع إلى `/`).
- **Absolute paths** (تُزال الشرطة المبدئية).

**ثغرة محتملة**: على Windows، `path.sep` هو `\\`، لكن `startsWith` قد لا يلتقط حالة `C:\workspace` vs `C:\workspace-evil`. لكن هذا حافة نادرة والمشروع يستهدف localhost.

### 3.2 تصنيف الأوامر والقائمة السوداء

`classifyCommand()` في `packages/kernel/src/policy.js` يستخدم 5 regex للمدمّرات و1 للقراءة فقط:

```js
const destructive = [
  /(^|\s)rm\s+(-[^\s]*[rf][^\s]*\s+)*\/?($|\s)/i,        // rm -rf /
  /(^|\s)(mkfs|fdisk|parted|shutdown|reboot|halt)\b/i,   // أوامر النظام
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/,                       // fork bomb
  /(^|\s)dd\s+.*\bof=\/dev\//i,                           // dd to device
  /(^|\s)chmod\s+-R\s+777\s+\//i,                         // chmod 777 /
];
```

**نقاط ضعف في القائمة السوداء**:

1. **سهولة التجاوز**: `rm -rf /` يُحجب، لكن `rm -rf ${HOME}` أو `rm -rf ~` لا. كذلك `rmdir /s /q` على Windows غير مغطّى.
2. **ترميز بديل**: `r""m` أو `r''m` في bash، أو `$IFS` كفاصل، قد يتهرّب.
3. **الأوامر عبر variables**: `CMD="rm -rf /"; $CMD` لا يُكشف لأن regex يطابق النص الحرفي.
4. **pipelines**: `cat /dev/urandom > /dev/sda` ليس في القائمة رغم خطورته.
5. **أوامر شبكة خطرة**: `curl ... | sh`، `wget ... | bash` غير مغطّاة.

**التوصية**: القائمة السوداء وحدها غير كافية أبدًا. يجب إضافة:
- **قائمة بيضاء** للأوامر الآمنة المسموح بها.
- **عزل العمليات** (container/seccomp profile) للأوامر غير المصنّفة.
- **تحليل argument** بدل regex وحده (استخدام مكتبة shell-parser).

### 3.3 نموذج الموافقة الصريح

كل عملية `MODIFY` أو `EXECUTE` أو `EXTERNAL` تُوقِف حلقة الوكيل وتُنشئ طلب موافقة:

```js
const approval = {
  id: crypto.randomUUID(),
  runId,
  status: "pending",
  tool: call,
  risk: result.risk || risk,
  summary: call.name === "run_command" ? call.input?.command : `${call.name}: ${call.input?.path ?? ""}`,
};
await this.approvalStore?.(approval);
emit(createEvent(EventType.APPROVAL_REQUIRED, { runId, approval }));
await new Promise((resolve) => {
  this.pending.set(runId, { messages, resume: resolve });
  this.#snapshot(runId, messages);
});
```

عند الموافقة (`POST /api/approvals/:id` بقرار `approve`/`deny`):
- **approve**: يُنفّذ الأداة بـ`approved=true`، تُضاف النتيجة للرسائل، **تُستأنف الحلقة تلقائيًا**.
- **deny**: تُضاف رسالة «رفض المستخدم»، يُستأنف الوكيل لاقتراح بديل.

هذا النموذج أفضل من مجرد «تنفيذ أو لا»، لأنه يبقي الوكيل في سياق المحادثة ويسمح له بالتكيّف.

### 3.4 توقيع الإضافات: ED25519 (v0.9)

أكبر تحسين أمني في v0.9: استبدال SHA-256 المزيف بـED25519 حقيقي:

```js
// packages/security/src/index.js
export class PluginSigner {
  async sign(manifest, entryContent = "") {
    const privateKey = await this.#loadPrivateKey();
    const payload = this.#canonical({ ...manifest, signature: undefined }) + entryContent;
    const signature = sign(null, Buffer.from(payload, "utf8"), privateKey);
    return `ed25519:${signature.toString("base64")}`;
  }
  async verify(manifest, entryContent = "") {
    const publicKey = await this.#loadPublicKey();
    const signature = Buffer.from(manifest.signature.slice("ed25519:".length), "base64");
    const ok = verify(null, Buffer.from(payload, "utf8"), publicKey, signature);
    return { verified: ok, reason: ok ? "valid" : "invalid_signature" };
  }
}
```

**لماذا هذا مهم؟** تعليق الكود يشرح:

> The old v0.6 SHA-256 hash (which anyone could forge because there was no private key) was misleadingly named "verified". v0.9 replaces it with real public-key cryptography.

الـ`PluginRegistry` في v0.9 صريح في تسمية الحقول:
- `signedByAuthor`: true فقط عند توقيع صالح من مفتاح خاص موثوق.
- `signatureValid`: التوقيع رياضيًا صالح.
- `authorTrusted`: المؤلف في `TrustRegistry`.
- `verified`: يُforced إلى `false` للأنماط القديمة (لتفادي الالتباس).

`TrustRegistry` يخزّن مفاتيح عامة للمؤلفين الموثوقين في `trust-registry.json` مع مستوى ثقة (`trusted`/`first-party`).

**نقطة ضعف**: نموذج **trust-on-first-use** — المفتاح العام مُثبّت في تثبيت Zetora. للإنتاج: سلسلة شهادات (certificate chain) + OCSP/CRL.

### 3.5 كشف الأسرار (Secret Redaction)

`packages/security/src/secrets.js` يعرّف 11 نمطًا لكشف الأسرار:

| النوع | النمط | البديل |
|---|---|---|
| OpenAI key (project) | `sk-proj-[a-zA-Z0-9]{20,}` | `[REDACTED:OPENAI_KEY]` |
| OpenAI key (legacy) | `sk-[a-zA-Z0-9]{20,}` | `[REDACTED:OPENAI_KEY]` |
| Anthropic key | `sk-ant-[a-zA-Z0-9-_]{20,}` | `[REDACTED:ANTHROPIC_KEY]` |
| GitHub token | `gh[pousr]_[A-Za-z0-9]{36,}` | `[REDACTED:GITHUB_TOKEN]` |
| Bearer token | `Bearer\s+[a-zA-Z0-9._-]{20,}` | `[REDACTED:BEARER_TOKEN]` |
| JWT | `eyJ[...]\.[...]\.[...]` | `[REDACTED:JWT]` |
| AWS access key | `AKIA[0-9A-Z]{16}` | `[REDACTED:AWS_ACCESS_KEY]` |
| AWS secret | `aws_secret_access_key\s*[=:]...` | `[REDACTED:AWS_SECRET]` |
| Private key | `-----BEGIN ... PRIVATE KEY-----` | `[REDACTED:PRIVATE_KEY]` |
| Google API key | `AIza[0-9A-Za-z_-]{35}` | `[REDACTED:GOOGLE_API_KEY]` |
| Generic password | `password\s*[=:]...` | `[REDACTED:PASSWORD]` |

دالة `redactSecrets()` تُعيد `{ redacted, found }` — النص المُنقّى + قائمة ما وُجد (بدون القيم الفعلية للمراجعة). `withRedaction()` wrapper يلتف حول أي دالة لتنقية مخرجاتها.

**ترتيب ذكي**: Bearer tokens تُفحص **قبل** JWT لأن JWTs تظهر غالبًا بعد `Bearer `. هذا تفصيل مهم يمنع التطابق الجزئي الخاطئ.

### 3.6 حد المعدل (Rate Limiting)

`RateLimiter` يستخدم **sliding window counter** لكل مُعرّف (IP أو session id):

```js
check(id, weight = 1) {
  const now = Date.now();
  let bucket = this.buckets.get(id);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + this.windowMs };
    this.buckets.set(id, bucket);
  }
  bucket.count += weight;
  const allowed = bucket.count <= this.max;
  return { allowed, count: bucket.count, limit: this.max, remaining, resetAt, retryAfterMs };
}
```

ميزات جيدة:
- **Prune دوري** لتفادي تسرّب الذاكرة.
- **رؤوس HTTP قياسية**: `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`, `retry-after`.
- **Weight parameter**: يسمح بإعطاء أوزان مختلفة للنقاط الحساسة (مثل `/api/chat` وزن 5، `/api/health` وزن 1).

**نقطة ضعف**: في الذاكرة فقط (in-memory) — لا يعمل عبر إعادة تشغيل أو عبر عمليات متعددة. للإنتاج: Redis أو SQLite-backed.

### 3.7 سجل التدقيق (Audit Log)

`AuditLog` يكتب سجلات NDJSON غير قابلة للتعديل في `.zetora/audit.log`:

```js
async record(entry) {
  const record = { id: crypto.randomUUID(), at: new Date().toISOString(), ...entry };
  this.buffer.push(record);
  if (this.buffer.length >= this.maxBuffer) await this.#flush();
  else if (!this.flushTimer) {
    this.flushTimer = setTimeout(() => { this.#flush(); this.flushTimer = null; }, 2000).unref();
  }
}
```

ميزات:
- **Batching**: يكتب بعد 50 سجل أو 2 ثانية (أيهما أول).
- **Append-only**: `flag: "a"` يضمن عدم الكتابة فوق.
- **قابل للفحص بأدوات قياسية**: `grep`, `jq`.
- **تصفية بالـaction**: `read({ action: "file.write" })`.

**نقطة ضعف**: لا يوجد دوران (rotation) — الملف ينمو بلا حدود. `MAX_ENTRIES = 10_000` في `stats()` لكن الكتابة بلا حد. يجب إضافة log rotation.

### 3.8 حدود الحمولة (Payload Limits)

الشفرة مليئة بحدود دفاعية ممتازة:

| المورد | الحد |
|---|---|
| حجم الملف للقراءة | 1MB افتراضي، 5MB أقصى |
| نتائج البحث | 100 افتراضي، 500 أقصى |
| عمق شجرة الملفات | 5 افتراضي، 12 أقصى |
| عدد الملفات في الشجرة | 1,200 افتراضي، 5,000 أقصى |
| إخراج العملية | 250KB |
| فرق Git | 250KB |
| سجل Git | 200 commit |
| ملفات AutoFix لكل تشغيل | 50 |
| مهلة الأمر | 30s افتراضي، 120s أقصى |
| مهلة Git | 15s افتراضي، 60s أقصى |
| مهلة fetch_url | 30s |
| maxBytes لـfetch_url | 500KB افتراضي، 2MB أقصى |
| maxSteps للوكيل | 8 افتراضي، 12 أقصى |
| maxSteps لـsubagent | 5 افتراضي، 8 أقصى |
| رسائل التاريخ | آخر 30 |

### 3.9 عزل المعاينة (Preview Sandbox)

الـiframe في واجهة الويب يستخدم:
```html
<iframe sandbox="allow-scripts allow-pointer-lock" referrerpolicy="no-referrer">
```

`allow-same-origin` **مُستبعد عمدًا**، مما يمنع scripts داخل المعاينة من:
- الوصول إلى cookies التطبيق.
- الوصول إلى localStorage/sessionStorage.
- إجراء طلبات XHR باسم التطبيق.
- التلاعب بـDOM الأب.

قرار أمني سليم.

### 3.10 ما ينقص أمنيًا

من `docs/ARCHITECTURE.md` و`docs/ROADMAP.md`، هذه الأمنيات المعلّقة:

1. **CSP nonce**: لا توجد سياسة Content-Security-Policy ديناميكية. هذا يترك التطبيق عرضة لـXSS إذا تسرّب محتوى إلى DOM.
2. **CSRF/Origin checks**: الخادم لا يتحقق من Origin header للطلبات المُعدِّلة. على localhost هذا مقبول، لكن عند ربط بـ`0.0.0.0` يصبح خطرًا.
3. **OS keychain**: المفاتيح في `sessionStorage` (متصفح) أو `process.env` (خادم). يجب تكامل keychain OS لسطح المكتب.
4. **عزل العمليات**: أوامر الوكيل تُنفّذ بـ`spawn` في نفس عملية الخادم. يجب عزلها في حاويات/seccomp profiles.
5. **Signed/notarized builds**: توزيع سطح المكتب غير موقّع. يجب auto-update موثّق + code signing لنظام التشغيل.
6. **Permission matrix**: لا توجد مصفوفة صلاحيات دقيقة (لكل أداة/مسار/أمر/مضيف). الموافقة ثنائية فقط.
7. **Plugin sandbox**: الإضافات تُحمَّل في نفس العملية (مفترضًا). يجب sandbox مع capability grants.

---

## 4. نضج الإنتاج: ما الذي ينقص

### 4.1 التخزين: JSON ذري لكنه غير كافٍ

`JsonStore` يستخدم atomic write مع rename:

```js
async write(value) {
  const operation = async () => {
    const temporary = `${this.#file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.#file);  // atomic on POSIX
  };
  this.#queue = this.#queue.then(operation, operation);  // serialized
  return this.#queue;
}
```

مميزات:
- **Atomic**: `rename()` ذري على POSIX، يمنع الكتابات الجزئية.
- **Serialized**: قائمة انتظار تسلسلية تمنع التداخل.
- **Safe defaults**: `mode: 0o600` يقيد القراءة للمالك.
- **Clone**: `structuredClone` يمنع التطرف (mutation) العرضي.

**محدوديات للإنتاج**:
1. **O(n) read/write**: كل كتابة تُسلسل الـJSON كامل. مع 10,000 موافقة، يصبح بطيئًا.
2. **لا queries**: لا يمكن البحث بكفاءة. `find` على array في الذاكرة.
3. **لا concurrent readers**: قائمة الانتظار تسلسلية حتى للقراءة.
4. **لا schema migrations**: تغيير بنية البيانات يتطلب迁移 يدوي.
5. **لا event sequence numbers**: لا يمكن ضمان ترتيب الأحداث عبر إعادة التشغيل.
6. **لا replication**: نسخة واحدة فقط على القرص.

**المخطط** (من ARCHITECTURE.md): SQLite + WAL + schema migrations + event sequence numbers + recovery tests. هذا الطريق الصحيح.

### 4.2 المزوّدون: بث بدون retry/backoff

ملف `packages/providers/src/index.js` (551 سطرًا) يطبّع 6 مزوّدين لكنه يفتقر إلى:

1. **Retry/backoff**: فشل الشبكة = فشل الطلب. لا إعادة محاولة أسيّة.
2. **Partial tool JSON recovery**: بعض المزوّدين (خاصة Claude) يُرجعون tool calls كـJSON جزئي عبر deltas. الشفرة الحالية تستخدم `JSON.parse(call.function?.arguments || "{}")` مع catch generic — هذا يعني JSON ناقص يُصبح `{}` بصمت.
3. **Reasoning parts**: لا دعم لـthinking/reasoning tokens (ميزة Claude 3.5+).
4. **Streaming abort**: لا يمكن إلغاء طلب streaming منتصفه (AbortController غير مربوط بشكل كامل).
5. **Token usage parsing**: كل مزوّد يُرجع usage بشكل مختلف. التطبيع قد يفقد معلومات (مثل `cache_read_input_tokens` في Anthropic).

### 4.3 الطرفية: SSE بدل WebSocket

`PtySession` يُنشئ shell دائم ويتتبّع cwd/env/history. لكن التواصل مع العميل عبر **SSE (Server-Sent Events)** بدل WebSocket يعني:
- **اتجاه واحد فقط**: الخادم → العميل. العميل يرسل عبر POST منفصل.
- **لا backpressure**: إذا بطأ العميل، يتراكم الـbuffer.
- **لا resize في الوقت الفعلي**: يتطلب طلب POST منفصل.
- **لا interrupt فوري**: Ctrl+C يتأخر حتى الـPOST التالي.

`docs/ARCHITECTURE.md` يخطط لـ«WebSocket/PTY protocol with terminal resize and backpressure» — هذا ضروري للإنتاج.

### 4.4 سطح المكتب: غير موقّع

`apps/desktop/src/main.cjs` (2KB) غلاف Electron أولي. من `CLEAN_ROOM.md` و`ROADMAP.md`:
- لا code signing لنظام التشغيل (macOS notarization، Windows Authenticode).
- لا auto-update موثّق (يجب توقيع delta updates).
- لا keychain integration (مفاتيح في env أو sessionStorage).
- contextIsolation وsandboxing مفعّلان (جيد)، لكن لا CSP nonce في renderer.

### 4.5 خارطة الطريق ومكان المشروع فيها

`docs/ROADMAP.md` يعرّف 5 مراحل:

| المرحلة | الوصف | الحالة |
|---|---|---|
| Phase 0 | الأساس: Web UI، حزم مشتركة، تخزين محلي، NDJSON، TUI، Electron | ✅ مكتملة |
| Phase 1 | وكيل برمجة موثوق: streaming، git، PTY، vision، context، MCP، أدوات متقدمة | 🟡 ~85% — ينقص: reasoning parts، partial-tool-JSON، permission matrix |
| Phase 2 | مساحة تصميم: skills، design tokens، preview معزول | 🟡 ~50% — ينقص: renderers متعددة، screenshot comparison، export pipeline |
| Phase 3 | عملاء المنتج: Desktop packaging، TUI binaries، PWA، i18n كامل | 🔴 ~15% — Desktop أولي فقط |
| Phase 4 | الإضافات والنظام البيئي: capability-scoped runtime، signed manifests، registries | 🟡 ~30% — signing ED25519 موجود، ينقص runtime sandbox وregistry |
| Phase 5 | الفرق والاستضافة: accounts، sync، role policy، audit، telemetry | 🔴 ~10% — audit log موجود، ينقص كل الباقي |

المشروع في منتصف Phase 1-2، مع لمسات من Phase 4. **غير جاهز للإنتاج** بأي تعريف معقول.

### 4.6 معايير الإنتاج المفقودة

مقارنة مع متطلبات الإنتاج القياسية:

| المعيار | الحالة | الأولوية |
|---|---|---|
| CSP nonce | ❌ مفقود | عاجل |
| CSRF/Origin checks | ❌ مفقود | عاجل (عند ربط 0.0.0.0) |
| SQLite + WAL | ❌ JSON فقط | مهم |
| Schema migrations | ❌ مفقود | مهم |
| OS keychain | ❌ env/sessionStorage | مهم |
| Signed/notarized builds | ❌ مفقود | مهم (للإصدار العام) |
| Auto-update موثّق | ❌ مفقود | مهم |
| عزل العمليات للحاويات | ❌ spawn مباشر | متوسط |
| WebSocket للطرفية | ❌ SSE فقط | متوسط |
| Partial-tool-JSON recovery | ❌ catch generic | متوسط |
| Retry/backoff للمزوّدين | ❌ مفقود | متوسط |
| Log rotation | ❌ مفقود | متوسط |
| OpenTelemetry/telemetry | ❌ مفقود | منخفض |
| Load/stress tests | ❌ مفقود | متوسط |
| E2E tests | ❌ مفقود | متوسط |
| Accessibility audit | ❌ مفقود | متوسط |
| i18n كامل (RTL + EN) | 🟡 جزئي (UI عربي موجود) | متوسط |

---

## 5. المقارنة المرجعية: Pi وOpenDesign وOpenCode

`docs/ANALYSIS_AR.md` (17KB) يوثّق التحليل الأصلي للمراجع الثلاثة. هذا القسم يُقارن قدرات Zetora الحالية معها.

### 5.1 جدول مقارنة مباشر

| القدرة | Pi | Open Design | OpenCode | Zetora v0.9.0 | التقييم |
|---|---|---|---|---|---|
| Provider abstraction | ممتازة (175 ملف) | تعتمد على agents | واسعة | 6 مزوّدين في 551 سطر | 🟡 مبسّط لكن كافٍ |
| Agent loop | جوهر المشروع | orchestrates | جوهر البرمجة | 418 سطر، maxSteps 12 | 🟡 محدود لكن نظيف |
| TUI | ممتازة (39 ملف) | headless | قوية | 102 سطر readline | 🔴 بدائي جدًا |
| Desktop/Web | محدود بصريًا | قوي | قوي جدًا (480 ملف) | Web-first + Electron أولي | 🟡 Web جيد، Desktop أولي |
| Code tools | read/bash/edit/write | عبر agent | شاملة + LSP/MCP/git | 12 أداة + LSP + MCP + git | 🟢 جيدة |
| Permissions | يحتاج sandbox خارجي | capability boundaries | permission flows | approval في kernel من v0.1 | 🟢 أفضل من Pi |
| Artifacts | محدود | الأفضل (40+ نوع) | preview/review | 40+ امتداد في 167 سطر | 🟢 جيدة |
| Plugins/skills | extensions/skills | protocol/marketplace | plugins/skills/MCP | manifest + ED25519 + 5 builtins | 🟡 بداية جيدة |
| Sessions | eventful + CBOR | persisted runs | durable متقدم | NDJSON + events[] | 🟡 غير durable sequence |
| Local-first | نعم | نعم | نعم | نعم إلزامي | 🟢 ملتزم |
| Compaction | نعم | — | متقدم | 30 رسالة → ملخص | 🟡 مبسّط |
| Subagents | نعم | — | نعم | depth=1، maxSteps 8 | 🟡 محدود (demo provider) |
| Worktrees | — | — | نعم | list/add/remove | 🟢 موجود |
| Collaborative editing | — | — | — | Lamport timestamps (v0.7) | 🟢 ميزة فريدة |
| Plugin signing | npm signatures | marketplace trust | — | ED25519 (v0.9) | 🟢 أفضل من SHA-256 |
| Audit log | — | — | — | NDJSON غير قابل للتعديل | 🟢 ميزة جيدة |
| Secret redaction | — | — | — | 11 نمط | 🟢 ميزة جيدة |
| Rate limiting | — | — | — | sliding window | 🟢 ميزة جيدة |
| Search index | — | — | — | trigram (v0.6) | 🟢 ميزة جيدة |
| Auto-fix | — | — | — | fixers + ESLint/Prettier + verify + rollback | 🟢 ميزة جيدة |
| Error diagnosis | — | — | — | 13 نمط | 🟢 ميزة جيدة |

### 5.2 ما أخذه Zetora من كل مرجع

**من Pi**:
- provider-neutral model API (مبسّط).
- agent state/events منفصلة عن العرض.
- TUI مستقلة (بدائية لكنها تعمل).
- sessions قابلة للاستئناف.

**من Open Design**:
- مشروع يحتوي conversations وartifacts.
- artifact له نوع وrenderer.
- preview معزولة (sandbox iframe).
- skills + design-system context.

**من OpenCode**:
- shell عملي: navigation، sessions، timeline، files، inspector، composer.
- modes: Plan/Build/Design/Review.
- terminal/diff/checkpoints.
- Web/Desktop/TUI فوق contract مشترك.

### 5.3 ما أضافه Zetora كهوية خاصة

1. **Code + Design في session واحدة** بدل فصل منتجين.
2. **سياسة مخاطر موحدة خماسية** (`observe/modify/execute/external/blocked`) — أفضل من Pi.
3. **توقيع ED25519 للإضافات** — تحسين على v0.6-0.8.
4. **كشف الأسرار + حد المعدل + سجل تدقيق** كمواطنين من الدرجة الأولى.
5. **تشخيص أخطاء (13 نمط)** — ميزة فريدة تساعد الوكيل على self-correction.
6. **Auto-fix مع verify + rollback** — آلية إصلاح آمنة.
7. **Search index trigram** — بحث سريع للرموز.
8. **دعم العربية/RTL من البداية** (README عربي، 5 مهارات builtins عربية).
9. **لا تبعيات تشغيل خارجية** للـWeb/TUI — فقط Node.js 20.12+ قياسي.

### 5.4 تقييم سياسة الاستقلال (CLEAN_ROOM)

`docs/CLEAN_ROOM.md` يوضّح:
- لا شفرة منسوخة من المراجع.
- لا شعارات/أصول/خطوط منسوخة.
- أسماء الحزم وAPI paths وevent names أصلية.
- UI تتبع conventions شائعة لكن بأبعاد/ألوان/typography أصلية.

التعليق صريح:

> This is an **independent reimplementation policy**, not a legally certified two-team clean-room process. The implementer analyzed public source before writing Zetora, so a lawyer should review provenance before a high-value commercial launch.

هذا موقف مسؤول. التحليل يقترح:
- **المعماري والأفكار الوظيفية**: مستعارة لكنها عامة (لا حماية).
- **الشفرة**: أصلية 100% (لا نسخ).
- **الهوية البصرية**: أصلية (palette `#8b7cff`، spacing، copy).
- **العلامة التجارية**: تحتاج فحص محامٍ قبل الإطلاق التجاري.

---

## 6. الديون التقنية ونقاط الضعف

### 6.1 التباين في الإصدار (أكبر دين تقني)

| المصدر | الإصدار |
|---|---|
| `package.json` | `0.9.0` |
| `packages/kernel/src/index.js` (PRODUCT.version) | `0.9.0` |
| `PROVENANCE.json` | `0.9.0` |
| `README.md` | يتحدث عن «ما الجديد في 0.5» |
| `docs/CHANGELOG.md` | آخر إدخال: `v0.5.0 — 2026-08-13` |
| `packages/mcp/src/index.js` (clientInfo.version) | `0.4.0` |
| `packages/tools/src/workspace.js` (user-agent) | `Zetora/0.5.0` |

**النتيجة**: 4 إصدارات (0.6، 0.7، 0.8، 0.9) **غير موثقة في CHANGELOG**. هذه الإصدارات أضافت:
- **v0.6**: search-index (trigram)، todos، LSP diagnostics، plugins (مع SHA-256 المزيف).
- **v0.7**: collab (Lamport timestamps)، git2 (worktrees، graph)، fixes (heuristic suggestions).
- **v0.8**: غير واضح من الشفرة — ربما تحسينات أمنية.
- **v0.9**: ED25519 signing (استبدال SHA-256)، trust registry، تحسينات plugins.

هذا يخالف ممارسات الإصدار الجيدة ويجعل تتبّع التغييرات مستحيلًا. **التوصية العاجلة**: تحديث CHANGELOG بأثر رجعي.

### 6.2 ملفات ضخمة بحاجة لتقسيم

| الملف | الحجم | الأسطر | المشكلة |
|---|---|---|---|
| `apps/server/src/server.js` | 55KB | ~1,800 | كل الـrouting + multipart + SSE + providers test في ملف واحد |
| `apps/web/public/app.js` | 57KB | — | كل منطق الواجهة في ملف واحد |
| `apps/web/public/styles.css` | 34KB | — | كل الأنماط في ملف واحد |
| `packages/providers/src/index.js` | 28KB | 551 | 6 مزوّدين + streaming + images + cost في ملف واحد |
| `packages/agent/src/runner.js` | 20KB | 418 | مقبول لكنه يقترب من الحد |
| `packages/tools/src/workspace.js` | 17KB | 379 | مقبول لكن `parseAST` يستحق ملفه |

**التوصية**: تقسيم `server.js` إلى `routes/` directory. تقسيم `providers/index.js` إلى `providers/openai.js`, `anthropic.js`, إلخ.

### 6.3 parseAST قائم على regex (هش)

`Workspace.parseAST()` يستخدم regex لاستخراج imports/exports/functions/classes:

```js
const funcMatch = line.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/);
const arrowMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/);
```

**مشاكل**:
- لا يتعامل مع functions متعددة الأسطر.
- لا يتعامل مع TypeScript generics (`function foo<T>(...)`).
- لا يتعامل مع decorators.
- لا يتعامل مع object methods (`{ foo() {} }`).
- لا يتعامل مع class fields.
- لا يتعامل مع template literals في params.

**التوصية**: استخدام `acorn` أو `@babel/parser` (تبعية واحدة صغيرة) لتحليل دقيق.

### 6.4 compactor يستدعي النموذج (اعتماد دائري)

`Compactor.compact()` يستدعي `callModel()` لتلخيص التاريخ. هذا يعني:
- إذا فشل المزوّد، يتعطل الضغط.
- يستهلك tokens إضافية (تكلفة).
- يعتمد على `provider` و`apiKey` و`baseUrl` — إذا لم تُمرّر، يقع back to ملخص ميكانيكي.

**التوصية**: فصل Compactor إلى استراتيجيتين: (1) model-based مع fallback، (2) local-only (استخراج keywords بدون نموذج).

### 6.5 لا WebSocket (SSE فقط)

كل التحديثات اللحظية تستخدم SSE:
- `/api/events` لمراقب الملفات.
- `/api/chat` و`/api/agent/run` لبث الوكيل.

SSE أحادي الاتجاه (server→client). للطرفية التفاعلية وresize وinterrupt، يجب WebSocket.

### 6.6 collab ليس CRDT حقيقي

تعليق الكود صريح:

> This is not a full CRDT (Y.js/Automerge) but it dramatically reduces lost-work scenarios: concurrent edits to different parts of the document never conflict, and concurrent edits to the same line are resolved deterministically by timestamp.

**المشكلة**: «last operation wins for the overlapping region» — هذا يعني تحريرات متزامنة لنفس السطر **تفقد بيانات**. CRDT حقيقي (RGA، LSEQ، Y.js) يحل هذا.

### 6.7 معالجة أخطاء صامتة (catch {})

عدة مواضع تستخدم `catch {}` أو `catch { return null; }` بدون تسجيل:

```js
// packages/agent/src/runner.js
async #snapshotFile(relative) {
  try {
    const file = await this.workspace.read(relative);
    return file.content;
  } catch { return null; }  // ❌ خطأ صامت
}
```

هذا يخفي أخطاء حقيقية (صلاحيات، قرص ممتلئ، إلخ). **التوصية**: تسجيل على الأقل `console.warn` أو `audit.record`.

### 6.8 برمجة متزامنة عبر Promise array

عدة مواضع تستخدم `Promise.all` أو loop await تسلسلي بدل قائمة انتظار حقيقية:

```js
// packages/security/src/index.js
async #flush() {
  const entries = this.buffer.splice(0);
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  await writeFile(this.logPath, lines, { flag: "a" });  // OK — batch
}
```

هذا مقبول في AuditLog. لكن في `McpRegistry.connectAll()`:

```js
for (const id of Object.keys(servers)) {
  try { await this.connect(id); results[id] = { ok: true }; }
  catch (error) { results[id] = { ok: false, error: error.message }; }
}
```

تسلسلي بدل `Promise.allSettled`. للخوادم المستقلة، يجب متوازي.

### 6.9 subagent يجبر demo provider

كما ذكر في 2.6، `#spawnSubagent` يجبر `provider: "demo"`. هذا يجعل الميزة عديمة الفائدة في الإنتاج. يجب توريث `input.provider` و`input.model` من الأب.

### 6.10 لا migration path للإصدارات السابقة

- Plugins الموقّعة بـSHA-256 (v0.6-0.8) تُعامَل كـ`legacy_self_hash` مع `verified: false`. هذا صحيح أمنيًا، لكن لا يوجد migration tool لمساعدة المؤلفين على إعادة التوقيع.
- لا schema versioning للملفات المخزّنة (sessions، approvals، audit log).
- `mcp.json` و`context.json` و`trust-registry.json` كلها بلا `schemaVersion` field.

---

## 7. تقييم الاختبارات

### 7.1 نظرة عامة

| المؤشر | القيمة |
|---|---|
| ملفات الاختبار | 18 |
| حالات الاختبار | 118 |
| ناجحة | 118 (100%) |
| فاشلة | 0 |
| زمن التنفيذ | ~3.8 ثانية |
| إطار الاختبار | `node --test` (مدمج في Node.js) |

### 7.2 توزيع الاختبارات

| الملف | يغطي |
|---|---|
| `agent.test.js` | حلقة الوكيل، write_file + approval، diff snapshot |
| `artifacts.test.js` | detectKind، HTML passthrough، markdown، image، escaping |
| `context.test.js` | context assembly، pruning، compactor threshold/summary |
| `design.test.js` | read/write، toCss، toReferenceHtml، toPromptSummary |
| `fixes.test.js` | AutoFix (newline، tabs، JSON، dryRun، verify)، diagnoseError، FIXERS idempotency، heuristic suggestions |
| `git.test.js` | init + checkpoint + undo، non-zetora commit protection، log ordering |
| `git2.test.js` | worktrees، graph |
| `mcp.test.js` | client initialize + listTools + callTool، registry namespacing |
| `policy.test.js` | classifyCommand (blocked، readonly، execute) |
| `pty.test.js` | persistent cwd/env، resize |
| `security.test.js` | ED25519 sign/verify، trust registry، audit log، rate limiter، secret redaction (11 pattern)، plugin tamper detection |
| `skills.test.js` | CRUD، validation، composition، cycles، defaults، token cleanup، history، listAll |
| `storage.test.js` | JsonStore read/write/update |
| `tools.test.js` | grep، glob، fetchUrl، parseAST، runTests، AutoFix، diagnoseError |
| `v6.test.js` | search-index (trigram، ranking، stats)، todos |
| `v7.test.js` | collab session، registry، plugin install + verify + tamper |
| `watcher.test.js` | change events، ignored directories |
| `workspace.test.js` | path confinement، file operations |

### 7.3 نقاط القوة في الاختبارات

1. **تغطية أمنية جيدة**: `security.test.js` (9KB) يغطي ED25519، trust registry، audit، rate limiter، secret redaction، plugin tamper detection.
2. **اختبارات idempotency**: `FIXERS.trailing-newline is idempotent` يتحقق أن المُصلِح لا يُصلِح ما تم إصلاحه.
3. **اختبارات الحدود**: `search index handles empty query gracefully`، `todo list progress edge cases`.
4. **اختبارات الأمان**: `mutating commands do not execute without approval`، `plugin tamper detection: modified entry fails self-hash check`.
5. **سرعة**: 3.8 ثانية لـ118 اختبار — ممتاز للتغذية الراجعة السريعة.

### 7.4 الفجوات الرئيسية

#### 7.4.1 لا اختبارات E2E
لا يوجد اختبار يحاكي مستخدمًا يفتح المتصفح، يكتب رسالة، ينتظر رد الوكيل، يوافق على كتابة ملف، ويتحقق من النتيجة. هذا حرج لاكتشاف تكامل الواجهة-الخادم.

#### 7.4.2 لا اختبارات provider حقيقية
كل اختبارات الوكيل تستخدم `provider: "demo"`. لا يوجد اختبار يضرب OpenAI/Anthropic/Google حقيقيًا (حتى مع mock server). هذا يعني:
- لا أحد يتحقق أن `toOpenAIMessages` يُنشئ payload صحيح.
- لا أحد يتحقق أن streaming deltas تُجمَع بشكل صحيح.
- لا أحد يتحقق أن error handling للمزوّدين يعمل.

**التوصية**: استخدام `msw` أو `nock` لمحاكاة ردود المزوّدين.

#### 7.4.3 لا اختبارات أمنية اختراقية
لا يوجد اختبار يحاول:
- Path traversal (`../../../etc/passwd`).
- Command injection (`; rm -rf /`).
- XSS في artifact rendering.
- CSRF.
- SSRF في `fetch_url`.
- Prompt injection (وكيل يُطلب منه تجاوز الموافقة).

#### 7.4.4 لا اختبارات load/stress
لا أحد يتحقق:
- كم جلسة متزامنة يتحمل الخادم؟
- ما حد حجم الـJSON store قبل أن يبطئ؟
- كم watcher file يستطيع المتابعة قبل نفاد الـfile descriptors؟

#### 7.4.5 تغطية server.js ضعيفة
`apps/server/src/server.js` (1,800 سطر) ليس له ملف اختبار مخصص. يتم اختباره ضمنيًا عبر اختبارات الوكيل، لكن:
- لا اختبار لـrouting الصحيح (404، 405).
- لا اختبار لـmultipart parsing.
- لا اختبار لـSSE connection handling.
- لا اختبار لـCORS (إن وُجد).

#### 7.4.6 لا اختبارات collab تحت concurrency حقيقي
`v7.test.js` يختبر collab في خيط واحد. لا يختبر:
- تحريرات متزامنة فعلًا (مؤقتات متداخلة).
- فقدان الشبكة من peer.
- إعادة بناء المستند عبر `replay()` بعد 1000+ عملية.

#### 7.4.7 لا اختبارات RTL/إمكانية وصول
لا يوجد:
- فحص تباين الألوان (WCAG AA).
- فحص keyboard navigation.
- فحص screen reader compatibility.
- فحص RTL layout.

#### 7.4.8 لا mutation testing
لا أحد يتحقق أن الاختبارات تكتشف الأخطاء. `stryker` أو `mutmut` سيكشف اختبارات سطحية.

### 7.5 التوصيات لرفع التغطية

| الأولوية | التوصية |
|---|---|
| عاجل | إضافة E2E tests (Playwright) لتدفق: chat → approval → file write → undo |
| عاجل | اختبارات provider مع mock server (msw) |
| مهم | اختبارات أمنية اختراقية (path traversal، XSS، SSRF، prompt injection) |
| مهم | اختبارات server.js routing وmultipart وSSE |
| مهم | اختبارات collab تحت concurrency (fake timers) |
| متوسط | اختبارات load/stress (autocannon) |
| متوسط | اختبارات إمكانية وصول (axe-core) |
| متوسط | mutation testing (stryker) |
| منخفض | فحص تغطية الكود (c8) في CI |

---

## 8. التوصيات والخلاصة

### 8.1 التوصيات مرتّبة حسب الأولوية

#### 🔴 عاجل (قبل أي إصدار)

1. **مزامنة CHANGELOG مع v0.9.0**: توثيق إصدارات 0.6-0.9 بأثر رجعي. هذا حرج لتتبّع التغييرات الأمنية (خاصة الانتقال من SHA-256 إلى ED25519).
2. **تقسيم `server.js`**: 1,800 سطر في ملف واحد غير قابل للصيانة. إنشاء `routes/` directory بملف لكل مجموعة endpoints.
3. **تقسيم `providers/index.js`**: كل مزوّد في ملفه (`openai.js`, `anthropic.js`, `google.js`, `ollama.js`, `demo.js`).
4. **إصلاح subagent provider**: توريث `input.provider` و`input.model` بدل إجبار `demo`.

#### 🟡 مهم (للإصدار التالي)

5. **ترحيل إلى SQLite + WAL**: مع schema migrations وevent sequence numbers وrecovery tests. `JsonStore` غير مناسب بعد 10,000 سجل.
6. **OS keychain integration**: لمفاتيح API في سطح المكتب (keytar على macOS/Windows/Linux).
7. **CSP nonce + CSRF/Origin checks**: حماية XSS وCSRF في واجهة الويب.
8. **Partial-tool-JSON recovery**: تجميع تدريجي للـJSON الناقص عبر deltas مع retry.
9. **Retry/backoff للمزوّدين**: إعادة محاولة أسيّة للأخطاء العابرة (429، 500، 503).
10. **اختبارات E2E + أمنية**: Playwright لتدفق الموافقة، msw لمزوّدين، اختبارات اختراق للمسارات.

#### 🟢 متوسط (خلال 3-6 أشهر)

11. **WebSocket للطرفية**: استبدال SSE بـWebSocket لـresize فوري وinterrupt وbackpressure.
12. **عزل العمليات**: seccomp profile أو حاويات خفيفة لأوامر الوكيل.
13. **parseAST حقيقي**: استبدال regex بـ`acorn` لتحليل دقيق.
14. **Log rotation**: للـaudit log وevents log.
15. **CRDT حقيقي**: استبدال Lamport timestamps بـY.js أو Automerge لـcollab.
16. **Plugin sandbox**: عزل الإضافات في worker process مع capability grants.

#### 🔵 طويل المدى (6-12 شهر)

17. **Signed/notarized desktop builds**: macOS notarization، Windows Authenticode، auto-update موثّق.
18. **Plugin marketplace**: registry موحّد مع trust tiers وreview process.
19. **i18n كامل**: ترجمة كل النصوص + RTL visual tests + accessibility AA.
20. **OpenTelemetry**: تتبّع موزّع للمزوّدين والأدوات والأحداث.
21. **Permission matrix**: صلاحيات دقيقة لكل أداة/مسار/أمر/مضيف.

### 8.2 تقييم نضج المشروع

| البعد | التقييم | المبرر |
|---|---|---|
| المعمارية | 🟢 جيدة جدًا | فصل واضح، نمط أحداث محايد، مخاطر في النواة |
| الأمان | 🟡 جيد لكن غير مكتمل | ED25519 + audit + rate-limit + secrets، ينقص CSP/CSRF/keychain |
| جودة الشفرة | 🟡 متوسط | شفرة نظيفة لكن ملفات ضخمة وcatch صامت |
| الاختبارات | 🟡 متوسطة | 118 اختبار جيد لكن لا E2E/أمني/load |
| التوثيق | 🟡 متوسط | README وdocs جيدين لكن CHANGELOG متخلف 4 إصدارات |
| نضج الإنتاج | 🔴 غير جاهز | لا SQLite/signing/keychain/CSP/WebSocket |
| الابتكار | 🟢 جيد | سياسة مخاطر خماسية، auto-fix، diagnoseError، ED25519 |
| الاستقلال | 🟢 ملتزم | CLEAN_ROOM صريح، PROVENANCE موثّق |

### 8.3 الخلاصة

**Zetora v0.9.0** هو نموذج أولي (prototype) ممتاز لمساحة عمل وكيلة محلية. المعمارية نظيفة، نموذج المخاطر الخماسي مبتكر، والالتزام بـlocal-first والاستقلال عن المراجع جاد. ميزات مثل ED25519 signing وauto-fix مع verify/rollback وdiagnoseError وsearch-index trigram تظهر تفكيرًا هندسيًا ناضجًا.

لكن المشروع **ليس جاهزًا للإنتاج** بأي تعريف معقول:

1. **التخزين JSON** غير مناسب بعد آلاف السجلات.
2. **لا CSP/CSRF/keychain** يترك ثغرات أمنية حرجة.
3. **لا signing/notarization** يمنع التوزيع العام.
4. **CHANGELOG متخلف** يخفي تحسينات أمنية حرجة.
5. **لا E2E/أمنية اختبارات** تترك تكامل الواجهة-الخادم غير مُختبَر.
6. **SSE بدل WebSocket** يحدّ من الطرفية التفاعلية.
7. **لا عزل عمليات** يترك أوامر الوكيل تنفّذ في عملية الخادم.

المشروع يستحق المتابعة. خارطة الطريق واضحة (5 مراحل)، والأساس متين. مع تنفيذ التوصيات العاجلة والمهمة (12 توصية)، يمكن الوصول إلى **beta للإنتاج** خلال 3-6 أشهر. للإصدار العام (GA)، يحتاج 12-18 شهرًا لمعالجة التوصيات طويلة المدى.

### 8.4 توصية للمطور الجديد

إذا كنت ستساهم في Zetora:

1. **ابدأ بـ`docs/ARCHITECTURE.md`** لفهم البنية.
2. **اقرأ `packages/kernel/src/policy.js`** (40 سطر) — فهو قلب نموذج المخاطر.
3. **شغّل `npm test`** للتأكد أن البيئة سليمة (118 اختبار، ~4 ثوان).
4. **جرّب `npm run tui`** لتجربة الوكيل بدون متصفح.
5. **اقرأ `packages/agent/src/runner.js`** (418 سطر) — فهو قلب حلقة الوكيل.
6. **تجنّب تعديل `server.js` مباشرة** — ساهم في تقسيمه أولًا (توصية #2).
7. **أضف اختبارًا لكل ميزة جديدة** — التغطية الحالية جيدة لكن هشة.

---

*نهاية التحليل. التقرير مبني على فحص كامل لشفرة `zetora-source-v0.9.0.zip` (100 ملف، 7,338 سطر JS) وتشغيل الاختبارات (118 ناجح). للاستفسار عن أي قسم، راجع الملفات المُشار إليها في كل قسم.*
