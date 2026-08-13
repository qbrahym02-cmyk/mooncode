# Zetora · زيتورا

مساحة عمل محلية للبرمجة والتصميم بالوكلاء، تعمل من نواة واحدة عبر **Web وDesktop وTUI**.

> هذا مستودع جديد مكتوب من الصفر. لا يحتوي على شفرة أو شعارات أو أصول من Pi أو Open Design أو OpenCode. استُخدمت المشاريع الثلاثة كمراجع وظيفية ومعمارية فقط.

## ما الجديد في 0.5

- **أدوات جديدة للوكيل**: `grep` (regex + glob + context lines)، `fetch_url` (HTTP مع HTML-to-text)، `run_tests` (auto-detect vitest/jest/node --test)، `parse_ast` (استخراج imports/exports/functions/classes)، `read_file` مع `startLine/endLine`.
- **Auto-fix**: حزمة `packages/autofix` تكشف وتصلح المشاكل الشائعة تلقائيًا. fixers مدمجة: trailing newline، tabs→spaces، JSON pretty-print. تكامل ESLint/Prettier إن وُجدا. verify بـ `node --check` + rollback عند الفشل. dry-run mode.
- **تشخيص الأخطاء**: `diagnoseError` يمسح output بحثًا عن 8 أنماط معروفة (missing module، syntax error، port conflict...) ويعيد hints قابلة للتنفيذ. يُدمج تلقائيًا في `POST /api/tests/run`.
- **Subagents**: أداة `spawn_subagent` تشغل وكيلًا فرعيًا بمحادثة منفصلة وخطوات محدودة (max 8) وعمق = 1 لمنع recursion.
- **Skills v2**: CRUD كامل (create/update/delete) مع validation. composition chains عبر `compose: [...]`. defaults عبر `{{name|fallback}}`. execution history. skillان builtin جديدان: `auto-fix` و `explain-code`.

## ما الجديد في 0.4

- **ملفات السياق الدائمة**: أضف ملفات مثل `CONVENTIONS.md` لتُحقن تلقائيًا في كل استدعاء نموذج. تُدار عبر لوحة الموارد (`Cmd/Ctrl+R`) أو API `GET/POST/DELETE /api/context`.
- **ضغط السجل (Compaction)**: عند تجاوز 30 رسالة، يُلخّص الوكيل الـ22 رسالة الأقدم إلى ملخص مدمج يُحفظ كبداية للجلسة. يمكن触发 يدوي عبر زر «Compact» أو `POST /api/compact`.
- **خادم MCP (Model Context Protocol)**: وصّل أدوات وخوادم خارجية عبر JSON-RPC 2.0 stdio. الأدوات تُسمّى `mcp.<serverId>.<toolName>` وتطلب موافقة قبل التنفيذ. التهيئة في `.zetora/mcp.json`.
- **Skill manifests**: اقرأ `workspace/skills/<id>/skill.json` كقوالب prompt قابلة لإعادة الاستخدام مع متغيرات `{{input}}`. ثلاث مهارات built-in متاحة دائمًا. استدعِها من لوحة الموارد.
- **Design tokens**: ملف `workspace/design-tokens.json` يوحّد الألوان والخطوط والمسافات. يُحقن في system prompt في وضع Design، ويُولّد ورقة CSS وصفحة مرجعية بصرية.
- **اختبار vision**: `POST /api/providers/test` يقبل الآن `image` (data URI) لاختبار قدرة المزوّد على رؤية الصور فعليًا.
- **معاينة معزولة أصرم**: iframe sandbox بدون `allow-same-origin` + `referrerpolicy="no-referrer"` لمنع scripts داخل المعاينة من الوصول إلى بيانات التطبيق.

## ما الجديد في 0.3

- **تكامل Git**: كل كتابة يقوم بها الوكيل تُنشئ checkpoint تلقائيًا مع tag `zetora-checkpoint`. زر «Undo» في الترويسة يتراجع عن آخر checkpoint ويعيد الملفات إلى حالتها السابقة. API كامل: `init`, `status`, `diff`, `log`, `branches`, `checkpoint`, `undo`.
- **طرفية PTY حقيقية**: جلسة shell دالة بدل spawn لكل أمر. الـcwd والـenv والتاريخ يبقون بين الأوامر. دعم `resize` و`interrupt` (Ctrl+C) و`write` للإدخال التفاعلي. سجل جلسات متعددة مع إغلاق تلقائي عند الخمول 30 دقيقة.
- **إدخال الصور (vision)**: الرسائل الآن تقبل `content: [{type:"text"},{type:"image_url"}]` لإرسال الصور إلى OpenAI وAnthropic وGoogle. زر إرفاق صورة في الـcomposer مع رفع multipart إلى `/api/uploads` وتحويل إلى data URI.
- **سجل artifacts متعدد العارضين**: 40+ امتداد مدعوم. HTML يمر دون تغيير، الصور (PNG/JPG/SVG/GIF/WEBP/AVIF) تُعرض عبر `<img>` مع data URI، Markdown يُعرض بمنسّق آمن، JSON يُجمَّل، والكود يُهرب ويُغلَّف بـ`<pre>`. كل ذلك عبر `/api/artifact?path=...`.
- **مراقب الملفات**: `FileWatcher` يراقب الأدلة بشكل متكرر ويتجاهل `.git` و`node_modules` وغيرها. يصدر أحداث SSE على `/api/events`، والعميل يحدّث شجرة الملفات ويعيد عرض المعاينة تلقائيًا عند تغيّر الملف المفتوح.

## ما الجديد في 0.2

