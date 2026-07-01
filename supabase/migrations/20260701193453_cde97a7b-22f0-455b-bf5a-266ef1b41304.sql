ALTER TABLE public.events ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS events_gap_inbox_idx
  ON public.events (org_id, created_at DESC)
  WHERE type IN ('not_accounted_for', 'off_script');

DROP POLICY IF EXISTS "admin update events reviewed" ON public.events;
CREATE POLICY "admin update events reviewed"
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
    OR (org_id = public.current_org() AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'superadmin')
    ))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin')
    OR (org_id = public.current_org() AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'superadmin')
    ))
  );