-- Move connections using either the original paid default or the generic free
-- router to a specific free model. Workspace keys remain encrypted and unchanged.
alter table public.studio_openrouter_keys
 alter column model set default 'nvidia/nemotron-3-super-120b-a12b:free';
update public.studio_openrouter_keys
 set model='nvidia/nemotron-3-super-120b-a12b:free',updated_at=now()
 where model in ('openai/gpt-4.1-mini','openrouter/free');
