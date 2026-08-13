# سياسة الأمان

## الإبلاغ عن ثغرة

نأخذ الأمان في Moon Code بجدية. إذا اكتشفت ثغرة أمنية، يرجى الإبلاغ عنها بمسؤولية.

### ⚠️ للثغرات الحرجة

**لا تفتح Issue عام على GitHub.** بدلًا من ذلك:

1. أرسل بريدًا إلكترونيًا إلى: `security@mooncode.dev` (سيُضاف قريبًا)
2. أو استخدم [GitHub Security Advisories](https://github.com/qbrahym02-cmyk/mooncode/security/advisories/new)
3. أو استخدم ميزة "Report a vulnerability" في GitHub

سنرد خلال **48 ساعة** وننشر إصلاحًا خلال **90 يومًا** كحد أقصى (حسب الخطورة).

### للقضايا غير الحرجة

استخدم [قالب تقرير الأمان](.github/ISSUE_TEMPLATE/security_report.md) لفتح Issue عام للقضايا غير الحرجة أو لمناقشة تحسينات الأمان العامة.

## النطاق

### مُغطّى

- ثغرات في خادم Moon Code (`apps/server/`)
- ثغرات في حزم النواة (`packages/`)
- ثغرات في واجهة الويب (`apps/web/`)
- ثغرات في عميل MCP
- ثغرات في نظام الإضافات والتوقيع
- ثغرات في سياسة الموافقة
- ثغرات في حصر المسارات
- ثغرات في تصنيف الأوامر

### غير مُغطّى

- ثغرات في مزوّدي النماذج (OpenAI، Anthropic، إلخ) — أبلغ مزوّدك مباشرةً
- ثغرات في Node.js أو تبعيات نظام التشغيل
- ثغرات في متصفحات الويب نفسها
- هجمات الـsocial engineering
- هجمات تطلب وصولًا فعليًا للجهاز

## مكافآت الاكتشاف

حاليًا لا نقدّم مكافآت مالية، لكن:

- ⭐ سنذكرك في [قائمة المساهمين بالأمان](#المساهمون-بالأمان)
- 🏆 ستحصل على "Security Researcher" badge في Discussions
- 📢 سننشر اسمك في advisory (إن رغبت)

## ميزات الأمان المدمجة

### حصر المسارات (Path Traversal Prevention)

كل المسارات تُحلّ داخل مساحة العمل باستخدام `path.relative()`:

```js
const rel = path.relative(this.root, candidate);
if (rel.startsWith(`..${path.sep}`) || rel === ".." || path.isAbsolute(rel)) {
  throw new Error("Path escapes the selected workspace");
}
```

### قائمة الأوامر المدمّرة

18+ نمط ممنوع حتى مع الموافقة:

- `rm -rf /`، `rm -rf $HOME`، `rm -rf ~`
- `mkfs`، `fdisk`، `parted`، `shutdown`، `reboot`
- `dd of=/dev/...`
- `curl ... | sh`، `wget ... | bash`
- `> /dev/sd*`
- `> /etc/`، `> /boot/`، `> /usr/`
- `kill -9 1`، `killall systemd`
- `crontab`، `at`
- fork bombs
- null bytes

### نظام المخاطر الخماسي

| المستوى | المعنى | موافقة؟ |
|---|---|---|
| `OBSERVE` | قراءة فقط | ❌ لا |
| `MODIFY` | تعديل ملفات | ✅ نعم |
| `EXECUTE` | تنفيذ أوامر shell | ✅ نعم |
| `EXTERNAL` | خارج مساحة العمل | ✅ نعم دائمًا |
| `BLOCKED` | ممنوع | ❌ أبدًا |

### توقيع الإضافات ED25519

الإضافات موقّعة بـED25519 (v0.9+). لا يمكن تزييف التوقيع بدون المفتاح الخاص.

### كشف الأسرار

11 نمط للمفاتيح والرموز:

- OpenAI (`sk-`، `sk-proj-`)
- Anthropic (`sk-ant-`)
- GitHub (`ghp_`، `gho_`، إلخ)
- AWS (`AKIA...`)
- Google (`AIza...`)
- JWT، Bearer tokens
- private keys (RSA، EC، OpenSSH)
- كلمات مرور عامة

### حد المعدل

Sliding window لكل IP (افتراضي: 200 طلب/دقيقة).

### سجل التدقيق

NDJSON غير قابل للتعديل مع rotation تلقائي (10MB لكل ملف، 5 ملفات).

## قائمة فحص أمنية للإنتاج

قبل النشر للإنتاج، تحقق من:

- [ ] `MOONCODE_HOST=127.0.0.1` (لا تربط على `0.0.0.0` إلا للنشر العام)
- [ ] `MOONCODE_SESSION_SECRET` مضبوط (وليس عشوائيًا)
- [ ] `NODE_ENV=production`
- [ ] `MOONCODE_LOG_LEVEL=info` (وليس `debug`)
- [ ] مفاتيح API في `.env` (وليس في الكود)
- [ ] `.env` في `.gitignore`
- [ ] HTTPS مفعّل (عبر reverse proxy)
- [ ] جدار ناري يقيّد المنفذ
- [ ] نسخ احتياطي يومي
- [ ] مراقبة `/api/health`
- [ ] تدقيق دوري لـ`.mooncode/audit.ndjson`

## إصدارات مدعومة

نوفّر تحديثات أمنية لـ:

| الإصدار | الدعم |
|---|---|
| 0.9.x | ✅ مدعوم |
| < 0.9.0 | ❌ غير مدعوم (ارفع ل 0.9.x) |

## المساهمون بالأمان

شكرًا لمن ساهم في تحسين أمان Moon Code:

- (لا أحد حتى الآن — كن أولًا!)

---

**لمزيد من التفاصيل، راجع [دليل العمليات](docs/OPERATIONS.md#9-الأمان).**
