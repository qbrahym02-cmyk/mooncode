# المساهمة في Zetora

شكرًا لاهتمامك بالمساهمة في Zetora! 🎉 هذا الدليل يشرح كيف تساهم بفعالية.

## جدول المحتويات

- [قبل البدء](#قبل-البدء)
- [إعداد بيئة التطوير](#إعداد-بيئة-التطوير)
- [سير العمل للمساهمة](#سير-العمل-للمساهمة)
- [معايير الكود](#معايير-الكود)
- [الاختبارات](#الاختبارات)
- [رسائل Commit](#رسائل-commit)
- [الإبلاغ عن الأخطاء](#الإبلاغ-عن-الأخطاء)
- [اقتراح الميزات](#اقتراح-الميزات)
- [قواعد السلوك](#قواعد-السلوك)

## قبل البدء

1. **تحقق من Issues الموجودة** — قد يكون اقتراحك نوقش بالفعل.
2. **افتح Issue أولًا** للميزات الكبيرة لتجنب العمل الضائع.
3. **اقرأ [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** — نلتزم بمجتمع ترحيبي.

## إعداد بيئة التطوير

يتطلب **Node.js 20.12+** و **Git**.

```bash
# 1. Fork المستودع على GitHub
# 2. استنسخ fork الخاص بك
git clone https://github.com/<your-username>/zetora.git
cd zetora

# 3. أضف upstream للحفاظ على التزامن
git remote add upstream https://github.com/qbrahym02-cmyk/zetora.git

# 4. انسخ ملف البيئة
cp .env.example .env

# 5. تحقق من البيئة
npm run env:validate

# 6. شغّل الاختبارات للتأكد من السلامة
npm test

# 7. ابدأ التطوير
npm run dev
```

## سير العمل للمساهمة

```bash
# 1. حدّث main
git checkout main
git pull upstream main

# 2. أنشئ فرعًا لميزتك/إصلاحك
git checkout -b feature/amazing-feature
# أو: fix/bug-description, docs/update-readme, refactor/providers-split

# 3. أضف تغييراتك بـcommits صغيرة وواضحة
git add .
git commit -m "feat: add amazing feature"

# 4. تأكد من الاختبارات والفحص
npm test
npm run check

# 5. ارفع فرعك
git push origin feature/amazing-feature

# 6. افتح Pull Request على GitHub
```

### قواعد أسماء الفروع

- `feature/` — ميزة جديدة
- `fix/` — إصلاح خطأ
- `docs/` — تغييرات في الوثائق
- `refactor/` — إعادة هيكلة بدون تغيير سلوك
- `test/` — إضافة أو تحسين اختبارات
- `chore/` — مهام صيانة (تبعيات، إعدادات)

## معايير الكود

### JavaScript

- **ES Modules** (`import/export`) — لا CommonJS.
- **لا تبعيات خارجية** لنسخة Web/TUI (Node.js قياسي فقط).
- **أسطر أقل من 100 حرف** حيث أمكن.
- **docstrings** للدوال العامة — اشرح ماذا ولماذا، لا كيف.
- **أسماء واضحة** — `parseAST` أفضل من `pa`، `classifyCommand` أفضل من `cc`.

### البنية

- كل حزمة في `packages/<name>/` لها مسؤولية واحدة.
- الاعتمادات تتجه في اتجاه واحد: `agent → kernel/providers/tools`.
- لا تستورد من `apps/` في `packages/`.
- الـhelpers المشتركة في `packages/<name>/src/` وليس ملفات منفصلة.

### الأمان

- **لا تضع أسرارًا في الكود** — استخدم `process.env` أو `.env`.
- **تحقق من المدخلات** — كل مسار/أمر/URL يجب أن يُتحقق منه.
- **استخدم `redactSecrets()`** عند تسجيل مخرجات قد تحتوي أسرارًا.
- **لا تستخدم `eval()` أو `new Function()`**.
- **اقرأ [SECURITY.md](SECURITY.md)** للسياق الكامل.

## الاختبارات

كل ميزة جديدة أو إصلاح يجب أن ي accompanied بـ:

1. **اختبار يُ复 krer السلوك الجديد**.
2. **كل الاختبارات الحالية تنجح** — `npm test` يجب أن يخرج 0.

```bash
# شغّل كل الاختبارات
npm test

# شغّل اختبارًا واحدًا
node --test tests/policy.test.js

# شغّل مع تفصيل أكثر
node --test --test-reporter=spec tests/*.test.js
```

### ما تختبره

- **الوحدة**: دالة واحدة أو فئة واحدة.
- **التكامل**: تفاعل بين حزمتين أو أكثر.
- **الأمان**: path traversal، command injection، XSS، SSRF.
- **الأداء**: حدود الوقت والذاكرة للمسارات الحرجة.

## رسائل Commit

نتبع [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### الأنواع

- `feat:` — ميزة جديدة (`feat: add search-index tool`)
- `fix:` — إصلاح خطأ (`fix: prevent path traversal in workspace.resolve`)
- `docs:` — وثائق (`docs: update README with badges`)
- `refactor:` — إعادة هيكلة (`refactor: split providers/index.js into per-provider files`)
- `test:` — اختبارات (`test: add ED25519 signing tests`)
- `chore:` — صيانة (`chore: bump version to 0.9.2`)
- `security:` — تحسينات أمنية (`security: add command denylist for curl|sh`)

### قواعد

- **الزمن الحاضر**: "add" وليس "added".
- **حرف صغير أول**: "feat: add" وليس "Feat: Add".
- **لا نقطة في النهاية**: "feat: add feature" وليس "feat: add feature."
- **أقل من 72 حرف** في السطر الأول.
- **اشرح لماذا** في الـbody إن كان التغيير غير بديهي.

## الإبلاغ عن الأخطاء

قبل الإبلاغ:

1. **ابحث في Issues الموجودة** — قد يكون مُبلّغ عنه.
2. **جرّب أحدث إصدار** — قد يكون مُصلحًا.
3. **شغّل في وضع debug**: `ZETORA_LOG_LEVEL=debug npm run dev`.

عند الإبلاغ، استخدم [قالب Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) واذكر:

- **إصدار Zetora** (`node scripts/ops.mjs env` يُظهره)
- **إصدار Node.js** (`node --version`)
- **نظام التشغيل**
- **خطوات الإعادة** بالتفصيل
- **السلوك المتوقع vs الفعلي**
- **السجلات** (مع تنقيح الأسرار)

## اقتراح الميزات

1. **افتح Issue** بنوع "feature request".
2. **اشرح المشكلة** التي تحلها الميزة.
3. **اقترح حلًا** — كيف تراها تعمل.
4. **البديل** — ما الحلول الأخرى التي فكرت فيها؟
5. **انتظر نقاشًا** قبل البدء في التنفيذ.

## قواعد السلوك

راجع [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). باختصار:

- **كن محترمًا** — للجميع، بغض النظر عن الخلفية.
- **كن صبورًا** — المساهمون متطوعون.
- **كن بناءً** — انتقد الأفكار، لا الأشخاص.
- **كن مترحيًا** — ساعد المبتدئين.

---

شكرًا لمساهمتك في Zetora! 🚀
