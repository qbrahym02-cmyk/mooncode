<div align="center">

# Zetora · زيتورا

**مساحة عمل محلية للبرمجة والتصميم بالوكلاء — تعمل من نواة واحدة عبر Web وDesktop وTUI**

[![CI](https://github.com/qbrahym02-cmyk/zetora/actions/workflows/ci.yml/badge.svg)](https://github.com/qbrahym02-cmyk/zetora/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520.12-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Version](https://img.shields.io/badge/version-0.9.1-8b7cff)](https://github.com/qbrahym02-cmyk/zetora/releases)
[![License](https://img.shields.io/badge/license-All%20Rights%20Reserved-red)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-121%20passing-brightgreen)](#الاختبارات)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-8b7cff)](CONTRIBUTING.md)
[![Stars](https://img.shields.io/github/stars/qbrahym02-cmyk/zetora?style=social)](https://github.com/qbrahym02-cmyk/zetora/stargazers)

</div>

---

## ما هو Zetora؟

Zetora هو **مساحة عمل وكيلة محلية** (local-first agentic workspace) تجمع بين البرمجة والتصميم في تطبيق واحد. يعمل وكيل ذكي على ملفاتك مباشرةً، مع **موافقة صريحة** على كل عملية تعديل أو تنفيذ — لا يخفي شيئًا، ولا يتحرك في الخفاء.

### المميزات الأساسية

- 🏠 **Local-first** — بياناتك تبقى على جهازك. لا سحابة، لا تتبع.
- 🤖 **وكيل متعدد المزوّدين** — OpenAI، Anthropic، Google، OpenRouter، Ollama، أو أي مزوّد متوافق مع OpenAI.
- 🔒 **موافقة صريحة** — كل عملية تعديل/تنفيذ/خارجية تطلب موافقتك قبل التنفيذ.
- 🛡️ **سياسة مخاطر خماسية** — `observe / modify / execute / external / blocked` في قلب النواة.
- 🔄 **Git مدمج** — كل كتابة تُنشئ checkpoint قابل للتراجع بضغطة زر.
- 🎨 **Artifacts** — 40+ امتداد مدعوم للمعاينة (HTML، صور، Markdown، JSON، كود).
- 🧩 **MCP** — وصّل أدوات خارجية عبر Model Context Protocol.
- 🔌 **إضافات موقّعة** — ED25519 signing للإضافات (v0.9+).
- 🌐 **ثلاث واجهات** — Web، Desktop (Electron)، TUI (الطرفية).
- 🇸🇦 **دعم العربية وRTL** من اليوم الأول.

## التشغيل السريع

يتطلب **Node.js 20.12+**. لا تبعيات تشغيل خارجية.

```bash
# 1. استنسخ المستودع
git clone https://github.com/qbrahym02-cmyk/zetora.git
cd zetora

# 2. انسخ ملف البيئة (اختياري)
cp .env.example .env

# 3. أضف مفاتيح API (اختياري — يعمل بدونها في وضع demo)
echo 'OPENAI_API_KEY=sk-...' >> .env

# 4. شغّل
npm run dev
# افتح http://localhost:4173
```

### واجهة الطرفية (TUI)

```bash
npm run tui
# أو
node apps/tui/src/cli.js --workspace ./workspace
```

### سطح المكتب (Electron)

```bash
npm install
npm run desktop
```

## البنية

```text
zetora/
├── apps/
│   ├── web/           عميل المتصفح (HTML/CSS/JS خام)
│   ├── server/        خادم HTTP محلي + API
│   ├── desktop/       غلاف Electron
│   └── tui/           واجهة الطرفية
├── packages/
│   ├── kernel/        الأحداث + سياسة المخاطر
│   ├── agent/         حلقة الوكيل + الاستئناف + subagents
│   ├── providers/     6 مزودين (OpenAI/Anthropic/Google/Ollama/...)
│   ├── tools/         12 أداة (read/write/grep/parse_ast/...)
│   ├── storage/       تخزين JSON ذري
│   ├── config/        إدارة البيئة + validation  ★ جديد
│   ├── git/           checkpoints + undo + worktrees
│   ├── pty/           جلسات shell دائمة
│   ├── artifacts/     عارض 40+ امتداد
│   ├── watcher/       مراقب ملفات + SSE
│   ├── context/       ملفات سياق + compaction
│   ├── mcp/           عميل Model Context Protocol
│   ├── skills/        سجل مهارات + 5 builtins
│   ├── design/        design tokens + CSS + مرجع بصري
│   ├── security/      ED25519 + audit + rate-limit + secrets
│   ├── autofix/       إصلاح تلقائي + تشخيص أخطاء
│   ├── collab/        تحرير تعاوني (Lamport timestamps)
│   ├── lsp/           تشخيصات ESLint + TypeScript
│   ├── plugins/       سجل إضافات موقّع
│   ├── search-index/  فهرس trigram للبحث السريع
│   └── todos/         قائمة مهام الجلسة
├── docs/              وثائق شاملة
├── docker/            إعداد الحاويات
├── scripts/           سكربتات العمليات (ops.mjs)
└── .github/           CI/CD workflows
```

## سكربتات العمليات

```bash
node scripts/ops.mjs help          # اعرض كل الأوامر

# الأوامر الأساسية:
node scripts/ops.mjs dev           # تطوير مع auto-reload
node scripts/ops.mjs test          # اختبارات
node scripts/ops.mjs env           # اعرض البيئة (الأسرار مخفية)
node scripts/ops.mjs env:validate  # تحقق صارم من البيئة
node scripts/ops.mjs health        # فحص صحة الخادم
node scripts/ops.mjs release X.Y.Z # إنشاء إصدار جديد
node scripts/ops.mjs docker:build  # بناء صورة Docker
node scripts/ops.mjs clean         # تنظيف
```

أو عبر npm:

```bash
npm run dev          # تطوير
npm test             # اختبارات
npm run check        # فحص بناء جملة
npm run env:validate # تحقق من البيئة
npm run health       # فحص الصحة
```

## الأمان

Zetora مبني بمبدأ **local-first** والأمان في قلبه:

| الميزة | الوصف |
|---|---|
| 🔒 **حصر المسارات** | كل المسارات تُحلّ داخل مساحة العمل — لا تجاوز (`path.relative()`). |
| 🚫 **قائمة أوامر مدمّرة** | 18+ نمط ممنوع حتى مع الموافقة (`rm -rf /`، `curl\|sh`، `mkfs`، إلخ). |
| ✅ **موافقة صريحة** | كل تعديل/تنفيذ/خارجية يتطلب موافقتك. |
| 🔑 **توقيع ED25519** | للإضافات بدلًا من SHA-256 المزيف. |
| 🕵️ **كشف الأسرار** | 11 نمط (OpenAI، Anthropic، AWS، JWT، private keys...). |
| ⏱️ **حد المعدل** | sliding window لكل IP. |
| 📝 **سجل تدقيق** | NDJSON غير قابل للتعديل مع rotation تلقائي. |
| 🏠 **localhost افتراضيًا** | الخادم يربط على `127.0.0.1` فقط ما لم تطلب `0.0.0.0` صراحةً. |

اقرأ [SECURITY.md](SECURITY.md) للتفاصيل والإبلاغ عن الثغرات.

## الاختبارات

```bash
npm test
```

```text
ℹ tests 121
ℹ pass 121
ℹ fail 0
ℹ duration_ms ~3.7s
```

الاختبارات تغطي: الوكيل، المزوّدين، الأدوات، Git، PTY، MCP، الأمان (ED25519، audit، rate-limit، secrets)، المهارات، التصميم، الـArtifacts، الـWatcher، الـCollab، الـPlugins.

## Docker

```bash
# بناء وتشغيل
node scripts/ops.mjs docker:build zetora:0.9.1
node scripts/ops.mjs docker:run zetora:0.9.1

# أو عبر docker-compose
docker compose -f docker/docker-compose.yml up prod -d
```

الصورة متعددة المراحل: dev + prod، مع healthcheck، مستخدم غير root، tini كـPID 1.

## الوثائق

| الوثيقة | الوصف |
|---|---|
| [📖 العمليات](docs/OPERATIONS.md) | دليل النشر والمراقبة والنسخ الاحتياطي |
| [🏗️ المعمارية](docs/ARCHITECTURE.md) | بنية النظام والـAPI |
| [🗺️ خارطة الطريق](docs/ROADMAP.md) | المراحل الخمس للمنتج |
| [📝 سجل التغييرات](docs/CHANGELOG.md) | كل الإصدارات |
| [⚖️ سياسة الاستقلال](docs/CLEAN_ROOM.md) | حدود الملكية الفكرية |
| [🔍 تحليل المراجع](docs/ANALYSIS_AR.md) | تحليل Pi/OpenDesign/OpenCode |
| [🤝 المساهمة](CONTRIBUTING.md) | كيف تساهم |
| [🔒 الأمان](SECURITY.md) | سياسة الإبلاغ عن الثغرات |

## المساهمة

نرحب بالمساهمات! اقرأ [CONTRIBUTING.md](CONTRIBUTING.md) للبدء.

```bash
# 1. Fork المستودع
# 2. أنشئ فرعًا
git checkout -b feature/amazing-feature

# 3. أضف تغييراتك وتأكد من الاختبارات
npm test

# 4. ارفع وأنشئ Pull Request
git push origin feature/amazing-feature
```

## خارطة الطريق

- ✅ **Phase 0**: الأساس (Web UI، حزم مشتركة، NDJSON، TUI، Electron)
- 🟡 **Phase 1**: وكيل برمجة موثوق (~85% — streaming، git، PTY، vision، MCP، أدوات متقدمة)
- 🟡 **Phase 2**: مساحة تصميم (~50% — skills، design tokens، preview معزول)
- 🔴 **Phase 3**: عملاء المنتج (~15% — Desktop packaging، TUI binaries، PWA)
- 🟡 **Phase 4**: الإضافات والنظام البيئي (~30% — ED25519 signing، ينقص sandbox + registry)
- 🔴 **Phase 5**: الفرق والاستضافة (~10% — audit log موجود، ينقص الباقي)

اقرأ [ROADMAP.md](docs/ROADMAP.md) للتفاصيل الكاملة.

## الملكية والترخيص

- الشفرة الأصلية في هذا المستودع مضبوطة كـ **All Rights Reserved**.
- هذا ليس رأيًا قانونيًا ولا فحص علامة تجارية نهائي.
- مكتبات الجهات الخارجية تظل تحت رخصها الأصلية (انظر [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).

## المجتمع

- ⭐ **Star** المستودع إذا أعجبك!
- 🐛 [أبلغ عن خطأ](https://github.com/qbrahym02-cmyk/zetora/issues/new?template=bug_report.md)
- 💡 [اقترح ميزة](https://github.com/qbrahym02-cmyk/zetora/issues/new?template=feature_request.md)
- 💬 [ناقش في Discussions](https://github.com/qbrahym02-cmyk/zetora/discussions)
- ☕ [ادعم المشروع](#الدعم)

## الدعم

إذا ساعدك Zetora، يمكنك:

- ⭐ تمييز المستودع بنجمة
- 🐛 الإبلاغ عن الأخطاء والمساهمة في إصلاحها
- 📢 مشاركة المشروع مع من يهتم
- ☕ [Ko-fi](https://ko-fi.com/) (قريبًا)

---

<div align="center">

**صنع بـ ❤️ للناطقين بالعربية والجميع**

[🌐 الموقع](https://github.com/qbrahym02-cmyk/zetora) · [📚 الوثائق](docs/) · [🐛 Issues](https://github.com/qbrahym02-cmyk/zetora/issues) · [💬 Discussions](https://github.com/qbrahym02-cmyk/zetora/discussions)

</div>
