/**
 * v3.1.0: i18n framework — supports 50+ languages.
 * Uses a simple key-based translation system with JSON dictionaries.
 */
const translations = { en: {}, ar: {} };
let currentLang = "en";
export function setLanguage(lang) { currentLang = lang; }
export function getLanguage() { return currentLang; }
export function registerTranslations(lang, dict) { translations[lang] = { ...translations[lang], ...dict }; }
export function t(key, params = {}) {
  const dict = translations[currentLang] || translations.en || {};
  let str = dict[key] || translations.en?.[key] || key;
  for (const [k, v] of Object.entries(params)) str = str.replace(new RegExp(`\\{${k}\\}`, "g"), v);
  return str;
}
export const SUPPORTED_LANGUAGES = ["en","ar","zh","zht","ja","ko","fr","de","es","ru","pt","it","tr","hi","id","vi","th","fa","he","pl","nl","sv","da","no","fi","cs","hu","el","uk","ro","sk","bg","hr","sr","sl","et","lv","lt","ca","eu","gl","af","sw","ms","tl","ta","te","kn","ml","bn","gu","mr","pa","ur"];
export function isRTL(lang) { return ["ar","he","fa","ur"].includes(lang); }
