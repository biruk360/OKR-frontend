/**
 * Odoo sales sync — pure, client-safe rules (pace, credit, standing, payload,
 * OKR item ranking). Server code lives in the `*.server.ts` files and ./odoo.ts
 * and is imported by direct path.
 */
export * from './pace'
export * from './deals'
export * from './standing'
export * from './okr-items'
export * from './payload'
