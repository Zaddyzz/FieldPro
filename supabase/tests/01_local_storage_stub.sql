create or replace function public.can_access_job_object(p_name text) returns boolean language sql stable as $$ select false $$;
