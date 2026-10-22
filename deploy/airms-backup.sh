#!/bin/sh
# Nightly database backup for AIRMS. Driven by airms-backup.timer.
#
#   sudo install -m 755 deploy/airms-backup.sh /usr/local/bin/airms-backup
#   sudo install -d -o airms -g airms -m 750 /var/backups/airms
#
# WHY THIS SHIPS. DEPLOY_ISN.md's gap list said "Backups are not covered.
# `GET /api/export/backup.xlsx` exports data for an administrator; it is not a
# database backup strategy." That remains true — the Excel export is a readable
# snapshot for a person, not something you can restore a server from, and since
# §149 it is also a controlled artifact holding every IC and the full read-trail.
#
# This is the actual thing: a consistent dump, compressed, rotated, verified.
# THE POLICY IS STILL ISN'S — where the copies live, how long they are kept, and
# whether an off-box copy is required are their decisions, and an on-box backup
# alone does not survive the event most backups exist for.

set -eu

DB="${MYSQL_DATABASE:-airms}"
DEST="${AIRMS_BACKUP_DIR:-/var/backups/airms}"
KEEP="${AIRMS_BACKUP_KEEP_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$DEST/airms-$STAMP.sql.gz"

[ -d "$DEST" ] || { echo "backup dir $DEST does not exist" >&2; exit 2; }

# set -e exits at a refused mysqldump, which used to leave an empty .part
# behind every night until somebody noticed the directory filling with them.
trap 'rm -f "$OUT.sql.part" "$OUT.part"' EXIT

# The unit loads /etc/airms/api.env, so the app's own credentials are in the
# environment — but mysqldump reads none of the MYSQL_* names the app uses. It
# used to be called with no password at all: refused, while `| gzip` swallowed
# the failure and the script printed "airms backup ok" over a 20-byte file
# (measured on the ISN box, 2026-10-22). MYSQL_PWD keeps the password off the
# process list, where a -p argument would put it.
export MYSQL_PWD="${MYSQL_PASSWORD:-}"

# --single-transaction takes a consistent snapshot WITHOUT locking the tables,
# so a nightly backup cannot block a clinician mid-screening. It relies on
# InnoDB, which is what every AIRMS table uses.
# NO --events: it needs the EVENT privilege, which airms-db-user.sql
# deliberately does not grant, and AIRMS defines no scheduled events — with it,
# every dump was refused at "show events".
# Dump uncompressed FIRST and compress after: in a pipe, POSIX sh reports only
# gzip's exit status, so a failed dump compressed cleanly into a "backup".
mysqldump \
  -h "${MYSQL_HOST:-localhost}" -P "${MYSQL_PORT:-3306}" -u "${MYSQL_USER:-airms}" \
  --single-transaction \
  --routines --triggers \
  --default-character-set=utf8mb4 \
  "$DB" > "$OUT.sql.part"

# mysqldump writes this line LAST, only when it finished. It replaces a 10 KB
# size floor, which reported a correct dump of a fresh install (~4 KB
# compressed, schema only) as a failure, and so taught the operator to ignore
# the one alarm that matters.
tail -n 1 "$OUT.sql.part" | grep -q '^-- Dump completed' || {
  echo "airms backup FAILED: dump of $DB did not complete" >&2
  rm -f "$OUT.sql.part"
  exit 1
}

gzip -9 -c "$OUT.sql.part" > "$OUT.part"
rm -f "$OUT.sql.part"

# Only name it as a backup once it is whole. A half-written file with the right
# name is worse than no file: it is the one you reach for in an emergency.
gzip -t "$OUT.part"
mv "$OUT.part" "$OUT"
chmod 640 "$OUT"

# Rotate. -mtime +N is "older than N days".
find "$DEST" -name 'airms-*.sql.gz' -type f -mtime "+$KEEP" -delete

# Last, and only after every check: "ok" is printed by a backup that IS one.
SIZE="$(du -h "$OUT" | cut -f1)"
echo "airms backup ok: $OUT ($SIZE), keeping $KEEP days"
