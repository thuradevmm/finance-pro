SELECT
  id AS user_id,
  COALESCE(
    (
      SELECT
        sum(vab.current_balance) AS sum
      FROM
        v_account_balances vab
      WHERE
        (vab.user_id = up.id)
    ),
    (0) :: numeric
  ) AS total_balance,
  COALESCE(
    (
      SELECT
        sum(t.amount) AS sum
      FROM
        transactions t
      WHERE
        (
          (t.user_id = up.id)
          AND (t.type = 'income' :: text)
          AND (t.status = 'posted' :: text)
          AND (t.deleted_at IS NULL)
          AND (
            t.transaction_date >= date_trunc(
              'month' :: text,
              (CURRENT_DATE) :: timestamp WITH time zone
            )
          )
          AND (
            t.transaction_date < (
              date_trunc(
                'month' :: text,
                (CURRENT_DATE) :: timestamp WITH time zone
              ) + '1 mon' :: INTERVAL
            )
          )
        )
    ),
    (0) :: numeric
  ) AS current_month_income,
  COALESCE(
    (
      SELECT
        sum(t.amount) AS sum
      FROM
        transactions t
      WHERE
        (
          (t.user_id = up.id)
          AND (t.type = 'expense' :: text)
          AND (t.status = 'posted' :: text)
          AND (t.deleted_at IS NULL)
          AND (
            t.transaction_date >= date_trunc(
              'month' :: text,
              (CURRENT_DATE) :: timestamp WITH time zone
            )
          )
          AND (
            t.transaction_date < (
              date_trunc(
                'month' :: text,
                (CURRENT_DATE) :: timestamp WITH time zone
              ) + '1 mon' :: INTERVAL
            )
          )
        )
    ),
    (0) :: numeric
  ) AS current_month_expense,
  COALESCE(
    (
      SELECT
        count(*) AS count
      FROM
        transactions t
      WHERE
        (
          (t.user_id = up.id)
          AND (t.deleted_at IS NULL)
        )
    ),
    (0) :: bigint
  ) AS transaction_count,
  COALESCE(
    (
      SELECT
        count(*) AS count
      FROM
        debts d
      WHERE
        (
          (d.user_id = up.id)
          AND (d.status = 'active' :: text)
          AND (d.deleted_at IS NULL)
        )
    ),
    (0) :: bigint
  ) AS active_debt_count,
  COALESCE(
    (
      SELECT
        count(*) AS count
      FROM
        savings_goals sg
      WHERE
        (
          (sg.user_id = up.id)
          AND (sg.status = 'active' :: text)
          AND (sg.deleted_at IS NULL)
        )
    ),
    (0) :: bigint
  ) AS active_savings_goal_count,
  COALESCE(
    (
      SELECT
        count(*) AS count
      FROM
        subscriptions s
      WHERE
        (
          (s.user_id = up.id)
          AND (s.status = 'active' :: text)
          AND (s.deleted_at IS NULL)
        )
    ),
    (0) :: bigint
  ) AS active_subscription_count
FROM
  user_profiles up
WHERE
  (deleted_at IS NULL);