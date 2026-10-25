#!/bin/sh
# airms-update — bring the live install up to the latest AIRMS-ISN, or back.
#
#   sudo airms-update              update to origin/main
#   sudo airms-update --force      rebuild and swap even if nothing new was pushed
#   sudo airms-update --rollback   put the previous version back
#
# Install:  sudo install -m 755 deploy/airms-update.sh /usr/local/bin/airms-update
#
# WHY IT BUILDS IN A COPY. The obvious script — git pull, npm ci, npm run build,
# restart, all inside /opt/airms — rewrites .next underneath the RUNNING site.
# `next start` loads chunks from disk on demand, so for the minutes a build takes
# every page asks for files that no longer exist; and if the build then FAILS,
# the site is left broken with nothing restarted. Measured on this box
# (2026-10-25): a frontend `npm ci` failed once and succeeded on re-run, which is
# exactly the half-way state an in-place update leaves live.
#
# So the new version is prepared in /opt/airms-next — fetched, installed, tested,
# built, checked against the live database — while /opt/airms keeps serving. Only
# when every step has passed are the two directories swapped and the services
# restarted, which is seconds. If the restarted site does not prove healthy AND
# prove it is the code just built, the swap is reversed automatically.
#
# The previous version is kept at /opt/airms-prev for --rollback.

set -eu

APP=/opt/airms
NEXT=/opt/airms-next
PREV=/opt/airms-prev
FAILED=/opt/airms-failed
OWNER=airms
ENVF=/etc/airms/api.env
LOCK=/run/airms-update.lock

[ "$(id -u)" -eq 0 ] || { echo "Run it with sudo:  sudo airms-update" >&2; exit 2; }

# One update at a time: two interleaved runs would swap each other's directories.
exec 9>"$LOCK"
flock -n 9 || { echo "Another airms-update is already running." >&2; exit 2; }

OWNER_HOME="$(getent passwd "$OWNER" | cut -d: -f6)"
# Every git/npm step runs as the app's user, never root: a root-owned file inside
# node_modules or .next is one the service (User=airms) cannot later replace.
# HOME is set explicitly because runuser keeps root's, and npm would write its
# cache to /root/.npm and fail.
as_app() { runuser -u "$OWNER" -- env HOME="$OWNER_HOME" sh -c "$1"; }
step() { printf '\n== %s\n' "$*"; }
stop() {
  printf '\nUPDATE STOPPED: %s\nThe live site was not touched. (Work in progress: %s)\n' "$1" "$NEXT" >&2
  exit 1
}

restart() { systemctl restart airms-api airms-web; }

# Healthy AND current. "It answers" is not enough: a restart that silently kept
# the old build would answer too. assert-fresh compares the API's own source
# digest with the tree it was started from (DD 117).
healthy() {
  i=0
  while [ $i -lt 30 ]; do
    if curl -fsS -m 3 http://127.0.0.1:5000/api/health 2>/dev/null | grep -q '"ok":true' \
      && [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1:3000/)" = 200 ]; then
      as_app "cd $APP/backend && node scripts/assert-fresh.js --url http://127.0.0.1:5000/api --strict" && return 0
      return 1
    fi
    i=$((i + 1)); sleep 2
  done
  return 1
}

if [ "${1:-}" = "--rollback" ]; then
  [ -d "$PREV" ] || { echo "No previous version at $PREV to roll back to." >&2; exit 1; }
  step "Rolling back to the previous version"
  rm -rf "$NEXT"
  mv "$APP" "$NEXT" && mv "$PREV" "$APP" && mv "$NEXT" "$PREV"
  restart
  if healthy; then
    echo "Rolled back. Now live: $(as_app "git -C $APP log -1 --oneline")"
    echo "The version you rolled away from is at $PREV (airms-update --rollback swaps again)."
    exit 0
  fi
  echo "ROLLED BACK, BUT THE SITE IS NOT HEALTHY. Check: journalctl -u airms-api -u airms-web -n 50" >&2
  exit 1
fi

FORCE=0; [ "${1:-}" = "--force" ] && FORCE=1

step "Preparing a working copy (the live site keeps running)"
if [ ! -d "$NEXT" ]; then
  # cp -a keeps ownership and carries what git does not: deploy/out (the
  # install's secrets) and frontend/.env.production (the baked-in API address).
  cp -a "$APP" "$NEXT"
