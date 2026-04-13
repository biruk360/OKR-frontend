// shared/utils/index.ts
export * from './formatters';
export * from './validators';
export * from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// shared/utils/formatters.ts (scaffold)
// ─────────────────────────────────────────────────────────────────────────────
// Never inline format logic in components. Add all format functions here.
//
// export const formatCurrency = (amount: number, currency = 'USD'): string =>
//   new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
//
// export const formatDate = (date: Date | string, format = 'short'): string =>
//   new Intl.DateTimeFormat('en-US', { dateStyle: format as any }).format(new Date(date));
//
// export const formatPhone = (phone: string): string =>
//   phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
//
// export const formatNumber = (n: number, decimals = 0): string =>
//   new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals }).format(n);

// ─────────────────────────────────────────────────────────────────────────────
// shared/utils/constants.ts (scaffold)
// ─────────────────────────────────────────────────────────────────────────────
// export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'App';
// export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
// export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0';
