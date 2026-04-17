-- Widen watcher_cursors.cursor_block from int4 to int8.
--
-- Root cause: TON's transaction cursor is the logical time (lt), a uint64
-- that already sits at ~6.4e13 on mainnet (2026-04). int4 max is 2.1e9,
-- so every cursor save for the TON watcher failed with "integer out of
-- range", silently leaving the watcher stateless and at risk of
-- reprocessing the same payment events on restart.
--
-- Safe in-place widening: Postgres promotes existing int4 values to int8
-- without rewriting row tuples when the column is non-indexed (this one
-- is indexed as PK, which does rewrite, but the table is tiny —
-- one row per watcher).

ALTER TABLE "watcher_cursors" ALTER COLUMN "cursor_block" SET DATA TYPE bigint;
