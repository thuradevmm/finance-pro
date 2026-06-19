SELECT
  p.id AS person_id,
  p.user_id,
  p.name,
  COALESCE(
    sum(
      CASE
        WHEN (
          r.type = ANY (
            ARRAY ['lent'::text, 'paid'::text, 'repayment_paid'::text]
          )
        ) THEN r.amount
        ELSE (0) :: numeric
      END
    ),
    (0) :: numeric
  ) AS total_outgoing,
  COALESCE(
    sum(
      CASE
        WHEN (
          r.type = ANY (
            ARRAY ['borrowed'::text, 'received'::text, 'repayment_received'::text]
          )
        ) THEN r.amount
        ELSE (0) :: numeric
      END
    ),
    (0) :: numeric
  ) AS total_incoming,
  COALESCE(
    sum(
      CASE
        WHEN (
          (r.status <> 'paid' :: text)
          AND (r.type = 'lent' :: text)
        ) THEN r.amount
        ELSE (0) :: numeric
      END
    ),
    (0) :: numeric
  ) AS unpaid_lent_amount,
  COALESCE(
    sum(
      CASE
        WHEN (
          (r.status <> 'paid' :: text)
          AND (r.type = 'borrowed' :: text)
        ) THEN r.amount
        ELSE (0) :: numeric
      END
    ),
    (0) :: numeric
  ) AS unpaid_borrowed_amount,
  p.created_at,
  p.updated_at
FROM
  (
    people p
    LEFT JOIN person_payment_records r ON (
      (
        (r.person_id = p.id)
        AND (r.deleted_at IS NULL)
      )
    )
  )
WHERE
  (p.deleted_at IS NULL)
GROUP BY
  p.id,
  p.user_id,
  p.name,
  p.created_at,
  p.updated_at;