-- Reporting by completion time, separately from actual recorded cash receipts.
-- Run after orders.sql; independent of optional payment/table features.
alter table public.menu_orders add column if not exists completed_at timestamptz;
alter table public.menu_orders add column if not exists payment_status text not null default 'unpaid';
alter table public.menu_orders add column if not exists payment_method text;
alter table public.menu_orders add column if not exists paid_at timestamptz;
-- Historical completion timestamps can only be approximated from updated_at.
update public.menu_orders set completed_at=updated_at where status='served' and completed_at is null;
create index if not exists menu_orders_completed_report on public.menu_orders(restaurant_id,completed_at) where status='served';
create index if not exists menu_orders_paid_report on public.menu_orders(restaurant_id,paid_at) where payment_status='paid';
create or replace function public.capture_order_completion()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='served' and old.status is distinct from 'served' then new.completed_at=now(); end if;
 return new;
end;
$$;
revoke all on function public.capture_order_completion() from public,anon,authenticated;
drop trigger if exists capture_order_completion on public.menu_orders;
create trigger capture_order_completion before update of status on public.menu_orders
for each row execute function public.capture_order_completion();

create or replace function public.get_revenue_report(report_kind text, chosen_date date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare shop uuid; local_start timestamp; local_end timestamp; from_time timestamptz; to_time timestamptz; unit text; step interval; result jsonb;
begin
 if auth.uid() is null then raise exception 'Vui lòng đăng nhập'; end if;
 select id into shop from public.restaurants where owner_id=auth.uid();
 if shop is null then raise exception 'Hãy lưu thông tin quán trước'; end if;
 if report_kind is null or report_kind not in ('day','month','year') or chosen_date is null or extract(year from chosen_date) not between 2000 and 2200 then raise exception 'Kỳ báo cáo không hợp lệ'; end if;
 if report_kind='day' then local_start:=chosen_date::timestamp;local_end:=local_start+interval '1 day';unit:='hour';step:=interval '1 hour';
 elsif report_kind='month' then local_start:=date_trunc('month',chosen_date::timestamp);local_end:=local_start+interval '1 month';unit:='day';step:=interval '1 day';
 else local_start:=date_trunc('year',chosen_date::timestamp);local_end:=local_start+interval '1 year';unit:='month';step:=interval '1 month';end if;
 from_time:=local_start at time zone 'Asia/Ho_Chi_Minh';to_time:=local_end at time zone 'Asia/Ho_Chi_Minh';
 with completed as (
  select * from public.menu_orders where restaurant_id=shop and status='served' and completed_at>=from_time and completed_at<to_time
 ), paid as (
  select * from public.menu_orders where restaurant_id=shop and payment_status='paid' and payment_method='cash' and paid_at>=from_time and paid_at<to_time
 ), completed_buckets as (
  select date_trunc(unit,completed_at at time zone 'Asia/Ho_Chi_Minh') slot,count(*) cnt,sum(total) amount from completed group by 1
 ), paid_buckets as (
  select date_trunc(unit,paid_at at time zone 'Asia/Ho_Chi_Minh') slot,sum(total) amount from paid group by 1
 ), slots as (
  select generate_series(local_start,local_end-step,step) slot
 ), pending as (
  select total from public.menu_orders where restaurant_id=shop and status in ('new','accepted','preparing') and created_at>=from_time and created_at<to_time
 ), rejected as (
  select id from public.menu_orders where restaurant_id=shop and status='rejected' and created_at>=from_time and created_at<to_time
 )
 select jsonb_build_object(
  'kind',report_kind,'start',local_start::date,'end_exclusive',local_end::date,'timezone','Asia/Ho_Chi_Minh',
  'completed_total',(select coalesce(sum(total),0) from completed),
  'completed_count',(select count(*) from completed),
  'average_order',(select coalesce(round(avg(total)),0) from completed),
  'cash_total',(select coalesce(sum(total),0) from paid),
  'cash_count',(select count(*) from paid),
  'pending_total',(select coalesce(sum(total),0) from pending),'pending_count',(select count(*) from pending),
  'rejected_count',(select count(*) from rejected),
  'buckets',(select jsonb_agg(jsonb_build_object('period',s.slot,'label',case when report_kind='day' then to_char(s.slot,'HH24:MI') when report_kind='month' then to_char(s.slot,'DD/MM') else to_char(s.slot,'MM/YYYY') end,'completed_total',coalesce(c.amount,0),'completed_count',coalesce(c.cnt,0),'cash_total',coalesce(p.amount,0)) order by s.slot) from slots s left join completed_buckets c using(slot) left join paid_buckets p using(slot))
 ) into result;
 return result;
end;
$$;
revoke all on function public.get_revenue_report(text,date) from public,anon;
grant execute on function public.get_revenue_report(text,date) to authenticated;
