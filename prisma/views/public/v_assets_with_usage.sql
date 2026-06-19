SELECT
  id AS asset_id,
  user_id,
  name,
  asset_category,
  purchase_date,
  purchase_amount,
  STATUS,
  description,
  CASE
    WHEN (purchase_date IS NULL) THEN NULL :: integer
    ELSE (CURRENT_DATE - purchase_date)
  END AS used_days,
  created_at,
  updated_at
FROM
  assets a
WHERE
  (deleted_at IS NULL);