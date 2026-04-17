select
  repository_full_name,
  event,
  coalesce(nullif(action, 'null'), 'none') as action,
  count(*) as event_count,
  max(received_at) as latest_event
from inbound_events
where source = 'github'
  and signature_valid = true
  and repository_full_name = any (array['openclaw/openclaw'])
  and received_at >= now() - interval '24 hours'
group by 1, 2, 3
order by latest_event desc;
