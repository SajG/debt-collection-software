-- Ensure the payment-proofs Storage bucket exists so mobile clients
-- (which use the anon JWT and cannot createBucket) never hit a
-- "bucket not found" error on their first upload.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false,
  10485760, -- 10 MB
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic'
  ]
)
ON CONFLICT (id) DO NOTHING;
