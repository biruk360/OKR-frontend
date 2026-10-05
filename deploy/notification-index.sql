-- Run with psql outside a transaction. Reads and writes continue while building.
-- Prisma schema declares the same index so subsequent db push preserves it.
SET lock_timeout = '5s';
SET statement_timeout = '120s';
CREATE INDEX CONCURRENTLY IF NOT EXISTS "notifications_userId_createdAt_idx"
    ON public.notifications ("userId", "createdAt");
