#!/bin/sh
set -e

# Coolify/compose bind-mounts ./uploads from the host, which is root-owned by
# default and hides the chown baked into the image at build time. Re-chown it
# here (still root) before dropping to the nextjs user for the actual process.
mkdir -p /app/uploads/resumes
chown -R nextjs:nodejs /app/uploads

echo "[app-entrypoint] DATABASE_URL host: $(echo "$DATABASE_URL" | sed -E 's#.*@([^/?]+).*#\1#')"
echo "[app-entrypoint] running prisma migrate deploy..."
npx prisma migrate deploy
echo "[app-entrypoint] migrate deploy done, starting: $*"
exec su-exec nextjs "$@"
