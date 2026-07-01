
-- call_runs.scenario: enum -> text
ALTER TABLE public.call_runs
  ALTER COLUMN scenario TYPE text USING scenario::text;

-- scripts: vertical + rekey uniqueness
ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS vertical text NOT NULL DEFAULT 'general';

ALTER TABLE public.scripts
  DROP CONSTRAINT IF EXISTS scripts_org_id_name_version_key;

ALTER TABLE public.scripts
  ADD CONSTRAINT scripts_org_id_vertical_name_version_key
  UNIQUE (org_id, vertical, name, version);

-- events: gap-alert detail + stage
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS detail text,
  ADD COLUMN IF NOT EXISTS section_type text;

-- call_runs: disposition + end context
ALTER TABLE public.call_runs
  ADD COLUMN IF NOT EXISTS disposition text,
  ADD COLUMN IF NOT EXISTS ended_on_step_id text,
  ADD COLUMN IF NOT EXISTS killed_by_objection_id text;

-- Rewrite policies with a superadmin short-circuit.

-- orgs
DROP POLICY IF EXISTS "members read own org" ON public.orgs;
CREATE POLICY "members read own org" ON public.orgs
  FOR SELECT USING (
    public.has_role(auth.uid(), 'superadmin') OR id = public.current_org()
  );

DROP POLICY IF EXISTS "admins update own org" ON public.orgs;
CREATE POLICY "admins update own org" ON public.orgs
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'superadmin')
    OR (id = public.current_org() AND public.has_role(auth.uid(), 'admin'))
  );

-- profiles
DROP POLICY IF EXISTS "read same-org profiles" ON public.profiles;
CREATE POLICY "read same-org profiles" ON public.profiles
  FOR SELECT USING (
    public.has_role(auth.uid(), 'superadmin')
    OR org_id = public.current_org()
    OR id = auth.uid()
  );

DROP POLICY IF EXISTS "insert own profile" ON public.profiles;
CREATE POLICY "insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(), 'superadmin') OR id = auth.uid()
  );

DROP POLICY IF EXISTS "update own profile" ON public.profiles;
CREATE POLICY "update own profile" ON public.profiles
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'superadmin') OR id = auth.uid()
  ) WITH CHECK (
    public.has_role(auth.uid(), 'superadmin') OR id = auth.uid()
  );

-- user_roles
DROP POLICY IF EXISTS "read own roles or same-org" ON public.user_roles;
CREATE POLICY "read own roles or same-org" ON public.user_roles
  FOR SELECT USING (
    public.has_role(auth.uid(), 'superadmin')
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_roles.user_id AND p.org_id = public.current_org()
    )
  );

-- scripts
DROP POLICY IF EXISTS "read same-org scripts" ON public.scripts;
CREATE POLICY "read same-org scripts" ON public.scripts
  FOR SELECT USING (
    public.has_role(auth.uid(), 'superadmin') OR org_id = public.current_org()
  );

DROP POLICY IF EXISTS "admins insert scripts" ON public.scripts;
CREATE POLICY "admins insert scripts" ON public.scripts
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(), 'superadmin')
    OR (org_id = public.current_org() AND public.has_role(auth.uid(), 'admin'))
  );

DROP POLICY IF EXISTS "admins update scripts" ON public.scripts;
CREATE POLICY "admins update scripts" ON public.scripts
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'superadmin')
    OR (org_id = public.current_org() AND public.has_role(auth.uid(), 'admin'))
  ) WITH CHECK (
    public.has_role(auth.uid(), 'superadmin')
    OR (org_id = public.current_org() AND public.has_role(auth.uid(), 'admin'))
  );

DROP POLICY IF EXISTS "admins delete scripts" ON public.scripts;
CREATE POLICY "admins delete scripts" ON public.scripts
  FOR DELETE USING (
    public.has_role(auth.uid(), 'superadmin')
    OR (org_id = public.current_org() AND public.has_role(auth.uid(), 'admin'))
  );

-- call_runs
DROP POLICY IF EXISTS "read same-org runs" ON public.call_runs;
CREATE POLICY "read same-org runs" ON public.call_runs
  FOR SELECT USING (
    public.has_role(auth.uid(), 'superadmin') OR org_id = public.current_org()
  );

DROP POLICY IF EXISTS "caller inserts own run" ON public.call_runs;
CREATE POLICY "caller inserts own run" ON public.call_runs
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(), 'superadmin')
    OR (org_id = public.current_org() AND caller_id = auth.uid())
  );

DROP POLICY IF EXISTS "caller updates own run" ON public.call_runs;
CREATE POLICY "caller updates own run" ON public.call_runs
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'superadmin') OR caller_id = auth.uid()
  ) WITH CHECK (
    public.has_role(auth.uid(), 'superadmin') OR caller_id = auth.uid()
  );

-- events
DROP POLICY IF EXISTS "read same-org events" ON public.events;
CREATE POLICY "read same-org events" ON public.events
  FOR SELECT USING (
    public.has_role(auth.uid(), 'superadmin') OR org_id = public.current_org()
  );

DROP POLICY IF EXISTS "insert event for own active run" ON public.events;
CREATE POLICY "insert event for own active run" ON public.events
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(), 'superadmin')
    OR (
      org_id = public.current_org()
      AND EXISTS (
        SELECT 1 FROM public.call_runs r
        WHERE r.id = events.run_id AND r.caller_id = auth.uid()
      )
    )
  );
