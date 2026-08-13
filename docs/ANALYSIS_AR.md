# تحليل Pi وOpen Design وOpenCode وخلاصة تصميم Zetora

تاريخ اللقطة: **12 أغسطس 2026** بتوقيت المستخدم. نُزّلت المستودعات كنسخ shallow مستقلة للبحث فقط، ولم تُضمَّن في بناء Zetora.

## 1. نطاق الفحص

| المشروع | Commit المفحوص | الترخيص الجذري | ملفات غير `.git` | الحجم النصي/الأصول التقريبي | أسطر النص القابلة للعد تقريبًا |
|---|---|---:|---:|---:|---:|
| Pi | `581d75a89cea21e50d6a26df840352f94427f633` | MIT | 1,367 | 16.8 MB | 312,819 |
| Open Design | `028bde50adea573b2b80df2f1909505b8fa02052` | Apache‑2.0 | 12,536 | 333.5 MB | 2,871,206 |
| OpenCode | `14b37df39168eaf6a6faf862ec4a7bbe9c825bbd` | MIT | 6,506 | 118.8 MB | 1,194,741 |

الأرقام تشمل التوثيق والاختبارات والبيانات والقوالب والأصول، ولذلك لا تساوي «أسطر شفرة إنتاج». تم فحص ملفات التراخيص، README، وثائق المعمارية والمواصفات، manifests، حدود الحزم، خرائط المصدر، ومناطق التنفيذ والواجهة والأمان.

---

## 2. Pi

### 2.1 الفكرة الأساسية

Pi هو **agent harness** قابل للتمديد الذاتي مع وكيل برمجة تفاعلي. قوته ليست في تطبيق Desktop بصري، بل في فصل واضح بين:

1. طبقة الاتصال بالنماذج.
2. حلقة الوكيل والحالة والأحداث.
3. وكيل البرمجة والجلسات والأدوات.
4. مكتبة TUI سريعة.
5. بروتوكول وعميل وخادم للجلسات البعيدة.

### 2.2 الحزم المهمة

| الحزمة | الدور | ملفات `src` في اللقطة |
|---|---|---:|
| `pi-ai` | API موحد للنماذج، اكتشاف الموديلات، auth، streaming، صور، reasoning وأدوات | 175 |
| `pi-agent-core` | حلقة وكيل عامة، state، steering، أدوات وأحداث | 50 |
| `pi-coding-agent` | CLI، جلسات، compaction، extensions، skills، trust وأدوات البرمجة | 208 |
| `pi-tui` | renderer تفاضلي ومكونات Terminal | 39 |
| `pi-server` | نواة خادم جلسات تجريبية | 17 |
| `pi-client` | عميل transport-neutral | 10 |
| `pi-protocol` | framing وCBOR schemas | 8 |
| `pi-telemetry` | عقود telemetry مستقلة عن vendor | 6 |

### 2.3 أفضل ما فيه

- **Provider abstraction ناضجة:** مزودون كثيرون، catalogs، OAuth، custom providers، OpenAI compatibility، صور، reasoning، tool calls، partial JSON، abort/retry، handoff بين المزودين.
- **Event-first agent:** الواجهة لا تحتاج معرفة تفاصيل provider؛ تراقب أحداث start/delta/tool/end.
- **تمييز رسالة الوكيل عن رسالة النموذج:** يسمح برسائل تطبيقية خاصة ثم تحويلها قبل provider call.
- **جلسات عملية:** الاستئناف، branching، compaction، قوائم انتظار prompt، steering وfollow-up.
- **تخصيص عميق:** skills، prompt templates، extensions، themes وSDK/RPC.
- **TUI حقيقية:** differential rendering، overlays، editor متعدد الأسطر، autocomplete، صور terminal، مفاتيح وIME.
- **Supply-chain discipline:** تبعيات مثبتة، shrinkwrap، فحوص scripts وتوقيعات npm.

### 2.4 ما لا ينبغي نقله كما هو

- README يصرّح أن Pi لا يوفّر افتراضيًا نظام صلاحيات يحاصر filesystem/process/network/credentials؛ ينصح بالحاويات أو sandbox خارجي. منتجنا يحتاج سياسة صلاحيات أصلية في قلبه.
- تجربة Pi الأساسية Terminal؛ لا تقدّم وحدها مساحة artifacts وتصميم ومراجعة بصرية.
- catalogs الضخمة وتفاصيل auth الخاصة به لا ينبغي نسخها. الأفضل إنشاء واجهة مزود صغيرة مستقلة ثم توسيعها باختبارات توافق.

