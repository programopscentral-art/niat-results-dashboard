-- Track each spreadsheet's last-seen Drive modifiedTime so the cron can skip
-- unchanged files instead of re-reading them every minute.
alter table semesters add column if not exists last_modified_seen timestamptz;

-- Let the auto-discovery cron store the human title it parsed (nice for ops UI).
alter table semesters add column if not exists source_title text;
