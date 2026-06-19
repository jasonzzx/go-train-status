import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        go: {
          green: '#00853F',
          dark: '#003B27',
          light: '#E8F5EE',
          accent: '#F5A623',
        },
      },
    },
  },
  plugins: [],
};

export default config;
