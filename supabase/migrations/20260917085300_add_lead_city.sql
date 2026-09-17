/*
  # Add city to leads

  The lead table shows city alongside name and phone, and the search box matches
  on it, so it needs somewhere to live.

  1. Change
     - `leads.city` (text, nullable): the lead's city as it appeared in the CSV.

  Notes:
    - Nullable and unmapped by default: city is an optional CSV column, so
      existing rows and files without it stay valid.
    - Not indexed. Search filters the already-loaded upload in the browser
      rather than querying by city, so an index would cost writes for nothing.
    - Not a model feature. It is legitimately known before the outcome, but
      one-hot encoding arbitrary free-text cities would overfit; see ml.ts.
*/

ALTER TABLE leads ADD COLUMN IF NOT EXISTS city text;
