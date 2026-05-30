-- Verify pgvector extension is installed.
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';

-- Verify the vector type exists.
SELECT oid::regtype::text AS type_name
FROM pg_type
WHERE typname = 'vector';

