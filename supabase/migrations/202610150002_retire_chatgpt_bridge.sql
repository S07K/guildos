-- The Codex app-server bridge has been removed. Its encrypted per-workspace
-- credentials cannot be used by the OAuth service and must be reconnected.
drop table if exists public.studio_chatgpt_sessions;