### 2.5 الدرس لـZetora

نأخذ **الفكرة**: نواة events + provider-neutral + clients متعددة. لا نأخذ schemas أو أسماء الأحداث أو الشفرة. في Zetora أصبحت الأحداث `run.started`, `text.delta`, `tool.started`, `approval.required` وغيرها بتعريف مستقل.

---

## 3. Open Design

### 3.1 الفكرة الأساسية

Open Design مساحة تصميم **local-first** تربط code-agent بتدفقات تصميم وتحوّل النتائج إلى artifacts قابلة للمعاينة. المشروع أوسع من واجهة محادثة: يحتوي على skills، design systems، templates، plugins، daemon، Desktop، Web وعمليات تصدير.

### 3.2 شكل النظام

- `apps/web`: Next.js + React؛ الواجهة، المشاريع، المحادثات، المعاينات والتصميم.
- `apps/daemon`: خدمة محلية بـExpress وSQLite وPTY ومراقبة ملفات وMCP وتصدير PDF/PPTX.
- `apps/desktop`: Electron host.
- `apps/packaged`: تجميع headless/desktop.
- `packages/contracts`: عقود TypeScript بين Web وdaemon.
- `packages/plugin-runtime`: parsing/validation/merge/digest للإضافات.
- `packages/host` و`sidecar`: جسور renderer/host وتشغيل جانبي.
- catalogs كبيرة من `skills/`, `design-systems/`, `design-templates/`, `craft/`.

### 3.3 نموذج المجال

الوثائق تميّز بوضوح بين:

- **Project**: مساحة تصميم عليا.
- **Normal Artifact**: ناتج له entry file وmanifest.
- **Live Artifact**: ناتج قابل للتحديث وله source data وpreview state.
- **Active Project**: المشروع الذي تستهدفه أدوات MCP عند غياب id.
- **Creation surfaces**: prototype، live artifact، deck، template وmedia.
- **Design system**: سطح منفصل وليس مجرد template.

هذا الفصل مهم: الملف ليس دائمًا artifact، والـartifact ليس مجرد attachment.

### 3.4 أفضل ما فيه

- **Artifacts first:** الناتج البصري مواطن من الدرجة الأولى، لا نصًا ملحقًا بالدردشة.
- **Daemon/Web split:** تنفيذ محلي موثوق وواجهة يمكن تبديلها أو تشغيلها headless.
- **Skills protocol:** skill بسيط قابل للاكتشاف مع امتدادات اختيارية للـmode، inputs، capabilities وartifacts.
- **Design systems + craft:** token/component context ومعايير typography، color، accessibility، RTL، state coverage وanimation discipline.
- **Plugin pipeline:** manifest، install sources، apply preview، snapshots، provenance، capability grants، GenUI surfaces، marketplace/federation.
- **معاينة معزولة:** renderer host وحدود sandbox منفصلة عن daemon.
- **تعدد التسليمات:** prototypes، decks، صور، فيديو/HyperFrames، صوت وتصدير.
- **Local-first + headless:** Desktop للمستخدم العادي وCLI/MCP لوكلاء البرمجة.

### 3.5 التعقيد والمخاطر

- المستودع ضخم بسبب catalogs والقوالب والأصول؛ نسخها سيجعل المنتج مشتقًا ويحمل التزامات Apache وإشعارات وأصولًا قد تكون بشروط مختلفة.
- plugin spec واسعة جدًا؛ تنفيذ marketplace قبل تثبيت kernel والصلاحيات يزيد مساحة الهجوم.
- Electron + daemon + Next + native modules + PTY + media exporters يرفع كلفة التوزيع والاختبار.
- توليد HTML يحتاج CSP/sandbox وتنقية صارمة، لا iframe مفتوحًا.

### 3.6 الدرس لـZetora

نأخذ **المفهوم**: Project → Run → Artifact Manifest → Isolated Preview → Export، وSkill/Plugin منفصل عن kernel. نبدأ بـHTML artifact ذاتي الاحتواء، ثم نضيف renderers ومصدر provenance. لا ننسخ أي skill أو template أو design system.

---

## 4. OpenCode

### 4.1 الفكرة الأساسية

OpenCode منصة وكيل برمجة متعددة الواجهات: CLI/TUI، تطبيق Web، Desktop، SDK وخادم. اللقطة الحديثة تستخدم monorepo واسعًا قائمًا أساسًا على Bun/TypeScript وSolid.js وElectron، مع مكتبات UI مستقلة.

