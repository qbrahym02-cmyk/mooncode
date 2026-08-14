/**
 * Demo provider: a local, no-network simulation of an agent.
 *
 * Used when no real provider is configured. The demo examines the prompt
 * for intent keywords (analyze / fix / design / search) and returns a
 * canned response with simulated tool calls. Streaming is emulated by
 * chunking the response into word pairs with a small delay, so the UI
 * exercises the same delta path as live providers.
 *
 * This is the only provider that can run without an API key or network
 * access — it is the default for new installations and for the TUI when
 * no provider is configured.
 */
export function demo(request) {
  const prompt = request.messages.at(-1)?.content || "";
  const promptText = typeof prompt === "string"
    ? prompt
    : (Array.isArray(prompt) ? prompt.find((p) => p.type === "text")?.text || "" : "");
  const arabic = /[\u0600-\u06ff]/.test(promptText);

  // Context-aware demo responses: simulate real agent behavior based on intent.
  let text = "";
  let toolCalls = [];

  if (/تحليل|analyze|بنية|structure/i.test(promptText)) {
    toolCalls = [
      { id: crypto.randomUUID(), name: "list_files", input: { path: ".", maxDepth: 3 } },
      { id: crypto.randomUUID(), name: "parse_ast", input: { path: "src/index.js" } },
    ];
    text = arabic
      ? "سأحلّل بنية المشروع. دعني أولًا أستعرض الملفات ثم أفحص بنية الكود.\n\n**الخطوات المخططة:**\n1. عرض شجرة الملفات\n2. تحليل الـAST لكل ملف JS\n3. تقديم ملخص بالبنية والمخاطر"
      : "I'll analyze the project structure. First, let me list the files and then examine the AST.\n\n**Planned steps:**\n1. List file tree\n2. Parse AST for each JS file\n3. Summarize structure and risks";
  } else if (/أصلح|fix|lint|eslint|أخطاء|errors/i.test(promptText)) {
    toolCalls = [
      { id: crypto.randomUUID(), name: "auto_fix", input: { path: ".", dryRun: true } },
    ];
    text = arabic
      ? "سأفحص المشروع بحثًا عن مشاكل قابلة للإصلاح التلقائي. سأبدأ بـ dry run لعرض التغييرات المقترحة قبل التطبيق.\n\n**الإصلاحات الممكنة:**\n- trailing newlines\n- tabs → spaces\n- JSON pretty-printing"
      : "I'll scan the project for auto-fixable issues. Starting with a dry run to preview changes before applying.\n\n**Possible fixes:**\n- Trailing newlines\n- Tabs → spaces\n- JSON pretty-printing";
  } else if (/صمّم|design|artifact|واجهة|landing/i.test(promptText)) {
    toolCalls = [
      { id: crypto.randomUUID(), name: "write_file", input: { path: "designs/generated.html", content: "<!-- generated artifact -->" } },
    ];
    text = arabic
      ? "سأصمّم واجهة أصلية متجاوبة كـ HTML artifact. سأنشئ ملفًا ذاتي الاحتواء مع CSS inline ودعم RTL.\n\n**المواصفات:**\n- متجاوب من 360px إلى 1440px\n- دعم RTL والعربية\n- لا أصول خارجية"
      : "I'll design a responsive native interface as an HTML artifact. Creating a self-contained file with inline CSS and RTL support.\n\n**Specs:**\n- Responsive 360px–1440px\n- RTL and Arabic support\n- No external assets";
  } else if (/ابحث|search|grep|find|بحث/i.test(promptText)) {
    toolCalls = [
      { id: crypto.randomUUID(), name: "grep", input: { pattern: "function", glob: "*.js", contextBefore: 1, contextAfter: 1 } },
    ];
    text = arabic
      ? "سأبحث في المشروع باستخدام grep متقدم مع context lines. سأعرض النتائج مرتبة حسب الصلة."
      : "I'll search the project using advanced grep with context lines. Results will be ranked by relevance.";
  } else {
    text = arabic
      ? "أنا أعمل الآن في الوضع التجريبي المحلي. ربط مزوّد من الإعدادات يفعّل التنفيذ الحقيقي.\n\n**ما يمكنني فعله في demo mode:**\n- تحليل بنية المشروع (اكتب: «حلّل المشروع»)\n- اقتراح إصلاحات (اكتب: «أصلح الأخطاء»)\n- تصميم artifacts (اكتب: «صمّم واجهة»)\n- البحث في الكود (اكتب: «ابحث عن ...»)\n\nجرّب أحد هذه الأوامر لأرى محاكاة استدعاءات الأدوات!"
      : "I'm running in local demo mode. Connect a provider in Settings for live execution.\n\n**What I can do in demo mode:**\n- Analyze project structure (type: \"analyze project\")\n- Suggest fixes (type: \"fix errors\")\n- Design artifacts (type: \"design a landing page\")\n- Search code (type: \"search for ...\")\n\nTry one of these commands to see simulated tool calls!";
  }

  // Simulate streaming so the UI exercises the same path as live providers.
  if (request.stream && request.onDelta) {
    const words = text.split(/(\s+)/);
    return new Promise((resolve) => {
      let index = 0;
      const tick = () => {
        if (index >= words.length) {
          return resolve({
            text,
            toolCalls,
            stopReason: "stop",
            usage: { inputTokens: 12, outputTokens: Math.ceil(text.length / 4) },
          });
        }
        const chunk = words.slice(index, index + 2).join("");
        index += 2;
        request.onDelta(chunk);
        setTimeout(tick, 18);
      };
      tick();
    });
  }

  return Promise.resolve({
    text,
    toolCalls,
    stopReason: "stop",
    usage: { inputTokens: 12, outputTokens: Math.ceil(text.length / 4) },
  });
}
