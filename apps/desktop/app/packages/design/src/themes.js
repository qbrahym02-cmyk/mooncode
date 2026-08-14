/**
 * v3.0.0: Theme system.
 * 10 built-in themes inspired by OpenCode's theme collection.
 */

export const THEMES = {
  "moon-dark": {
    name: "Moon Dark (default)",
    colors: { bg: "#090a0c", surface: "#0e1013", surface2: "#13151a", accent: "#8b7cff", text: "#f2f2f3", text2: "#b8bac2", line: "#242730", mint: "#5fd6ad", amber: "#e8b86d", red: "#ff706c" },
  },
  "moon-light": {
    name: "Moon Light",
    colors: { bg: "#ffffff", surface: "#f5f5f7", surface2: "#ebebef", accent: "#5b5bd6", text: "#1d1d1f", text2: "#424245", line: "#d2d2d7", mint: "#30d158", amber: "#ff9f0a", red: "#ff3b30" },
  },
  catppuccin: {
    name: "Catppuccin Mocha",
    colors: { bg: "#1e1e2e", surface: "#181825", surface2: "#313244", accent: "#cba6f7", text: "#cdd6f4", text2: "#bac2de", line: "#45475a", mint: "#a6e3a1", amber: "#f9e2af", red: "#f38ba8" },
  },
  dracula: {
    name: "Dracula",
    colors: { bg: "#282a36", surface: "#21222c", surface2: "#44475a", accent: "#bd93f9", text: "#f8f8f2", text2: "#bababa", line: "#44475a", mint: "#50fa7b", amber: "#f1fa8c", red: "#ff5555" },
  },
  gruvbox: {
    name: "Gruvbox Dark",
    colors: { bg: "#282828", surface: "#1d2021", surface2: "#3c3836", accent: "#d3869b", text: "#ebdbb2", text2: "#d5c4a1", line: "#504945", mint: "#b8bb26", amber: "#fabd2f", red: "#fb4934" },
  },
  nord: {
    name: "Nord",
    colors: { bg: "#2e3440", surface: "#272c36", surface2: "#3b4252", accent: "#88c0d0", text: "#e5e9f0", text2: "#d8dee9", line: "#434c5e", mint: "#a3be8c", amber: "#ebcb8b", red: "#bf616a" },
  },
  tokyonight: {
    name: "Tokyo Night",
    colors: { bg: "#1a1b26", surface: "#16161e", surface2: "#2a2b3d", accent: "#7aa2f7", text: "#c0caf5", text2: "#a9b1d6", line: "#33374e", mint: "#9ece6a", amber: "#e0af68", red: "#f7768e" },
  },
  monokai: {
    name: "Monokai Pro",
    colors: { bg: "#2d2a2e", surface: "#262327", surface2: "#403e41", accent: "#ab9df2", text: "#fcfcfa", text2: "#c1c0c0", line: "#403e41", mint: "#a9dc76", amber: "#ffd866", red: "#ff6188" },
  },
  synthwave: {
    name: "Synthwave 84",
    colors: { bg: "#262335", surface: "#1a1721", surface2: "#34294f", accent: "#ff7edb", text: "#f8f8f2", text2: "#c1c1c0", line: "#34294f", mint: "#72f1b8", amber: "#ffcc00", red: "#fe4450" },
  },
  github: {
    name: "GitHub Dark",
    colors: { bg: "#0d1117", surface: "#161b22", surface2: "#21262d", accent: "#58a6ff", text: "#e6edf3", text2: "#8b949e", line: "#30363d", mint: "#3fb950", amber: "#d29922", red: "#f85149" },
  },
  // v3.4.0: 25 additional themes
  "catppuccin-latte": {
    name: "Catppuccin Latte",
    colors: { bg: "#eff1f5", surface: "#e6e9ef", surface2: "#dce0e8", accent: "#7287fd", text: "#4c4f69", text2: "#6c6f85", line: "#bcc0cc", mint: "#40a02b", amber: "#df8e1d", red: "#d20f39" },
  },
  "catppuccin-frappe": {
    name: "Catppuccin Frappe",
    colors: { bg: "#303446", surface: "#292c3c", surface2: "#414559", accent: "#babbf1", text: "#c6d0f5", text2: "#a5adce", line: "#51576d", mint: "#a6d189", amber: "#e5c890", red: "#e78284" },
  },
  "catppuccin-macchiato": {
    name: "Catppuccin Macchiato",
    colors: { bg: "#24273a", surface: "#1e2030", surface2: "#363a4f", accent: "#c6a0f6", text: "#cad3f5", text2: "#a5adcb", line: "#494d64", mint: "#a6da95", amber: "#eed49f", red: "#ed8796" },
  },
  "one-dark": {
    name: "One Dark",
    colors: { bg: "#282c34", surface: "#21252b", surface2: "#3b4048", accent: "#61afef", text: "#abb2bf", text2: "#838991", line: "#3b4048", mint: "#98c379", amber: "#e5c07b", red: "#e06c75" },
  },
  "one-light": {
    name: "One Light",
    colors: { bg: "#fafafa", surface: "#f0f0f0", surface2: "#e5e5e5", accent: "#4078f2", text: "#383a42", text2: "#696c77", line: "#d0d0d0", mint: "#50a14f", amber: "#c18401", red: "#e45649" },
  },
  "solarized-dark": {
    name: "Solarized Dark",
    colors: { bg: "#002b36", surface: "#073642", surface2: "#13535f", accent: "#268bd2", text: "#93a1a1", text2: "#7b8b8b", line: "#13535f", mint: "#859900", amber: "#b58900", red: "#dc322f" },
  },
  "solarized-light": {
    name: "Solarized Light",
    colors: { bg: "#fdf6e3", surface: "#eee8d5", surface2: "#e4dcc3", accent: "#268bd2", text: "#586e75", text2: "#839496", line: "#d0c8a8", mint: "#859900", amber: "#b58900", red: "#dc322f" },
  },
  "vesper": {
    name: "Vesper",
    colors: { bg: "#101010", surface: "#181818", surface2: "#282828", accent: "#7c7c7c", text: "#d0d0d0", text2: "#9a9a9a", line: "#303030", mint: "#8fb68b", amber: "#c8a878", red: "#b66868" },
  },
  "vercel": {
    name: "Vercel",
    colors: { bg: "#000000", surface: "#0a0a0a", surface2: "#1a1a1a", accent: "#fafafa", text: "#ededed", text2: "#888888", line: "#222222", mint: "#50e3c2", amber: "#f5a623", red: "#ff6b6b" },
  },
  "cursor": {
    name: "Cursor",
    colors: { bg: "#1e1e1e", surface: "#252526", surface2: "#333333", accent: "#007acc", text: "#d4d4d4", text2: "#858585", line: "#3c3c3c", mint: "#4ec9b0", amber: "#ce9178", red: "#f44747" },
  },
  "kanagawa": {
    name: "Kanagawa",
    colors: { bg: "#1f1f28", surface: "#181820", surface2: "#2a2a37", accent: "#7e9cd8", text: "#dcd7ba", text2: "#c8c093", line: "#363646", mint: "#98bb6c", amber: "#e6c384", red: "#c34043" },
  },
  "rose-pine": {
    name: "Rosé Pine",
    colors: { bg: "#191724", surface: "#1f1d2e", surface2: "#26233a", accent: "#c4a7e7", text: "#e0def4", text2: "#908caa", line: "#403d52", mint: "#31748f", amber: "#ebbcba", red: "#eb6f92" },
  },
  "rose-pine-dawn": {
    name: "Rosé Pine Dawn",
    colors: { bg: "#faf4ed", surface: "#fffaf3", surface2: "#f2e9e1", accent: "#907aa9", text: "#575279", text2: "#797593", line: "#d8d3ca", mint: "#286983", amber: "#d7827e", red: "#b4637a" },
  },
  "everforest": {
    name: "Everforest Dark",
    colors: { bg: "#2d353b", surface: "#272e33", surface2: "#3a454a", accent: "#a7c080", text: "#d3c6aa", text2: "#9da9a0", line: "#475558", mint: "#a7c080", amber: "#dbbc7f", red: "#e67e80" },
  },
  "gruvbox-light": {
    name: "Gruvbox Light",
    colors: { bg: "#fbf1c7", surface: "#f2e5bc", surface2: "#ebdbb2", accent: "#b16286", text: "#3c3836", text2: "#7c6f64", line: "#d5c4a1", mint: "#79740e", amber: "#b57614", red: "#cc241d" },
  },
  "nord-light": {
    name: "Nord Light",
    colors: { bg: "#eceff4", surface: "#e5e9f0", surface2: "#d8dee9", accent: "#5e81ac", text: "#2e3440", text2: "#4c566a", line: "#bdc3c9", mint: "#a3be8c", amber: "#ebcb8b", red: "#bf616a" },
  },
  "dark-plus": {
    name: "VS Code Dark+",
    colors: { bg: "#1e1e1e", surface: "#252526", surface2: "#333333", accent: "#569cd6", text: "#d4d4d4", text2: "#858585", line: "#3c3c3c", mint: "#6a9955", amber: "#ce9178", red: "#f44747" },
  },
  "light-plus": {
    name: "VS Code Light+",
    colors: { bg: "#ffffff", surface: "#f3f3f3", surface2: "#e8e8e8", accent: "#0000ff", text: "#000000", text2: "#666666", line: "#d4d4d4", mint: "#098658", amber: "#cd3131", red: "#cd3131" },
  },
  "material-ocean": {
    name: "Material Ocean",
    colors: { bg: "#0f111a", surface: "#181826", surface2: "#23233a", accent: "#84ffff", text: "#a6accd", text2: "#717cb4", line: "#2a2b3d", mint: "#c3e88d", amber: "#ffcb6b", red: "#f07178" },
  },
  "material-palenight": {
    name: "Material Palenight",
    colors: { bg: "#292d3e", surface: "#1e2235", surface2: "#3a3d50", accent: "#82aaff", text: "#a6accd", text2: "#676e95", line: "#3b3f54", mint: "#c3e88d", amber: "#ffcb6b", red: "#f07178" },
  },
  "night-owl": {
    name: "Night Owl",
    colors: { bg: "#011627", surface: "#0a223a", surface2: "#1a3a5a", accent: "#7fdbca", text: "#d6deeb", text2: "#8badc4", line: "#2a3f5a", mint: "#22da6e", amber: "#addb67", red: "#ef5350" },
  },
  "ayu-dark": {
    name: "Ayu Dark",
    colors: { bg: "#0a0e14", surface: "#0f1419", surface2: "#1a1f29", accent: "#39bae6", text: "#bfbdb6", text2: "#707a8c", line: "#1c2128", mint: "#7fd962", amber: "#ffb454", red: "#f26d78" },
  },
  "ayu-light": {
    name: "Ayu Light",
    colors: { bg: "#fafafa", surface: "#f3f3f3", surface2: "#e8e8e8", accent: "#399ee6", text: "#5c6773", text2: "#828c99", line: "#d4d4d4", mint: "#86b300", amber: "#f2a73d", red: "#f07171" },
  },
  "edge-dark": {
    name: "Edge Dark",
    colors: { bg: "#262d37", surface: "#1c232e", surface2: "#33404d", accent: "#6cb6ff", text: "#c5cdd9", text2: "#9aa5b1", line: "#3b4751", mint: "#8ccf6c", amber: "#e6c07b", red: "#e37170" },
  },
};

export function getTheme(id) {
  return THEMES[id] || THEMES["moon-dark"];
}

export function themeToCSS(theme) {
  const c = theme.colors;
  return `:root{--bg:${c.bg};--surface:${c.surface};--surface-2:${c.surface2};--accent:${c.accent};--text:${c.text};--text-2:${c.text2};--line:${c.line};--mint:${c.mint};--amber:${c.amber};--red:${c.red};}`;
}

export function getThemeList() {
  return Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name }));
}
