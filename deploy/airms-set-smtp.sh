#!/bin/sh
# airms-set-smtp — connect AIRMS to an outgoing mail account, safely.
#
#   sudo sh deploy/airms-set-smtp.sh
#
# Asks for the sending address and its app password (typed hidden, so it never
# lands in shell history or on a command line), SENDS A TEST EMAIL with the
# app's own mailer, and only if that email is accepted writes the settings into
# /etc/airms/api.env and restarts the API. A typo therefore cannot leave the
# install with mail half-configured: the failure is reported and nothing changes.
#
# Defaults are Google Workspace, which is what isn.gov.my runs (its MX records
# are aspmx.l.google.com and its SPF includes _spf.google.com, so mail sent this
# way passes ISN's own SPF/DMARC). Google needs an APP PASSWORD: 2-Step
# Verification on the account, then myaccount.google.com/apppasswords. If that
# page says the setting is unavailable, the Workspace admin has disabled app
# passwords — that is the one part that genuinely needs ISN IT.
#
# SMTP_USER and the From address are the SAME account on purpose: a provider
# sends only as the account it authenticated and rewrites any other From, which
# the admin Settings tile reports as a mismatch (senderIdentity, mailer.js).
#
# NOTE: deploy/configure.sh writes a BLANK SMTP block. Re-running it and
# re-installing its api.env undoes this; run this script again afterwards.

set -eu

APP=/opt/airms
ENVF=/etc/airms/api.env
GEN=$APP/deploy/out/api.env
OWNER=airms

[ "$(id -u)" -eq 0 ] || { echo "Run it with sudo:  sudo sh $0" >&2; exit 2; }
[ -f "$ENVF" ] || { echo "$ENVF not found — install AIRMS first." >&2; exit 2; }

ask() { printf '%s [%s]: ' "$1" "$2" >&2; read -r v; printf '%s' "${v:-$2}"; }

ADDR="$(ask 'Sending address' 'injriskdashboard@isn.gov.my')"
NAME="$(ask 'Name shown to recipients' 'AIRMS')"
HOST="$(ask 'SMTP server' 'smtp.gmail.com')"
PORT="$(ask 'Port' '465')"
printf 'App password for %s (hidden): ' "$ADDR" >&2
stty -echo; read -r PASS; stty echo; printf '\n' >&2
# Google displays it in four groups of four; the spaces are not part of it.
PASS="$(printf '%s' "$PASS" | tr -d ' ')"
TO="$(ask 'Send the test email to' "$ADDR")"

case "$PASS$ADDR$NAME$HOST$PORT" in *"'"*) echo "A value contains a single quote, which this script cannot store safely." >&2; exit 1 ;; esac
[ -n "$PASS" ] || { echo "No password entered." >&2; exit 1; }
SECURE=false; [ "$PORT" = 465 ] && SECURE=true

OWNER_HOME="$(getent passwd "$OWNER" | cut -d: -f6)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
chown "$OWNER" "$WORK"

# Rewrite the SMTP_* lines of an env file into $2, leaving everything else as is.
# Values go in through ENVIRON, never through the awk program text, so no
# character in a password can change what the program does.
rewrite() {
  N_HOST="$HOST" N_PORT="$PORT" N_SECURE="$SECURE" N_USER="$ADDR" N_PASS="$PASS" \
  N_FROM="$NAME <$ADDR>" awk '
    BEGIN {
      v["SMTP_HOST"]=ENVIRON["N_HOST"]; v["SMTP_PORT"]=ENVIRON["N_PORT"]
      v["SMTP_SECURE"]=ENVIRON["N_SECURE"]; v["SMTP_USER"]=ENVIRON["N_USER"]
      v["SMTP_PASS"]=ENVIRON["N_PASS"]; v["SMTP_FROM"]=ENVIRON["N_FROM"]
    }
    { k=$0; sub(/=.*/, "", k) }
    (k in v) { print k "='\''" v[k] "'\''"; seen[k]=1; next }
    { print }
    END { for (k in v) if (!(k in seen)) print k "='\''" v[k] "'\''" }
  ' "$1" > "$2"
}

rewrite "$ENVF" "$WORK/api.env"
chown "$OWNER" "$WORK/api.env"; chmod 600 "$WORK/api.env"

cat > "$WORK/test.js" <<'EOF'
const { sendMail } = require('/opt/airms/backend/src/utils/mailer');
sendMail({
  to: process.env.TEST_TO,
  subject: 'AIRMS email is working',
  text: 'This is a test from AIRMS at ISN. If you can read it, invitations and '
      + 'password-reset codes will now be delivered by email.\n',
})
  .then((info) => { console.log('accepted by the mail server', (info.accepted || []).join(', ')); })
  .catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
EOF
chown "$OWNER" "$WORK/test.js"

printf '\nSending a test email to %s ...\n' "$TO" >&2
if ! runuser -u "$OWNER" -- env HOME="$OWNER_HOME" TEST_TO="$TO" \
    node --env-file="$WORK/api.env" "$WORK/test.js"; then
  cat >&2 <<EOF

Nothing was changed. Common causes:
  - the app password was mistyped, or is the account's normal password
    (Google refuses those for SMTP — it must be an app password);
  - 2-Step Verification is off on $ADDR;
  - ISN's Google admin has disabled app passwords (ask ISN IT to allow one).
EOF
  exit 1
fi

install -o root -g "$OWNER" -m 640 "$WORK/api.env" "$ENVF"
if [ -f "$GEN" ]; then
  rewrite "$GEN" "$WORK/gen.env"
  install -o "$OWNER" -g "$OWNER" -m 600 "$WORK/gen.env" "$GEN"
fi
systemctl restart airms-api
printf '\nEmail is set up. Sending as: %s <%s>\nCheck %s for the test message (and its spam folder, the first time).\n' "$NAME" "$ADDR" "$TO"