### 4.2 الوحدات البارزة

- `packages/opencode`: runtime تقليدي يضم CLI، server، tools، sessions، providers، permissions، MCP، LSP، plugins، worktrees وsnapshots.
- `packages/core`, `schema`, `protocol`, `server`, `client`: مسار معماري أحدث بعقود أكثر صرامة.
- `packages/app`: تطبيق Solid.js؛ في اللقطة 480 ملف source.
- `packages/session-ui`: timeline، message parts، markdown، file/review components.
- `packages/ui`: design system واسع وأصول SVG كثيرة.
- `packages/tui`: واجهة Terminal مستقلة.
- `packages/desktop`: Electron مع PTY/watchers/updater.
- `packages/llm`, `plugin`, `codemode`, SDKs وenterprise/web/console.

### 4.3 تجربة الاستخدام التي يريدها المستخدم غالبًا

- مشاريع وجلسات في sidebar.
- timeline مركزية لرسائل المستخدم والوكيل والأدوات.
- composer ثابت مع agent/model/variant/attachments/commands.
- file tree، tabs، source viewer، review/diff وتعليقات.
- terminal مدمجة.
- plan/build agents وصلاحيات/أسئلة.
- command palette واختصارات keyboard-first.
- Desktop/Web/TUI فوق backend مشترك.

هذه أنماط إنتاجية شائعة ويمكن إعادة تنفيذها، لكن النسخ pixel-perfect للألوان والمسافات والأيقونات والنصوص والترتيب الدقيق يناقض هدف الهوية المستقلة.

### 4.4 أفضل ما فيه

- **واجهة متماسكة لعمل الوكيل:** لا تخفي الأدوات؛ تظهر reads/search/bash/diffs والأسئلة كأحداث.
- **Plan مقابل Build:** فصل النية والصلاحيات بدل زر «تشغيل» واحد غير واضح.
- **Sessions durable:** تاريخ، branching/fork، compaction، subagents وtodos.
- **Context runtime متقدم:** baseline context وcontext epochs وmid-conversation updates وحدود provider turn.
- **Permissions:** أدوات خطرة تطلب الموافقة، مع حالات واضحة للواجهة.
- **Developer completeness:** file tree، terminal، LSP، MCP، git/worktrees، snapshots، plugins، SDK وخادم.
- **UI engineering:** virtualized timelines، اختبارات استقرار مرئي وأداء، responsive panes وi18n.
- **Client contract direction:** فصل schema/protocol/server/client وإمكان embedded transport.

### 4.5 ما يجب تجنبه

- نسخ `packages/app`, `ui`, `session-ui` أو SVGs سيجعل الواجهة مشتقة حتى إن كان MIT يسمح بالاستخدام بشرط الإشعار؛ ولن تصبح «ملكًا حصريًا» للمستخدم.
- استعمال الاسم أو الشعار أو نصوص المنتج قد يخلق التباس ارتباط/علامة تجارية.
- الحجم المعماري كبير؛ إعادة جميع الحزم من البداية ليست MVP بل برنامج تطوير متعدد المراحل.
- توجد مرحلتان معماريتان متداخلتان في اللقطة (runtime أقدم ومسار Effect/schema أحدث)، فلا ينبغي نسخ التعقيد الانتقالي.

### 4.6 الدرس لـZetora

نأخذ workflow: sessions + transparent tools + review + terminal + keyboard-first + multi-client. صممنا shell جديدًا بأربعة أعمدة مألوفة لكن بعلامة، palette، spacing، copy، artifact panel ونموذج مجال خاص بـZetora.

---

## 5. مقارنة مباشرة

| القدرة | Pi | Open Design | OpenCode | قرار Zetora |
|---|---|---|---|---|
| Provider abstraction | ممتازة | تعتمد أيضًا على agents/model routes | واسعة | واجهة موحدة مستقلة تبدأ بـ6 أنواع |
| Agent loop | جوهر المشروع | orchestrates design runs | جوهر البرمجة | حزمة `agent` مشتركة |
| TUI | ممتازة | headless أكثر من TUI | قوية | تنزيل TUI مستقل |
| Desktop/Web | محدود بصريًا | قوي | قوي جدًا | Web أولًا + Electron shell |
| Code tools | read/bash/edit/write | عبر agent/daemon | شاملة + LSP/MCP/git | أدوات أساسية آمنة ثم LSP/MCP |
| Permissions | يحتاج sandbox خارجي افتراضيًا | capability/trust boundaries | permission flows | approval في kernel من اليوم الأول |
| Artifacts/design | محدود | الأفضل | preview/review أكثر من studio | artifact manifest + renderer registry |
| Plugins/skills | extensions/skills | protocol/marketplace واسع | plugins/skills/MCP | manifest بسيط ثم signed registry |
| Sessions/protocol | eventful + CBOR client/server | persisted runs/events | durable runtime متقدم | NDJSON أولًا ثم durable sequence |
| Local-first | نعم | نعم | نعم | افتراضي إلزامي |

