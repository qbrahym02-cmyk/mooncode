# Zetora · زيتورا

> مساحة عمل محلية للبرمجة والتصميم بالوكلاء، تعمل من نواة واحدة عبر **Web وDesktop وTUI**.

**الإصدار الحالي:** v0.9.1  
**الحالة:** نموذج أولي متقدم — غير جاهز للإنتاج بعد  
**الترخيص:** All Rights Reserved (غيّر `[OWNER LEGAL NAME]` قبل التوزيع)

## التشغيل السريع

يتطلب Node.js 20.12 أو أحدث.

```bash
# 1. انسخ ملف البيئة وعدّله إن أردت
cp .env.example .env

# 2. أضف مفاتيح API (اختياري — يعمل بدونها في وضع demo)
echo 'OPENAI_API_KEY=sk-...' >> .env

# 3. شغّل
npm run dev
# افتح http://localhost:4173
```

## سكربتات العمليات

```bash
npm run dev        # تشغيل الخادم في وضع التطوير
npm run start      # تشغيل الخادم في وضع الإنتاج
npm run tui        # تشغيل واجهة الطرفية المستقلة
npm test           # تشغيل الاختبارات (121 اختبار)
npm run check      # فحص بناء جملة جميع الملفات
npm run lint       # فحص الأنماط (إن وُجد ESLint)
npm run build      # بناء حزم الإنتاج
npm run release    # إنشاء إصدار جديد (tag + changelog)
```

## البنية

```text
apps/
  web/        عميل المتصفح
  server/     API محلي وملفات ثابتة
  desktop/    غلاف Electron
  tui/        عميل الطرفية المستقل
packages/
  kernel/     الأحداث وسياسة المخاطر
  agent/      حلقة الوكيل + الاستئناف + MCP + skills + context
  providers/  محولات النماذج (6 مزودين) + البث + الصور + تقدير التكلفة
  tools/      أدوات مساحة العمل (12 أداة)
  storage/    تخزين محلي ذري
  config/     إدارة البيئة والتحقق منها  ★ جديد في v0.9.1
  git/        تكامل Git: checkpoints + undo + فروع
  pty/        جلسات shell الدائمة
  artifacts/  سجل عارضين: 40+ امتداد
  watcher/    مراقب الملفات + SSE
  context/    ملفات السياق + ضغط السجل
  mcp/        عميل Model Context Protocol
  skills/     سجل المهارات + الـbuiltins
  design/     design tokens + ورقة CSS + مرجع بصري
  security/   ED25519 + trust registry + audit + rate-limit + secrets
  autofix/    إصلاح تلقائي + تشخيص أخطاء
  collab/     تحرير تعاوني (Lamport timestamps)
  lsp/        تشخيصات ESLint + TypeScript
  plugins/    سجل إضافات مع توقيع
  search-index/  فهرس trigram للبحث السريع
  todos/      قائمة مهام الجلسة
docs/         التحليل والمواصفات وخطة الإنتاج
docker/       إعداد الحاويات
scripts/      سكربتات العمليات
.github/      CI/CD workflows
```

## الوثائق

- [التحليل الكامل للمراجع](docs/ANALYSIS_AR.md)
- [المعمارية](docs/ARCHITECTURE.md)
- [حدود الاستقلال والملكية](docs/CLEAN_ROOM.md)
- [خطة التحويل إلى منتج كامل](docs/ROADMAP.md)
- [سجل التغييرات](docs/CHANGELOG.md)
- [دليل العمليات](docs/OPERATIONS.md) — ★ جديد في v0.9.1

## الأمان

- **local-first افتراضيًا**: الخادم يربط على `127.0.0.1` فقط ما لم تُطلب `0.0.0.0` صراحةً.
- **موافقة صريحة**: كل عملية تعديل/تنفيذ/خارجية تطلب موافقة قبل التنفيذ.
- **سياسة مخاطر خماسية**: `observe/modify/execute/external/blocked` في النواة.
- **توقيع ED25519**: للإضافات (v0.9) بدل SHA-256 المزيف.
- **كشف الأسرار**: 11 نمط للمفاتيح والرموز.
- **حد المعدل**: sliding window لكل IP.
- **سجل تدقيق**: NDJSON غير قابل للتعديل مع rotation.

## الملكية والترخيص

- الشفرة الأصلية في هذا المستودع مضبوطة كـ **All Rights Reserved**.
- غيّر `[OWNER LEGAL NAME]` في `LICENSE` و`brand.json` قبل التوزيع.
- هذا ليس رأيًا قانونيًا ولا فحص علامة تجارية نهائي.
