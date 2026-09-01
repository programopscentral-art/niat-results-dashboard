-- ============================================================================
-- Realtime — stream live changes to subscribed dashboards.
-- The web client subscribes per-college, so fan-out stays small at 2k users.
-- RLS above still applies to realtime, so staff only receive their own rows.
-- ============================================================================

alter publication supabase_realtime add table results;
alter publication supabase_realtime add table result_summaries;
alter publication supabase_realtime add table students;
alter publication supabase_realtime add table sync_runs;

-- REPLICA IDENTITY FULL so UPDATE/DELETE payloads include old values
-- (needed for the client to match & remove/replace the right row).
alter table results          replica identity full;
alter table result_summaries replica identity full;
alter table students         replica identity full;
