import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        go: {
          green: '#0ea5e9',
          dark: '#0b1c2e',
          light: '#E6F4FD',
          accent: '#F5A623',
        },
      },
    },
  },
  plugins: [],
};

export default config;