---

## 6. التركيبة المختارة للمنتج الأصلي

### من Pi — أفكار وظيفية

- provider-neutral model API.
- agent state/events منفصلة عن العرض.
- TUI مستقلة وقابلة للتوزيع.
- clients يمكن أن تتصل ببروتوكول أو تستخدم النواة in-process.
- sessions قابلة للاستئناف والتوسع.

### من Open Design — أفكار وظيفية

- مشروع يحتوي conversations وartifacts.
- artifact له نوع وentry وmanifest وrenderer/export.
- preview معزولة.
- skills + design-system context + craft evaluators.
- daemon واحد يخدم UI وheadless وMCP.

### من OpenCode — أفكار وظيفية

- shell عملي: navigation، sessions، timeline، files، inspector، composer.
- tool activity وapproval واضحان.
- modes: Plan/Build/Design/Review.
- terminal/diff/checkpoints/command palette.
- Web/Desktop/TUI فوق contract مشترك.

### ما أضفناه كهوية خاصة

- **Code + Design في session واحدة** بدل فصل منتجين.
- inspector مخصص للـartifact وreview معًا.
- سياسة مخاطر موحدة `observe/modify/execute/external/blocked`.
- علامة Zetora وشكل مربعات غير تابع للمراجع.
- دعم العربية/RTL من البداية.
- لا تبعيات تشغيل خارجية للـWeb/TUI في الأساس الأول.

---

## 7. تقييم الملكية

### ما يمكن أن يكون مملوكًا لصاحب المنتج

- الشفرة الجديدة المكتوبة خصيصًا لـZetora، وفق شروط المنصة وعقد العمل المناسب.
- الاسم والشعار النهائيان بعد التحقق والتسجيل.
- النصوص، تصميم النظام، schemas وملفات المشروع الأصلية.

### ما لا يصبح ملكًا حصريًا

- الأفكار العامة مثل chat، sidebar، terminal وfile tree.
- Node.js/Electron وأي dependency مستقبلية.
- APIs وخدمات النماذج.
- أي جزء من المشاريع المرجعية إذا نُسخ؛ يبقى تحت MIT/Apache وشروط الإشعار.

### النتيجة

الطريق الأكثر أمانًا لهدف «ملكي 100%» هو:

1. عدم vendoring أي مرجع.
2. بناء first-party code من مواصفات سلوكية مستقلة.
3. استعمال dependencies مرخصة فقط مع `THIRD_PARTY_NOTICES`.
4. عدم جعل الواجهة pixel-perfect لمنتج آخر.
5. مراجعة محامٍ للعلامة، provenance، شروط مزودي النماذج وعقود نقل الحقوق.

---

## 8. حالة Zetora الحالية بعد التحليل

منجَز فعليًا في المستودع الجديد:

- Web UI أصلية وقابلة للتشغيل.
- Desktop shell أولي.
- TUI مستقلة.
- provider adapters لـOpenAI/Anthropic/Google/OpenRouter/Ollama/custom.
- agent loop وأحداث NDJSON.
- file tree/read/search/write/replace/command tools.
- workspace path confinement وcommand classification.
- approvals للتعديلات والتنفيذ.
- artifact iframe sandbox ومعاينة HTML/source.
- atomic local state وتصدير session.
- وثائق architecture/product/provenance/roadmap.

غير مكتمل بعد ويجب ألا يُسوَّق كمنجز:

- production-grade streaming لكل provider.
- استئناف agent loop تلقائيًا بعد approval.
- Git diff/checkpoints/worktrees/LSP/MCP.
- PTY حقيقية بدل أوامر منفصلة.
- SQLite migrations/indexing.
- plugin marketplace وتوقيعات.
- renderers للصور/الفيديو/audio/decks.
- signing/notarization/updater والتوزيع العام.
- تدقيق أمني وقانوني وعلامة تجارية.

هذا الفصل بين المنجَز والمخطط يمنع الادعاء بأن نموذج أولي يعادل نضج ثلاثة مشاريع كبيرة.
