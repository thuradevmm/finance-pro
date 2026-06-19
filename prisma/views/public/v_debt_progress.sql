SELECT
  d.id AS debt_id,
  d.user_id,
  d.name,
  d.lender_name,
  d.total_amount,
  d.initial_paid_amount,
  (
    d.initial_paid_amount + COALESCE(sum(dp.amount), (0) :: numeric)
  ) AS paid_amount,
  (
    (d.total_amount - d.initial_paid_amount) - COALESCE(sum(dp.amount), (0) :: numeric)
  ) AS remaining_amount,
  CASE
    WHEN (d.total_amount = (0) :: numeric) THEN (0) :: numeric
    ELSE round(
      (
        (
          (
            d.initial_paid_amount + COALESCE(sum(dp.amount), (0) :: numeric)
          ) / d.total_amount
        ) * (100) :: numeric
      ),
      2
    )
  END AS progress_percentage,
  d.start_date,
  d.due_date,
  d.repayment_amount,
  d.repayment_cycle,
  d.status,
  d.created_at,
  d.updated_at
FROM
  (
    debts d
    LEFT JOIN debt_payments dp ON ((dp.debt_id = d.id))
  )
WHERE
  (d.deleted_at IS NULL)
GROUP BY
  d.id,
  d.user_id,
  d.name,
  d.lender_name,
  d.total_amount,
  d.initial_paid_amount,
  d.start_date,
  d.due_date,
  d.repayment_amount,
  d.repayment_cycle,
  d.status,
  d.created_at,
  d.updated_at;