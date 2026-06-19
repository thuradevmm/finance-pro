SELECT
  sg.id AS savings_goal_id,
  sg.user_id,
  sg.name,
  sg.target_amount,
  sg.initial_saved_amount,
  (
    sg.initial_saved_amount + COALESCE(
      sum(
        CASE
          WHEN (sge.type = 'contribution' :: text) THEN sge.amount
          WHEN (sge.type = 'withdrawal' :: text) THEN (- sge.amount)
          WHEN (sge.type = 'adjustment' :: text) THEN sge.amount
          ELSE (0) :: numeric
        END
      ),
      (0) :: numeric
    )
  ) AS saved_amount,
  (
    sg.target_amount - (
      sg.initial_saved_amount + COALESCE(
        sum(
          CASE
            WHEN (sge.type = 'contribution' :: text) THEN sge.amount
            WHEN (sge.type = 'withdrawal' :: text) THEN (- sge.amount)
            WHEN (sge.type = 'adjustment' :: text) THEN sge.amount
            ELSE (0) :: numeric
          END
        ),
        (0) :: numeric
      )
    )
  ) AS remaining_amount,
  CASE
    WHEN (sg.target_amount = (0) :: numeric) THEN (0) :: numeric
    ELSE round(
      (
        (
          (
            sg.initial_saved_amount + COALESCE(
              sum(
                CASE
                  WHEN (sge.type = 'contribution' :: text) THEN sge.amount
                  WHEN (sge.type = 'withdrawal' :: text) THEN (- sge.amount)
                  WHEN (sge.type = 'adjustment' :: text) THEN sge.amount
                  ELSE (0) :: numeric
                END
              ),
              (0) :: numeric
            )
          ) / sg.target_amount
        ) * (100) :: numeric
      ),
      2
    )
  END AS progress_percentage,
  sg.target_date,
  sg.status,
  sg.created_at,
  sg.updated_at
FROM
  (
    savings_goals sg
    LEFT JOIN savings_goal_entries sge ON ((sge.savings_goal_id = sg.id))
  )
WHERE
  (sg.deleted_at IS NULL)
GROUP BY
  sg.id,
  sg.user_id,
  sg.name,
  sg.target_amount,
  sg.initial_saved_amount,
  sg.target_date,
  sg.status,
  sg.created_at,
  sg.updated_at;