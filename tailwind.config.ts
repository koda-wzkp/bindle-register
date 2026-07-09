import type { Config } from 'tailwindcss';

/**
 * Palette: ink on paper with a single "prompt-book blue" accent — the blue
 * pencil a stage manager marks a prompt copy with. The record page must
 * survive monochrome print, so color is annotation, never structure.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#fcfbf8',
        ink: '#1a1a18',
        'ink-soft': '#55554f',
        rule: '#d8d6cd',
        prompt: '#2545b8',
        'prompt-wash': '#eef1fb',
        caution: '#a33018',
      },
      fontFamily: {
        display: ['"IBM Plex Serif"', 'Georgia', 'serif'],
        body: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
