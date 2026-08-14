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