- **بث حقيقي للنصوص** عبر SSE لمزوّدي OpenAI وAnthropic وGoogle وOllama؛ يصدر `text.delta` كأجزاء حية بدل دفعة واحدة.
- **استئناف تلقائي بعد الموافقة**: عند الموافقة على `write_file` أو `replace_text` أو أمر طرفية، يُكمل الوكيل حلقته دون الحاجة لإعادة إرسال الطلب.
- **عرض الـ diff**: لكل عملية كتابة يُحفظ snapshot للمحتوى السابق، ويعرضه تبويب «التغييرات» في لوحة المراجعة مع تلوين للأسطر المضافة والمحذوفة.
- **تتبّع الاستهلاك**: تجميع input/output tokens وتقدير التكلفة لكل جلسة، يظهر في الترويسة وقائمة الجلسات.
- **عرض Markdown**: رسائل الوكيل تُعرض كـ Markdown آمن (عناوين، قوائم، أكواد، روابط https فقط) بدل النص المهرّب.
- **سجل أحداث كامل لكل جلسة**: كل حدث NDJSON يُخزَّن في `events[]` للجلسة، ما يتيح استعادة الجلسة كاملة بعد إعادة التشغيل.
- **API الجلسات**: `GET /api/sessions`، `POST /api/sessions`، `GET /api/sessions/:id`، `DELETE /api/sessions/:id`، و`GET /api/diff?path=...`.

## ما يعمل منذ 0.1

- واجهة ويب أصلية متجاوبة: جلسات، ملفات، محادثة، معاينة artifacts، طرفية، إعدادات وموافقات.
- خادم محلي بلا تبعيات تشغيل خارجية في نسخة الويب/TUI.
- نواة وكيل مشتركة مع أحداث موحدة وأدوات ملفات وبحث وطرفية.
- طبقة مزودين: OpenAI وAnthropic وGoogle وOpenRouter وOllama وأي مزود OpenAI-compatible مخصص.
- سياسة أمان: حصر المسارات داخل مساحة العمل، حجب أوامر خطرة، وموافقة صريحة قبل الكتابة أو التنفيذ المعدّل.
- تخزين محلي ذري للجلسات والموافقات وسجل الأحداث.
- TUI مستقلة يمكن تشغيلها دون واجهة الويب.
- غلاف Electron أولي لسطح المكتب.

## التشغيل السريع

يتطلب Node.js 20.12 أو أحدث.

```bash
cd zetora
npm run dev
# افتح http://localhost:4173
```

لا تحتاج نسخة Web/TUI الحالية إلى `npm install` لأنها مبنية على واجهات Node والمتصفح القياسية فقط.

### TUI فقط

```bash
cd zetora
node apps/tui/src/cli.js --workspace ./workspace
# أو
npm run tui
```

### ربط نموذج

انسخ ملف البيئة ثم أضف مفاتيحك:

```bash
cp .env.example .env
# صدّر المتغير في الصدفة أو استخدم مدير أسرار
export ANTHROPIC_API_KEY="..."
npm run dev
```

يمكن أيضًا إدخال مفتاح مؤقت من الإعدادات؛ يُخزن في `sessionStorage` فقط ولا يُكتب على القرص بواسطة التطبيق.

### سطح المكتب

غلاف سطح المكتب يحتاج تبعيات Electron الاختيارية:

```bash
npm install
npm run desktop
```

## بنية المستودع

```text
apps/
  web/        عميل المتصفح
  server/     API محلي وملفات ثابتة
  desktop/    غلاف Electron
  tui/        عميل الطرفية المستقل
packages/
  kernel/     الأحداث وسياسة المخاطر
  agent/      حلقة الوكيل + الاستئناف + MCP + skills + context
  providers/  محولات النماذج + البث + الصور + تقدير التكلفة
  tools/      أدوات مساحة العمل
  storage/    تخزين محلي ذري
  git/        تكامل Git: checkpoints + undo + فروع
  pty/        جلسات shell الدائمة
  artifacts/  سجل عارضين: HTML + صور + Markdown + JSON + كود
  watcher/    مراقب الملفات + SSE
  context/    ملفات السياق + ضغط السجل
  mcp/        عميل Model Context Protocol
  skills/     سجل المهارات + الـbuiltins
  design/     design tokens + ورقة CSS + مرجع بصري
docs/         التحليل والمواصفات وخطة الإنتاج
workspace/    مساحة تجريبية قابلة للاستبدال
```

## الملكية والترخيص

- الشفرة الأصلية في هذا المستودع مضبوطة حاليًا كـ **All Rights Reserved**.
- غيّر `[OWNER LEGAL NAME]` في `LICENSE` و`brand.json` قبل التوزيع.
- لا يمكن لأي منتج برمجي حديث أن يجعل مكتبات الجهات الخارجية «مملوكة» له؛ كل مكتبة تظل تحت رخصتها. الهدف هنا أن تكون **كل الشفرة والهوية الخاصة بالمنتج أصلية ومملوكة لصاحب المنتج**، مع إدارة مستقلة لتراخيص التبعيات.
- هذا ليس رأيًا قانونيًا ولا فحص علامة تجارية نهائيًا.

## الوثائق

- [التحليل الكامل للمراجع](docs/ANALYSIS_AR.md)
- [المعمارية](docs/ARCHITECTURE.md)
- [حدود الاستقلال والملكية](docs/CLEAN_ROOM.md)
- [خطة التحويل إلى منتج كامل](docs/ROADMAP.md)
- [سجل التغييرات](docs/CHANGELOG.md)
