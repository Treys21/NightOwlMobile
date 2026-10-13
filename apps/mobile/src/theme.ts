import type { TextStyle } from 'react-native';

// Design tokens for code that can't use classNames (icons, charts, native props).
export const colors = {
  night950: '#070A10',
  night900: '#0F1623',
  night800: '#182235',
  night700: '#24324B',
  night500: '#64748B',
  night300: '#A3B1C6',
  night100: '#E6ECF5',
  cyan: '#38BDF8',
  pos: '#22C55E',
  neg: '#EF4444',
  warn: '#F59E0B',
  position: { QB: '#F43F5E', RB: '#10B981', WR: '#38BDF8', TE: '#F59E0B', K: '#A78BFA', DEF: '#94A3B8', DL: '#FB923C', LB: '#FB923C', DB: '#FB923C' } as Record<string, string>
} as const;

export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };
