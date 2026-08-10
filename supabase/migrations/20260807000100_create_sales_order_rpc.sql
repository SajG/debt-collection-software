-- Atomic mobile order-creation RPC. Mobile clients call this instead of
-- inserting into SalesOrder directly so that:
--   1. the fiscal-year sequence in BusinessSettings stays consistent
--      with the web app's generateOrderNumber() (single source of truth);
--   2. the initial OrderStatusEvent lands in the same transaction as
--      the SalesOrder row — no split-brain "order without a timeline";
--   3. offline-drained submissions can retry safely (idempotent per
--      call, atomic).
--
-- Apply after 20260807000000_add_rls_policies.sql:
--   psql "$DIRECT_URL" -f supabase/migrations/20260807000100_create_sales_order_rpc.sql

create or replace function public.create_sales_order(
  p_party_id text,
  p_product_id text,
  p_brand text,
  p_quantity numeric,
  p_quantity_unit text,
  p_packing_type text,
  p_size_kg text,
  p_product_rate text,
  p_payment_term text,
  p_transport_type text,
  p_expected_delivery_date date,
  p_token_type text,
  p_notes text
)
returns table (id text, "orderNumber" text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings_id     text;
  v_seq             int;
  v_seq_year        int;
  v_fy_start        int;
  v_order_number    text;
  v_salesperson     uuid := auth.uid();
  v_new_id          text;
  v_event_id        text;
  v_role            text := public.current_user_role();
  v_now             timestamptz := now();
begin
  if v_salesperson is null then
    raise exception 'not authenticated';
  end if;
  if v_role is null or v_role not in ('STAFF', 'ADMIN') then
    raise exception 'role % is not allowed to create orders', v_role;
  end if;

  -- Indian fiscal year: Apr–Mar. Everything in Apr 2027+ is FY 27-28.
  select case
           when extract(month from v_now)::int >= 4
             then extract(year from v_now)::int
           else extract(year from v_now)::int - 1
         end
    into v_fy_start;

  -- Lock the BusinessSettings row for the seq bump. Single-tenant deploy,
  -- so this is one row; FOR UPDATE serialises concurrent RPC calls.
  select id, "orderSeq", "orderSeqYear"
    into v_settings_id, v_seq, v_seq_year
    from "BusinessSettings"
    for update
    limit 1;

  if v_settings_id is null then
    raise exception 'BusinessSettings row missing';
  end if;

  if v_seq_year = v_fy_start then
    v_seq := v_seq + 1;
  else
    v_seq := 1;
  end if;

  update "BusinessSettings"
     set "orderSeq" = v_seq,
         "orderSeqYear" = v_fy_start
   where id = v_settings_id;

  v_order_number := 'SB/'
    || lpad((v_fy_start % 100)::text, 2, '0')
    || '-'
    || lpad(((v_fy_start + 1) % 100)::text, 2, '0')
    || '/'
    || lpad(v_seq::text, 4, '0');

  -- Non-cuid but unique — SalesOrder.id is a plain String at the Prisma
  -- level, so any unique text works. Prefix keeps rows scannable.
  v_new_id   := 'so_'  || substr(md5(random()::text || clock_timestamp()::text), 1, 24);
  v_event_id := 'ose_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24);

  insert into "SalesOrder" (
    id, "orderNumber", "partyId", "salespersonId", "productId", brand,
    quantity, "quantityUnit", "packingType", "sizeKg", "productRate",
    "paymentTerm", "transportType", "expectedDeliveryDate", "tokenType",
    notes, "currentStatus", "createdAt", "updatedAt"
  ) values (
    v_new_id, v_order_number, p_party_id, v_salesperson, p_product_id, p_brand,
    p_quantity, p_quantity_unit::"QuantityUnit", p_packing_type, p_size_kg, p_product_rate,
    p_payment_term::"PaymentTerm", p_transport_type::"TransportType",
    p_expected_delivery_date, p_token_type, p_notes, 'ORDER_PLACED',
    v_now, v_now
  );

  insert into "OrderStatusEvent" (
    id, "salesOrderId", status, notes, "updatedById", "createdAt"
  ) values (
    v_event_id, v_new_id, 'ORDER_PLACED', 'Order booked from mobile.',
    v_salesperson, v_now
  );

  return query select v_new_id, v_order_number;
end;
$$;

grant execute on function public.create_sales_order(
  text, text, text, numeric, text, text, text, text, text, text, date, text, text
) to authenticated;
