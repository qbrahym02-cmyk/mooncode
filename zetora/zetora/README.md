<div align="center">

# 🌙 Moon Code · مون كود

**مساحة عمل محلية للبرمجة والتصميم بالوكلاء**

[![CI](https://github.com/qbrahym02-cmyk/mooncode/actions/workflows/ci.yml/badge.svg)](https://github.com/qbrahym02-cmyk/mooncode/actions)
[![Release](https://github.com/qbrahym02-cmyk/mooncode/actions/workflows/release.yml/badge.svg)](https://github.com/qbrahym02-cmyk/mooncode/releases)
[![Version](https://img.shields.io/github/v/release/qbrahym02-cmyk/mooncode?color=8b7cff)](https://github.com/qbrahym02-cmyk/mooncode/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Downloads](https://img.shields.io/github/downloads/qbrahym02-cmyk/mooncode/total?color=8b7cff)](https://github.com/qbrahym02-cmyk/mooncode/releases)

</div>

---

## التثبيت

```bash
npx mooncode
```

هذا كل ما تحتاجه. أو ثبّته دائمًا:

```bash
npm install -g mooncode
```

## الاستخدام

```bash
mooncode start
```

هذا الأمر يبدأ الخادم **ويفتح المتصفح** تلقائيًا. هذه هي الكلمات الثلاث التي تحتاج تذكرها فقط.

### أوامر أخرى

| الأمر | الوصف |
|---|---|
| `mooncode start` | ★ ابدأ كل شيء (الخادم + المتصفح) |
| `mooncode tui` | واجهة الطرفية |
| `mooncode help` | اعرض كل الأوامر |
| `mooncode version` | اعرض الإصدار |

## تحميل تطبيق سطح المكتب

| المنصة | الرابط |
|---|---|
| 🐧 Linux | [تحميل](https://github.com/qbrahym02-cmyk/mooncode/releases/latest) |
| 🍎 macOS | [تحميل](https://github.com/qbrahym02-cmyk/mooncode/releases/latest) |
| 🪟 Windows | [تحميل](https://github.com/qbrahym02-cmyk/mooncode/releases/latest) |
| 🌐 الموقع | [mooncode.pages.dev](https://qbrahym02-cmyk.github.io/mooncode/) |

→ [كل التنزيلات](https://github.com/qbrahym02-cmyk/mooncode/releases/latest)

---

## ما هو Moon Code؟

Moon Code هو **مساحة عمل وكيلة محلية** تجمع بين البرمجة والتصميم في تطبيق واحد. يعمل وكيل ذكي على ملفاتك مباشرةً، مع **موافقة صريحة** على كل عملية تعديل أو تنفيذ.

### المميزات

- 🏠 **Local-first** — بياناتك تبقى على جهازك
- 🤖 **6 مزوّدين** — OpenAI، Anthropic، Google، OpenRouter، Ollama، custom
- 🔒 **موافقة صريحة** على كل تعديل/تنفيذ
- 🛡️ **سياسة مخاطر خماسية** في قلب النواة
- 🔄 **Git مدمج** — كل كتابة checkpoint قابل للتراجع
- 🎨 **40+ امتداد** للمعاينة
- 🧩 **MCP** — وصّل أدوات خارجية
- 🇸🇦 **دعم العربية وRTL**

## من المصدر

```bash
git clone https://github.com/qbrahym02-cmyk/mooncode.git
cd mooncode
npm test          # 121 اختبارًا
npm run dev       # تطوير
```

## البنية

```text
apps/
  cli/             واجهة سطر الأوامر (mooncode)
  web/             عميل المتصفح
  server/          خادم HTTP
  desktop/         تطبيق Electron (macOS/Windows/Linux)
  tui/             واجهة الطرفية
packages/          20 حزمة (kernel, agent, providers, tools, ...)
docs/              الوثائق + صفحة الموقع
docker/            إعداد الحاويات
scripts/           سكربتات العمليات
```

## الوثائق

- [📖 العمليات](docs/OPERATIONS.md)
- [🏗️ المعمارية](docs/ARCHITECTURE.md)
- [🗺️ خارطة الطريق](docs/ROADMAP.md)
- [📝 سجل التغييرات](docs/CHANGELOG.md)
- [🔒 الأمان](SECURITY.md)
- [🤝 المساهمة](CONTRIBUTING.md)

## المجتمع

- ⭐ **Star** المستودع إذا أعجبك!
- 🐛 [أبلغ عن خطأ](https://github.com/qbrahym02-cmyk/mooncode/issues/new?template=bug_report.md)
- 💡 [اقترح ميزة](https://github.com/qbrahym02-cmyk/mooncode/issues/new?template=feature_request.md)
- 💬 [ناقش](https://github.com/qbrahym02-cmyk/mooncode/discussions)

## الترخيص

[MIT](LICENSE) — استخدمه بحرية!

---

<div align="center">

**صنع بـ ❤️ للناطقين بالعربية والجميع**

[🌐 الموقع](https://qbrahym02-cmyk.github.io/mooncode/) · [📦 GitHub](https://github.com/qbrahym02-cmyk/mooncode) · [🐛 Issues](https://github.com/qbrahym02-cmyk/mooncode/issues)

</div>
