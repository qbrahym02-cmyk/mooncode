<div align="center">

# Zetora · زيتورا

**مساحة عمل محلية للبرمجة والتصميم بالوكلاء — تعمل من نواة واحدة عبر Web وDesktop وTUI**

[![CI](https://github.com/qbrahym02-cmyk/zetora/actions/workflows/ci.yml/badge.svg)](https://github.com/qbrahym02-cmyk/zetora/actions/workflows/ci.yml)
[![Release](https://github.com/qbrahym02-cmyk/zetora/actions/workflows/release.yml/badge.svg)](https://github.com/qbrahym02-cmyk/zetora/releases)
[![Version](https://img.shields.io/github/v/release/qbrahym02-cmyk/zetora?color=8b7cff&label=version)](https://github.com/qbrahym02-cmyk/zetora/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520.12-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-121%20passing-brightgreen)](#الاختبارات)
[![Downloads](https://img.shields.io/github/downloads/qbrahym02-cmyk/zetora/total?color=8b7cff)](https://github.com/qbrahym02-cmyk/zetora/releases)

</div>

---

## التثبيت

### سطر واحد (macOS / Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/qbrahym02-cmyk/zetora/main/scripts/install/install.sh | bash
```

### PowerShell (Windows)

```powershell
iwr -useb https://raw.githubusercontent.com/qbrahym02-cmyk/zetora/main/scripts/install/install.ps1 | iex
```

### npm

```bash
npm install -g zetora
```

### تنزيل تطبيق سطح المكتب

| المنصة | التحميل |
|---|---|
| 🍎 macOS (Apple Silicon) | [Zetora-arm64.dmg](https://github.com/qbrahym02-cmyk/zetora/releases/latest) |
| 🍎 macOS (Intel) | [Zetora-x64.dmg](https://github.com/qbrahym02-cmyk/zetora/releases/latest) |
| 🪟 Windows | [Zetora-setup.exe](https://github.com/qbrahym02-cmyk/zetora/releases/latest) |
| 🐧 Linux (AppImage) | [Zetora.AppImage](https://github.com/qbrahym02-cmyk/zetora/releases/latest) |
| 🐧 Linux (deb) | [Zetora.deb](https://github.com/qbrahym02-cmyk/zetora/releases/latest) |

→ [كل التنزيلات](https://github.com/qbrahym02-cmyk/zetora/releases/latest)

---

## الاستخدام السريع

```bash
# ابدأ TUI في المجلد الحالي
zetora

# ابدأ خادم HTTP
zetora serve

# افتح مساحة العمل في المتصفح
zetora open

# تحقق من صحة الخادم
zetora health

# اعرض كل الأوامر
zetora help
```

### مثال كامل

```bash
# 1. ابدأ خادم Zetora مع OpenAI
export OPENAI_API_KEY=sk-...
zetora serve --provider openai --model gpt-5-mini --port 4173

# 2. في طرفية أخرى، افتح المتصفح
zetora open

# 3. أو استخدم TUI مباشرة
zetora tui --provider openai --model gpt-5-mini
```

---

## ما هو Zetora؟

Zetora هو **مساحة عمل وكيلة محلية** (local-first agentic workspace) تجمع بين البرمجة والتصميم في تطبيق واحد. يعمل وكيل ذكي على ملفاتك مباشرةً، مع **موافقة صريحة** على كل عملية تعديل أو تنفيذ — لا يخفي شيئًا، ولا يتحرك في الخفاء.

### المميزات الأساسية

- 🏠 **Local-first** — بياناتك تبقى على جهازك. لا سحابة، لا تتبع.
- 🤖 **وكيل متعدد المزوّدين** — OpenAI، Anthropic، Google، OpenRouter، Ollama، أو أي مزوّد متوافق مع OpenAI.
- 🔒 **موافقة صريحة** — كل عملية تعديل/تنفيذ/خارجية تطلب موافقتك قبل التنفيذ.
- 🛡️ **سياسة مخاطر خماسية** — `observe / modify / execute / external / blocked` في قلب النواة.
- 🔄 **Git مدمج** — كل كتابة تُنشئ checkpoint قابل للتراجع بضغطة زر.
- 🎨 **Artifacts** — 40+ امتداد مدعوم للمعاينة.
- 🧩 **MCP** — وصّل أدوات خارجية عبر Model Context Protocol.
- 🔌 **إضافات موقّعة** — ED25519 signing للإضافات.
- 🌐 **ثلاث واجهات** — Web، Desktop (Electron)، TUI (الطرفية).
- 🇸🇦 **دعم العربية وRTL** من اليوم الأول.

## التشغيل من المصدر

يتطلب **Node.js 20.12+**. لا تبعيات تشغيل خارجية.

```bash
git clone https://github.com/qbrahym02-cmyk/zetora.git
cd zetora
cp .env.example .env
npm run dev
# افتح http://localhost:4173
```

## البنية

```text
zetora/
├── apps/
│   ├── cli/             ★ CLI مستقل (zetora command)
│   ├── web/             عميل المتصفح
│   ├── server/          خادم HTTP محلي + API
│   ├── desktop/         تطبيق Electron (macOS/Windows/Linux)
│   └── tui/             واجهة الطرفية
├── packages/
│   ├── kernel/          الأحداث + سياسة المخاطر
│   ├── agent/           حلقة الوكيل + الاستئناف + subagents
│   ├── providers/       6 مزودين (OpenAI/Anthropic/Google/Ollama/...)
│   ├── tools/           12 أداة (read/write/grep/parse_ast/...)
│   ├── config/          إدارة البيئة + validation
│   ├── git/             checkpoints + undo + worktrees
│   └── ...              (20 حزمة إجمالًا)
├── docs/                وثائق شاملة
├── docker/              إعداد الحاويات
├── scripts/
│   ├── ops.mjs          سكربتات العمليات
│   └── install/         سكربتات التثبيت (install.sh + install.ps1)
└── .github/             CI/CD workflows
```

## سكربتات العمليات

```bash
node scripts/ops.mjs help          # اعرض كل الأوامر
node scripts/ops.mjs dev           # تطوير مع auto-reload
node scripts/ops.mjs test          # اختبارات
node scripts/ops.mjs release X.Y.Z # إنشاء إصدار جديد
node scripts/ops.mjs docker:build  # بناء صورة Docker
```

## الأمان

| الميزة | الوصف |
|---|---|
| 🔒 **حصر المسارات** | كل المسارات تُحلّ داخل مساحة العمل — لا تجاوز. |
| 🚫 **قائمة أوامر مدمّرة** | 18+ نمط ممنوع حتى مع الموافقة. |
| ✅ **موافقة صريحة** | كل تعديل/تنفيذ/خارجية يتطلب موافقتك. |
| 🔑 **توقيع ED25519** | للإضافات بدلًا من SHA-256 المزيف. |
| 🕵️ **كشف الأسرار** | 11 نمط (OpenAI، Anthropic، AWS، JWT، private keys...). |
| ⏱️ **حد المعدل** | sliding window لكل IP. |
| 📝 **سجل تدقيق** | NDJSON غير قابل للتعديل مع rotation تلقائي. |
| 🏠 **localhost افتراضيًا** | الخادم يربط على `127.0.0.1` فقط ما لم تطلب `0.0.0.0`. |

اقرأ [SECURITY.md](SECURITY.md) للتفاصيل.

## الاختبارات

```bash
npm test
# ℹ tests 121 · ℹ pass 121 · ℹ fail 0 · ~3.7s
```

## Docker

```bash
node scripts/ops.mjs docker:build zetora:0.9.1
node scripts/ops.mjs docker:run zetora:0.9.1
# أو
docker compose -f docker/docker-compose.yml up prod -d
```

## الوثائق

| الوثيقة | الوصف |
|---|---|
| [📖 العمليات](docs/OPERATIONS.md) | دليل النشر والمراقبة |
| [🏗️ المعمارية](docs/ARCHITECTURE.md) | بنية النظام والـAPI |
| [🗺️ خارطة الطريق](docs/ROADMAP.md) | المراحل الخمس |
| [📝 سجل التغييرات](docs/CHANGELOG.md) | كل الإصدارات |
| [🤝 المساهمة](CONTRIBUTING.md) | كيف تساهم |
| [🔒 الأمان](SECURITY.md) | سياسة الإبلاغ عن الثغرات |

## المساهمة

نرحب بالمساهمات! اقرأ [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
git checkout -b feature/amazing-feature
npm test
git push origin feature/amazing-feature
# افتح Pull Request
```

## المجتمع

- ⭐ **Star** المستودع إذا أعجبك!
- 🐛 [أبلغ عن خطأ](https://github.com/qbrahym02-cmyk/zetora/issues/new?template=bug_report.md)
- 💡 [اقترح ميزة](https://github.com/qbrahym02-cmyk/zetora/issues/new?template=feature_request.md)
- 💬 [ناقش في Discussions](https://github.com/qbrahym02-cmyk/zetora/discussions)

## الترخيص

[MIT](LICENSE) — استخدمه بحرية!

---

<div align="center">

**صنع بـ ❤️ للناطقين بالعربية والجميع**

[🌐 الموقع](https://github.com/qbrahym02-cmyk/zetora) · [📚 الوثائق](docs/) · [🐛 Issues](https://github.com/qbrahym02-cmyk/zetora/issues) · [💬 Discussions](https://github.com/qbrahym02-cmyk/zetora/discussions) · [📦 Releases](https://github.com/qbrahym02-cmyk/zetora/releases)

</div>