fi
as_app "cd $NEXT && git fetch -q origin && git reset -q --hard origin/main"

OLD="$(as_app "git -C $APP rev-parse --short HEAD")"
NEW="$(as_app "git -C $NEXT rev-parse --short HEAD")"
if [ "$OLD" = "$NEW" ] && [ $FORCE -eq 0 ]; then
  echo "Already up to date ($OLD). Nothing to do. (--force rebuilds anyway.)"
  exit 0
fi
echo "Live: $OLD   ->   New: $NEW"
as_app "git -C $NEXT log --oneline $OLD..$NEW" 2>/dev/null | sed 's/^/   /' || true

step "Installing libraries"
for pkg in backend frontend; do
  # One retry: a first `npm ci` failed once on this box and the identical re-run
  # succeeded. A second failure is real and stops the update.
  as_app "cd $NEXT/$pkg && (npm ci --no-audit --no-fund >/dev/null 2>&1 || npm ci --no-audit --no-fund)" \
    || stop "npm ci failed in $pkg"
done

step "Running the tests"
as_app "cd $NEXT/backend && npx jest --silent 2>&1 | tail -5" > /tmp/airms-update-be.log || true
grep -q '^Tests:.*passed' /tmp/airms-update-be.log && ! grep -q 'failed' /tmp/airms-update-be.log \
  || { cat /tmp/airms-update-be.log; stop "backend tests failed"; }
grep '^Tests:' /tmp/airms-update-be.log | sed 's/^/   backend  /'
as_app "cd $NEXT/frontend && npx jest --silent 2>&1 | tail -5" > /tmp/airms-update-fe.log || true
grep -q '^Tests:.*passed' /tmp/airms-update-fe.log && ! grep -q 'failed' /tmp/airms-update-fe.log \
  || { cat /tmp/airms-update-fe.log; stop "frontend tests failed"; }
grep '^Tests:' /tmp/airms-update-fe.log | sed 's/^/   frontend /'

step "Building the website"
as_app "cd $NEXT/frontend && rm -rf .next && npm run build > /tmp/airms-update-build.log 2>&1" \
  || { tail -30 /tmp/airms-update-build.log; stop "the website build failed"; }

step "Checking the database matches the new code"
# A model that declares a column the database lacks answers "Unknown column" on
# every query that selects it — the six-day hosted outage (DD 113). Only MISSING
# blocks; EXTRA (a retired column) and index notes are printed for a person.
# /etc/airms is root-only, so hand the app's credentials over in a private copy
# (node --env-file) rather than on a command line, where `ps` would show them.
DBENV="$(mktemp)"
install -m 600 -o "$OWNER" "$ENVF" "$DBENV"
SCHEMA="$(as_app "cd $NEXT/backend && node --env-file=$DBENV scripts/verify-schema.js 2>&1"; echo "exit=$?")"
rm -f "$DBENV"
echo "$SCHEMA" | grep -vE '^exit=' | sed 's/^/   /'
echo "$SCHEMA" | grep -q '^exit=2' && stop "could not reach the database to check it"
echo "$SCHEMA" | grep -q 'MISSING' && stop "the database needs a migration before this version can run (see MISSING above)"

step "Switching over"
rm -rf "$PREV" "$FAILED"
mv "$APP" "$PREV"
mv "$NEXT" "$APP"
restart

step "Checking the live site"
if healthy; then
  echo
  echo "UPDATED: $OLD -> $NEW, live and verified."
  echo "Previous version kept at $PREV.  To undo:  sudo airms-update --rollback"
  exit 0
fi

echo "The new version did not come up healthy. Putting the previous one back." >&2
mv "$APP" "$FAILED"
mv "$PREV" "$APP"
restart
if healthy; then
  echo "ROLLED BACK to $OLD; the site is up. The failed version is at $FAILED." >&2
  echo "See why:  journalctl -u airms-api -u airms-web -n 80" >&2
else
  echo "ROLLED BACK, BUT THE SITE IS STILL NOT HEALTHY. journalctl -u airms-api -u airms-web -n 80" >&2
fi
exit 1
