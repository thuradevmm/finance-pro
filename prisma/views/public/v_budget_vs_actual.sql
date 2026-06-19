SELECT
  bp.id AS budget_plan_id,
  bp.user_id,
  bp.name AS budget_name,
  bp.plan_type,
  bp.period_type,
  bp.start_date,
  bp.end_date,
  bp.status AS budget_plan_status,
  bi.id AS budget_item_id,
  bi.category_id,
  c.name AS category_name,
  bi.type,
  bi.planned_amount,
  COALESCE(sum(t.amount), (0) :: numeric) AS actual_amount,
  (
    bi.planned_amount - COALESCE(sum(t.amount), (0) :: numeric)
  ) AS remaining_amount,
  CASE
    WHEN (bi.planned_amount = (0) :: numeric) THEN (0) :: numeric
    ELSE round(
      (
        (
          COALESCE(sum(t.amount), (0) :: numeric) / bi.planned_amount
        ) * (100) :: numeric
      ),
      2
    )
  END AS usage_percentage,
  CASE
    WHEN (
      COALESCE(sum(t.amount), (0) :: numeric) > bi.planned_amount
    ) THEN 'over_budget' :: text
    ELSE 'under_budget' :: text
  END AS budget_status,
  bp.created_at,
  bp.updated_at
FROM
  (
    (
      (
        budget_plans bp
        JOIN budget_items bi ON ((bi.budget_plan_id = bp.id))
      )
      LEFT JOIN categories c ON ((c.id = bi.category_id))
    )
    LEFT JOIN transactions t ON (
      (
        (t.user_id = bp.user_id)
        AND (t.category_id = bi.category_id)
        AND (t.type = bi.type)
        AND (t.status = 'posted' :: text)
        AND (t.deleted_at IS NULL)
        AND (
          (t.transaction_date >= bp.start_date)
          AND (t.transaction_date <= bp.end_date)
        )
      )
    )
  )
WHERE
  (bp.deleted_at IS NULL)
GROUP BY
  bp.id,
  bp.user_id,
  bp.name,
  bp.plan_type,
  bp.period_type,
  bp.start_date,
  bp.end_date,
  bp.status,
  bi.id,
  bi.category_id,
  c.name,
  bi.type,
  bi.planned_amount,
  bp.created_at,
  bp.updated_at;