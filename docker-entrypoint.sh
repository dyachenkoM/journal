#!/bin/sh
set -e

echo "Applying migrations"
alembic upgrade head

exec "$@"
