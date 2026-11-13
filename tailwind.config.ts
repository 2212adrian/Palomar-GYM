import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

/**
 * Unified CSS Theme Configuration mapping directly to the CSS custom
 * properties declared in `src/index.css`. Update the CSS variables in
 * `src/index.css` (or reference these tokens here) to tune the primary
 * blue palette and surface hierarchy across the entire application.
 */
export const cssThemeVariables = {
  colors: {
    primary: {
      DEFAULT: 'var(--color-primary)',
      hover: 'var(--color-primary-hover)',
      light: 'var(--color-primary-light)',
      glow: 'var(--color-glow)',
    },
    brand: {
      DEFAULT: 'var(--color-primary)',
      hover: 'var(--color-primary-hover)',
      light: 'var(--color-primary-light)',
      glow: 'var(--color-glow)',
    },
    surface: {
      page: 'var(--bg-page)',
      card: 'var(--bg-card)',
      input: 'var(--bg-input)',
    },
    'theme-border': 'var(--border-color)',
    'theme-text': 'var(--color-text)',
  },
} as const;

export const brandThemePlugin = plugin(({ addUtilities }) => {
  addUtilities({
    '.bg-brand-primary': {
      backgroundColor: 'var(--color-primary)',
    },
    '.bg-brand-primary-hover': {
      backgroundColor: 'var(--color-primary-hover)',
    },
    '.text-brand-primary': {
      color: 'var(--color-primary)',
    },
    '.text-brand-primary-light': {
      color: 'var(--color-primary-light)',
    },
    '.border-brand-primary': {
      borderColor: 'var(--color-primary)',
    },
    '.ring-brand-primary': {
      '--tw-ring-color': 'rgba(var(--color-primary-rgb), 0.35)',
    },
    '.glow-brand-primary': {
      boxShadow: '0 0 14px rgba(var(--color-primary-rgb), 0.35)',
    },
  });
});

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: cssThemeVariables.colors,
    },
  },
  plugins: [brandThemePlugin],
};

export default config;
