#!/usr/bin/env bash
# Builds the site the suite runs against, in a DDEV project: the file server (Nextcloud Server, AGPL-3.0) from
# its release tarball, installed with its own installer (occ maintenance:install) on the project's database,
# with only the apps the release bundles, and the accounts of the test users:
#
#   - https://<project>.ddev.site/        the site (the release in nextcloud/, the docroot; its data folder
#                                          data/ beside it, outside the docroot), served by Apache with the
#                                          release's own rewrite rules, so its addresses are short (/apps/files);
#   - https://<project>.ddev.site:8026    the project's mail catcher (Mailpit), which the site sends its mail to.
#
# The site is set up for testing with site/nextcloud-site.sh, run by bash in the web container with the
# server's own command-line tool (occ): the same script the Webship Workspace's Nextcloud plugin runs. It
# turns the app store and the first-run wizard off, gives new accounts no files, cuts the site off from the
# internet (no outside service is called), turns off the throttling of failed logins (every request comes
# from the router's address, so the failed logins of one run would slow down every later one), and runs the
# background jobs with cron every five minutes.
#
# Settings (environment variables, all optional):
#   PROJECT_NAME          the DDEV project name                          (default nextcloudsteps)
#   SITE_DIR              the project folder                             (default a new temporary folder)
#   NEXTCLOUD_VERSION     the release (35.0.3), or a major line (35) for its newest release   (default 35.0.3)
#   PHP_VERSION           the PHP of the web container                   (default 8.4)
#   ACCOUNT_PASSWORD      the password of the accounts below            (default dD.123123ddd)
#   BUILD_ADMIN           the administrator the installer makes, for the build only   (default admin)
#   BUILD_ADMIN_PASSWORD  its password                                   (default ACCOUNT_PASSWORD)
#   ACCOUNTS_ONLY         1: build nothing, give the accounts of the site in SITE_DIR back their password,
#                         email, display name and groups, and take away their files (an interrupted run's)
#
# The accounts are configuration: this script creates them and cucumber.js names them; the features never
# create or delete one.
#   administrator  administrator@example.com  in the admin group
#   editor         editor@example.com         no group
#   user           user@example.com           no group
#
# No hosted service, no account anywhere, nothing that is not open source.
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-nextcloudsteps}"
NEXTCLOUD_VERSION="${NEXTCLOUD_VERSION:-35.0.3}"
PHP_VERSION="${PHP_VERSION:-8.4}"
ACCOUNT_PASSWORD="${ACCOUNT_PASSWORD:-dD.123123ddd}"
BUILD_ADMIN="${BUILD_ADMIN:-admin}"
BUILD_ADMIN_PASSWORD="${BUILD_ADMIN_PASSWORD:-$ACCOUNT_PASSWORD}"
SITE_DIR="${SITE_DIR:-$(mktemp -d)}"
PACK_SITE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../site" && pwd)"
HOST="${PROJECT_NAME}.ddev.site"
SITE_URL="https://${HOST}"

# The payload of site/nextcloud-site.sh: lines of KEY=base64(value), all of it in base64 again.
payload() {
  local line="" key
  for key in "$@"; do
    line="${line}${key}=$(printf '%s' "${!key}" | base64 -w0)"$'\n'
  done
  printf '%s' "$line" | base64 -w0
}

# Run verbs of site/nextcloud-site.sh in the web container, with the payload on its first line.
site_script() {
  local verbs="$1" ; shift
  { printf "SITE_PAYLOAD='%s'\n" "$(payload "$@")"; cat "${PACK_SITE}/nextcloud-site.sh"; } \
    | ddev exec "SITE_VERBS='${verbs}' bash -s"
}

# The accounts of the test users: username|email|password|display name|groups.
accounts() {
  printf '%s\n' \
    "administrator|administrator@example.com|${ACCOUNT_PASSWORD}|Administrator|admin" \
    "editor|editor@example.com|${ACCOUNT_PASSWORD}|Editor|" \
    "user|user@example.com|${ACCOUNT_PASSWORD}|User|"
}

mkdir -p "$SITE_DIR"
cd "$SITE_DIR"

if [ "${ACCOUNTS_ONLY:-}" = "1" ]; then
  ACCOUNTS="$(accounts)" USERNAMES="$(accounts | cut -d'|' -f1)" site_script "accounts empty" ACCOUNTS USERNAMES
  exit 0
fi

# A project of this name from an earlier build goes first, with its database.
if ddev describe "$PROJECT_NAME" > /dev/null 2>&1; then
  ddev delete -Oy "$PROJECT_NAME" < /dev/null
fi
rm -rf nextcloud data .ddev

# A PHP project served by Apache (the release's .htaccess rules), from nextcloud/, with the project's
# database (MariaDB 10.11, which the release supports) and Node.js 24 for a test suite run in the web container.
ddev config --project-type=php --docroot=nextcloud --webserver-type=apache-fpm --php-version="$PHP_VERSION" \
  --project-name="$PROJECT_NAME" --nodejs-version=24 < /dev/null

# PHP as the release asks for it: APCu on the command line too (the site's local memory cache), room for uploads.
mkdir -p .ddev/php
cat > .ddev/php/nextcloud.ini <<'INIEOF'
; The PHP settings of the file server (written by the build script).
apc.enable_cli = 1
memory_limit = 1024M
upload_max_filesize = 512M
post_max_size = 512M
INIEOF
# The background jobs: cron.php every five minutes, as a daemon of the web container.
cat > .ddev/nextcloud-cron.sh <<'CRONEOF'
#!/usr/bin/env bash
# The background jobs of the file server: cron.php every five minutes, once the site is installed.
while true; do
  if grep -qs "'installed' => true" /var/www/html/nextcloud/config/config.php; then
    php -f /var/www/html/nextcloud/cron.php >> /tmp/nextcloud-cron.log 2>&1
  fi
  sleep 300
done
CRONEOF
cat > .ddev/config.nextcloud.yaml <<YAMLEOF
# The file server of this project (written by the build script): its release, and its background jobs.
web_environment:
  - NEXTCLOUD_VERSION=${NEXTCLOUD_VERSION}
web_extra_daemons:
  - name: "nextcloud-cron"
    command: "bash /var/www/html/.ddev/nextcloud-cron.sh"
    directory: /var/www/html
YAMLEOF

ddev start -y < /dev/null

VERSION="$NEXTCLOUD_VERSION" ADMIN_USER="$BUILD_ADMIN" ADMIN_PASSWORD="$BUILD_ADMIN_PASSWORD" ADMIN_EMAIL="${BUILD_ADMIN}@example.com" \
  HOST="$HOST" ACCOUNTS="$(accounts)" \
  site_script "download install configure accounts" VERSION ADMIN_USER ADMIN_PASSWORD ADMIN_EMAIL HOST ACCOUNTS

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "LAUNCH_URL=$SITE_URL" >> "$GITHUB_ENV"
fi
RELEASE="$(site_script version < /dev/null | tr -d '\r' | tail -n 1)"
echo "Built ${RELEASE} at ${SITE_URL}, its mail at ${SITE_URL}:8026"
