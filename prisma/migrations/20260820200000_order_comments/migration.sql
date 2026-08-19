-- OrderComment: a lightweight, append-only thread per order.
--
-- No edit/delete verbs anywhere in application code; RLS mirrors the
-- OrderDocument policies exactly so nobody can even see comments on
-- orders they aren't party to. INSERT trigger dispatches to the notify
-- edge function so the counterparty gets pushed.

CREATE TABLE "OrderComment" (
  "id"           TEXT PRIMARY KEY,
  "salesOrderId" TEXT NOT NULL REFERENCES "SalesOrder"("id") ON DELETE CASCADE,
  "authorId"     UUID NOT NULL REFERENCES "Profile"("id") ON DELETE RESTRICT,
  "body"         TEXT NOT NULL,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "OrderComment_body_nonempty"
    CHECK (length(btrim("body")) > 0 AND length("body") <= 4000)
);

CREATE INDEX "OrderComment_salesOrderId_createdAt_idx"
  ON "OrderComment" ("salesOrderId", "createdAt");
CREATE INDEX "OrderComment_authorId_idx" ON "OrderComment" ("authorId");

ALTER TABLE "OrderComment" ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────
-- RLS — mirrors OrderDocument exactly:
--   STAFF   read/write on orders where salespersonId = auth.uid()
--   FACTORY read/write on all
--   ADMIN   read/write on all
-- No UPDATE / DELETE for any authenticated role. Append-only.
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS order_comment_select_staff   ON "OrderComment";
DROP POLICY IF EXISTS order_comment_select_factory ON "OrderComment";
DROP POLICY IF EXISTS order_comment_select_admin   ON "OrderComment";
DROP POLICY IF EXISTS order_comment_insert_staff   ON "OrderComment";
DROP POLICY IF EXISTS order_comment_insert_factory ON "OrderComment";
DROP POLICY IF EXISTS order_comment_insert_admin   ON "OrderComment";

CREATE POLICY order_comment_select_staff ON "OrderComment"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'STAFF'
    AND EXISTS (
      SELECT 1 FROM "SalesOrder" so
      WHERE so.id = "OrderComment"."salesOrderId"
        AND so."salespersonId" = auth.uid()
    )
  );

CREATE POLICY order_comment_select_factory ON "OrderComment"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'FACTORY');

CREATE POLICY order_comment_select_admin ON "OrderComment"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'ADMIN');

CREATE POLICY order_comment_insert_staff ON "OrderComment"
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'STAFF'
    AND "authorId" = auth.uid()
    AND EXISTS (
      SELECT 1 FROM "SalesOrder" so
      WHERE so.id = "OrderComment"."salesOrderId"
        AND so."salespersonId" = auth.uid()
    )
  );

CREATE POLICY order_comment_insert_factory ON "OrderComment"
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'FACTORY'
    AND "authorId" = auth.uid()
  );

CREATE POLICY order_comment_insert_admin ON "OrderComment"
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'ADMIN'
    AND "authorId" = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────
-- Notification prefs on Profile for the new event type. Default ON.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "Profile"
  ADD COLUMN IF NOT EXISTS "notifyComments" BOOLEAN NOT NULL DEFAULT true;

-- ─────────────────────────────────────────────────────────────────
-- Trigger: dispatch a `comment_added` event to the notify edge fn.
-- The edge function decides the recipient by inspecting the author's
-- role vs. the order's salesperson — see notify/index.ts.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._notify_on_order_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order "SalesOrder"%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM "SalesOrder" WHERE id = NEW."salesOrderId";
  IF v_order.id IS NULL THEN RETURN NEW; END IF;

  PERFORM public._dispatch_notification(jsonb_build_object(
    'event',         'comment_added',
    'salesOrderId',  v_order.id,
    'orderNumber',   v_order."orderNumber",
    'salespersonId', v_order."salespersonId",
    'authorId',      NEW."authorId",
    'preview',       left(NEW.body, 140)
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_order_comment ON "OrderComment";
CREATE TRIGGER trg_notify_order_comment
  AFTER INSERT ON "OrderComment"
  FOR EACH ROW
  EXECUTE FUNCTION public._notify_on_order_comment();
