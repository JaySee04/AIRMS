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

# --single-transaction takes a consistent snapshot WITHOUT locking the tables,
# so a nightly backup cannot block a clinician mid-screening. It relies on
# InnoDB, which is what every AIRMS table uses.
# --routines/--triggers/--events so a restore is complete rather than nearly.
mysqldump \
  --single-transaction \
  --routines --triggers --events \
  --default-character-set=utf8mb4 \
  "$DB" | gzip -9 > "$OUT.part"

# Only name it as a backup once it is whole. A half-written file with the right
# name is worse than no file: it is the one you reach for in an emergency.
gzip -t "$OUT.part"
mv "$OUT.part" "$OUT"
chmod 640 "$OUT"

# Rotate. -mtime +N is "older than N days".
find "$DEST" -name 'airms-*.sql.gz' -type f -mtime "+$KEEP" -delete

SIZE="$(du -h "$OUT" | cut -f1)"
echo "airms backup ok: $OUT ($SIZE), keeping $KEEP days"

# A dump that is suspiciously small is the failure this catches: an empty or
# near-empty file still gzips cleanly and still passes `gzip -t`.
BYTES="$(stat -c %s "$OUT")"
if [ "$BYTES" -lt 10240 ]; then
  echo "WARNING: backup is only $BYTES bytes — check the credentials and the database name" >&2
  exit 1
fi
