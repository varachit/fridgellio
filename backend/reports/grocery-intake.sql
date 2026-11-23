-- Run with psql against the application schema. Counts cover completed batches.
SELECT version, source,
       CASE WHEN saved <= 3 THEN '1-3' WHEN saved <= 10 THEN '4-10' ELSE '11-40' END AS basket_size,
       count(*) AS trips, count(DISTINCT household_id) AS households,
       sum(saved) AS items_saved,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY elapsed_seconds::float / saved)::numeric, 1)
           AS median_seconds_per_item,
       sum(offered) AS offered_rows, sum(removed) AS removed_rows,
       sum(corrected) AS corrected_retained_rows, sum(saved - offered + removed) AS added_in_review
FROM grocery_batches
WHERE saved > 0
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- One observation per household. Both outcomes use fully observed two-week cohorts.
WITH first_batch AS (
    SELECT DISTINCT ON (household_id) household_id, created_at AS started, source, version
    FROM grocery_batches WHERE saved > 0
    ORDER BY household_id, created_at, request_id
), outcomes AS (
    SELECT b.*, EXISTS (
        SELECT FROM inventory_events e JOIN stock_entries s ON s.id = e.stock_id
        WHERE s.household_id = b.household_id AND e.kind = 'added'
          AND e.created_at >= b.started + interval '7 days'
          AND e.created_at < b.started + interval '14 days'
    ) AS restocked_week_two, EXISTS (
        SELECT FROM inventory_events e JOIN stock_entries s ON s.id = e.stock_id
        WHERE s.household_id = b.household_id AND e.kind = 'used' AND e.idempotency_key LIKE 'meal/%'
          AND e.created_at >= b.started AND e.created_at < b.started + interval '7 days'
    ) AS cooked_week_one
    FROM first_batch b WHERE b.started <= current_timestamp - interval '14 days'
)
SELECT date_trunc('week', started AT TIME ZONE 'UTC')::date AS cohort_week_utc, version, source,
       count(*) AS eligible_households, count(*) FILTER (WHERE cooked_week_one) AS cooked_week_one,
       count(*) FILTER (WHERE restocked_week_two) AS restocked_week_two
FROM outcomes
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;


-- An opening is eligible after 24 hours. A save also counts when its start request was lost.
SELECT version, source, count(*) AS opened_attempts,
       count(*) FILTER (WHERE saved > 0) AS saved_attempts,
       count(*) FILTER (WHERE saved = 0) AS open_without_save
FROM grocery_batches WHERE created_at <= current_timestamp - interval '24 hours'
GROUP BY 1, 2 ORDER BY 1, 2;
