/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0f172a',
        card: '#1e293b',
        line: '#334155',
        ink: '#f8fafc',
        mut: '#94a3b8',
        gold: '#f59e0b',
        goldbg: 'rgba(245, 158, 11, 0.15)',
        ok: '#10b981',
        okbg: 'rgba(16, 185, 129, 0.15)',
        bad: '#ef4444',
        badbg: 'rgba(239, 68, 68, 0.15)',
        warn: '#eab308',
        warnbg: 'rgba(234, 179, 8, 0.15)'
      }
    },
  },
  plugins: [],
}
