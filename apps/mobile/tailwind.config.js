/** Night Owl design tokens: always-on deep slate dark mode. */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        night: {
          950: '#070A10',
          900: '#0F1623',
          800: '#182235',
          700: '#24324B',
          500: '#64748B',
          300: '#A3B1C6',
          100: '#E6ECF5'
        },
        owl: { cyan: '#38BDF8' },
        delta: { pos: '#22C55E', neg: '#EF4444', warn: '#F59E0B' },
        pos: { qb: '#F43F5E', rb: '#10B981', wr: '#38BDF8', te: '#F59E0B', k: '#A78BFA', def: '#94A3B8' }
      }
    }
  },
  plugins: []
};
