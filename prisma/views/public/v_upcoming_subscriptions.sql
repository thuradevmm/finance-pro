SELECT
  s.id AS subscription_id,
  s.user_id,
  s.name,
  s.amount,
  s.billing_cycle,
  s.next_billing_date,
  s.status,
  a.name AS account_name,
  c.name AS category_name,
  s.created_at,
  s.updated_at
FROM
  (
    (
      subscriptions s
      LEFT JOIN accounts a ON ((a.id = s.account_id))
    )
    LEFT JOIN categories c ON ((c.id = s.category_id))
  )
WHERE
  (
    (s.deleted_at IS NULL)
    AND (s.status = 'active' :: text)
    AND (s.next_billing_date IS NOT NULL)
  );