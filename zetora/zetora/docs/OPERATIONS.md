# Zetora Operations Runbook

> دليل العمليات اليومية لإدارة Zetora في بيئات التطوير والإنتاج.

## جدول المحتويات

1. [البدء السريع](#1-البدء-السريع)
2. [إدارة البيئة](#2-إدارة-البيئة)
3. [التشغيل اليومي](#3-التشغيل-اليومي)
4. [النشر بالإنتاج](#4-النشر-بالإنتاج)
5. [المراقبة والصحة](#5-المراقبة-والصحة)
6. [إدارة الإصدارات](#6-إدارة-الإصدارات)
7. [استكشاف الأخطاء](#7-استكشاف-الأخطاء)
8. [النسخ الاحتياطي والاستعادة](#8-النسخ-الاحتياطي-والاستعادة)
9. [الأمان](#9-الأمان)

---

## 1. البدء السريع

### المتطلبات

- **Node.js** 20.12 أو أحدث (`node --version`)
- **Git** (للميزة checkpoint/undo)
- **Docker** (اختياري، للنشر الحاوياتي)

### التثبيت الأولى

```bash
# 1. انسخ ملف البيئة
cp .env.example .env

# 2. (اختياري) أضف مفاتيح API
echo 'OPENAI_API_KEY=sk-...' >> .env

# 3. تحقق من البيئة
npm run env:validate

# 4. شغّل الاختبارات للتأكد من السلامة
npm test

# 5. ابدأ التطوير
npm run dev
```

افتح `http://localhost:4173` في المتصفح.

---

## 2. إدارة البيئة

### ملف `.env`

كل تكوين Zetora يتم عبر متغيرات البيئة. الملف `.env.example` يوثّق كل خيار.

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `ZETORA_PORT` | 4173 | منفذ HTTP |
| `ZETORA_HOST` | 127.0.0.1 | عنوان الربط |
| `ZETORA_ALLOW_REMOTE` | 0 | السماح بالربط على 0.0.0.0 |
| `ZETORA_WORKSPACE` | ./workspace | مسار مساحة العمل |
| `ZETORA_DATA` | ./.zetora | مسار بيانات التشغيل |
| `ZETORA_LOG_LEVEL` | info | debug/info/warn/error |
| `ZETORA_SESSION_SECRET` | (عشوائي) | سر توقيع الجلسات |
| `OPENAI_API_KEY` | (فارغ) | مفتاح OpenAI |
| `ANTHROPIC_API_KEY` | (فارغ) | مفتاح Anthropic |
| `GOOGLE_API_KEY` | (فارغ) | مفتاح Google |
| `NODE_ENV` | development | development/production/test |

### التحقق من البيئة

```bash
# اطبع البيئة الحالية (الأسرار تظهر كـ [SET]/[UNSET])
npm run env

# تحقق صارم — يخرج بخطأ إذا كانت هناك مشكلة
npm run env:validate
```

### توليد سر الجلسة

```bash
openssl rand -hex 32
# انسخ الناتج إلى .env:
# ZETORA_SESSION_SECRET=<الناتج>
```

---

## 3. التشغيل اليومي

### أوامر ops الموحدة

```bash
node scripts/ops.mjs help          # اعرض كل الأوامر
node scripts/ops.mjs dev           # ابدأ الخادم مع auto-reload
node scripts/ops.mjs start         # ابدأ خادم الإنتاج
node scripts/ops.mjs test          # شغّل الاختبارات
node scripts/ops.mjs check         # فحص بناء الجملة
node scripts/ops.mjs env           # اعرض البيئة
node scripts/ops.mjs health        # فحص صحة الخادم
node scripts/ops.mjs clean         # نظّف الملفات المؤقتة
node scripts/ops.mjs git:status    # حالة git
node scripts/ops.mjs git:push      # ارفع الكود والوسوم
```

أو عبر npm scripts:

```bash
npm run dev          # = ops dev
npm test             # = ops test
npm run check        # = ops check
npm run health       # = ops health
npm run clean        # = ops clean
```

### التطوير مع auto-reload

```bash
npm run dev:watch
# أو
node scripts/ops.mjs dev
```

الخادم يعيد التشغيل تلقائيًا عند تعديل أي ملف `.js`.

---

## 4. النشر بالإنتاج

### النشر بإستخدام Docker (موصى به)

```bash
# 1. ابنِ الصورة
node scripts/ops.mjs docker:build zetora:0.9.1

# 2. شغّلها
node scripts/ops.mjs docker:run zetora:0.9.1 4173:4173

# أو عبر docker-compose
docker compose -f docker/docker-compose.yml up prod -d
```

### النشر بدون Docker

```bash
# 1. انسخ الكود إلى الخادم
git clone <repo-url> /opt/zetora
cd /opt/zetora

# 2. اضبط البيئة
cp .env.example .env
# عدّل .env: ZETORA_HOST, ZETORA_SESSION_SECRET, مفاتيح API
NODE_ENV=production

# 3. تحقق
npm run env:validate
npm test

# 4. شغّل
NODE_ENV=production npm start
```

### النشر بإستخدام systemd

أنشئ `/etc/systemd/system/zetora.service`:

```ini
[Unit]
Description=Zetora agentic workspace
After=network.target

[Service]
Type=simple
User=zetora
WorkingDirectory=/opt/zetora
EnvironmentFile=/opt/zetora/.env
ExecStart=/usr/bin/node apps/server/src/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

ثم:

```bash
sudo systemctl daemon-reload
sudo systemctl enable zetora
sudo systemctl start zetora
sudo systemctl status zetora
```

### خادم عكسي (Nginx)

```nginx
server {
    listen 80;
    server_name zetora.example.com;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

---

## 5. المراقبة والصحة

### Health Check Endpoint

```bash
curl http://127.0.0.1:4173/api/health
```

الاستجابة:

```json
{
  "ok": true,
  "service": "zetora",
  "version": "0.9.1",
  "uptime": 3600,
  "workspace": "/opt/zetora/workspace",
  "memory": {
    "rssMb": 85,
    "heapUsedMb": 42,
    "heapTotalMb": 64
  },
  "git": {
    "repository": true,
    "head": "main",
    "modifiedFiles": 0,
    "untrackedFiles": 2
  },
  "sessions": 5,
  "approvalsPending": 0
}
```

### فحص صحة سريع

```bash
node scripts/ops.mjs health
```

### مراقبة مستمرة

```bash
# راقب health كل 30 ثانية
watch -n 30 'curl -s http://127.0.0.1:4173/api/health | jq'

# راقب السجلات
journalctl -u zetora -f           # systemd
docker compose logs -f prod       # Docker
tail -f .zetora/audit.ndjson      # سجل التدقيق
```

### مؤشرات صحية

| المؤشر | الصحي | التحذير | الخطر |
|---|---|---|---|
| `ok` | true | — | false |
| `memory.rssMb` | < 256 | 256-512 | > 512 |
| `memory.heapUsedMb` | < 128 | 128-256 | > 256 |
| `approvalsPending` | 0 | 1-5 | > 5 (قد يكون الوكيل عالقًا) |
| `uptime` | متزايد | — | 0 (أعاد التشغيل للتو) |

---

## 6. إدارة الإصدارات

### إنشاء إصدار جديد

```bash
# 1. تأكد أنك على main ومحدّث
git checkout main
git pull

# 2. شغّل الاختبارات
npm test

# 3. أنشئ الإصدار (يفترض semver)
node scripts/ops.mjs release 0.9.2
# هذا:
#   - يحدّث package.json و kernel PRODUCT.version
#   - يشغّل الاختبارات
#   - ينسخ التغييرات وينشئ tag

# 4. ارفع
node scripts/ops.mjs git:push
```

### إصدارات pre-release

```bash
node scripts/ops.mjs release 0.10.0-beta.1
# tag: v0.10.0-beta.1 (يُعامل كـ prerelease في GitHub)
```

### الالتزام بـ semver

- **PATCH** (0.9.1 → 0.9.2): إصلاحات أخطاء، تحسينات أمنية، بدون breaking changes.
- **MINOR** (0.9.x → 0.10.0): ميزات جديدة، backward-compatible.
- **MAJOR** (0.x → 1.0.0): breaking changes.

---

## 7. استكشاف الأخطاء

### الخادم لا يبدأ

```bash
# تحقق من البيئة
npm run env:validate

# تحقق من المنفذ
lsof -i :4173

# شغّل في وضع debug
ZETORA_LOG_LEVEL=debug npm run dev
```

### الـagent لا يستجيب

1. تحقق من `health` → `approvalsPending` قد يكون عاليًا.
2. تحقق من مفاتيح API: `npm run env` (يجب أن تظهر `[SET]`).
3. جرّب مزوّدًا مختلفًا من الإعدادات.
4. راجع سجل التدقيق: `tail -f .zetora/audit.ndjson | jq .`

### Git checkpoints لا تعمل

```bash
# تحقق من حالة git
cd workspace && git status

# أعد التهيئة إن لزم
curl -X POST http://127.0.0.1:4173/api/git/init
```

### استهلاك ذاكرة عالٍ

```bash
# راقب الذاكرة
watch -n 5 'curl -s http://127.0.0.1:4173/api/health | jq .memory'

# إذا تجاوز heapUsed 256MB:
# 1. أعد تشغيل الخادم
# 2. تحقق من الجلسات الطويلة (compaction قد يكون معطّلًا)
# 3. راجع .zetora/state.json حجمه
```

### سجل التدقيق ينمو بلا حدود

```bash
# تحقق من الحجم
ls -lh .zetora/audit.ndjson*

# الـrotation يعمل تلقائيًا عند 10MB
# لتغيير الحد:
ZETORA_AUDIT_MAX_BYTES=5242880  # 5MB
```

---

## 8. النسخ الاحتياطي والاستعادة

### ما يجب نسخه احتياطيًا

| المسار | المحتوى | الأهمية |
|---|---|---|
| `.zetora/state.json` | الجلسات، الموافقات، الإعدادات | حرج |
| `.zetora/audit.ndjson` | سجل التدقيق | حرج |
| `.zetora/mcp.json` | تكوين خوادم MCP | متوسط |
| `.zetora/trust-registry.json` | مؤلفون موثوقون | متوسط |
| `.zetora/plugin-signing.key` | مفتاح التوقيع الخاص | حرج (لا يُرفع للـgit) |
| `workspace/` | ملفات مشروعك | حرج |
| `.env` | المفاتيح والأسرار | حرج (لا يُرفع للـgit) |

### نسخ احتياطي يومي

```bash
#!/bin/bash
# scripts/backup.sh
DATE=$(date +%Y%m%d)
BACKUP_DIR="/backups/zetora/$DATE"
mkdir -p "$BACKUP_DIR"

# نسخ البيانات الحرجة
cp -r .zetora "$BACKUP_DIR/"
cp .env "$BACKUP_DIR/"
cp -r workspace "$BACKUP_DIR/"

# ضغط
tar -czf "$BACKUP_DIR.tar.gz" "$BACKUP_DIR"
rm -rf "$BACKUP_DIR"

# احتفظ بآخر 30 يومًا فقط
find /backups/zetora -name "*.tar.gz" -mtime +30 -delete
```

أضف إلى crontab:
```cron
0 2 * * * /opt/zetora/scripts/backup.sh
```

### الاستعادة

```bash
# 1. أوقف الخادم
sudo systemctl stop zetora

# 2. استعد
cd /opt/zetora
tar -xzf /backups/zetora/20260101.tar.gz -C .
cp 20260101/.zetora .zetora
cp 20260101/.env .env
cp -r 20260101/workspace/* workspace/

# 3. أعد التشغيل
sudo systemctl start zetora
```

---

## 9. الأمان

### قائمة فحص أمني للإنتاج

- [ ] `ZETORA_HOST=127.0.0.1` (لا تربط على 0.0.0.0 إلا إذا أردت وصول شبكي)
- [ ] `ZETORA_SESSION_SECRET` مضبوط (وليس عشوائيًا)
- [ ] `NODE_ENV=production`
- [ ] `ZETORA_LOG_LEVEL=info` (وليس debug في الإنتاج)
- [ ] مفاتيح API مضبوطة في `.env` (وليس في الكود)
- [ ] `.env` في `.gitignore` ولا يُرفع للـgit
- [ ] HTTPS مفعّل (عبر Nginx/Caddy reverse proxy)
- [ ] جدار ناري يقيّد المنفذ 4173
- [ ] نسخ احتياطي يومي للبيانات الحرجة
- [ ] مراقبة مستمرة لـ`/api/health`
- [ ] تدقيق دوري لـ`.zetora/audit.ndjson`

### كشف الأسرار المسرّبة

```bash
# ابحث عن أسرار في سجل التدقيق (يجب أن تكون [REDACTED])
grep -v "REDACTED" .zetora/audit.ndjson | grep -E "sk-|ghp_|AKIA" | head

# ابحث عن أسرار في الكود المرفوع
git log -p | grep -E "sk-proj-|sk-ant-|ghp_" | head
```

### استدارة المفاتيح

عند اشتباه تسريب مفتاح:

1. **أوقف الخادم** فورًا.
2. **أبطل المفتاح** من لوحة تحكم المزوّد.
3. **ولّد مفتاحًا جديدًا** وضعه في `.env`.
4. **راجع سجل التدقيق** للأنشطة المشبوهة.
5. **أعد التشغيل**.

### توقيع الإضافات

```bash
# توليد مفاتيح التوقيع (مرة واحدة)
node -e "
  import('./packages/security/src/index.js').then(async ({ PluginSigner }) => {
    const signer = new PluginSigner('.zetora');
    await signer.generateKeys();
    console.log('Keys generated in .zetora/');
  });
"

# المفتاح الخاص (.zetora/plugin-signing.key) يجب أن يبقى سريًا!
# المفتاح العام (.zetora/plugin-signing.pub) يُوزّع مع التطبيق.
```

---

## روابط مفيدة

- [CHANGELOG](../docs/CHANGELOG.md)
- [ARCHITECTURE](../docs/ARCHITECTURE.md)
- [ROADMAP](../docs/ROADMAP.md)
- [CLEAN_ROOM policy](../docs/CLEAN_ROOM.md)
- [تحليل المراجع](../docs/ANALYSIS_AR.md)
