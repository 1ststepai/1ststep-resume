#!/usr/bin/env bash
set -Eeuo pipefail

readonly project_id="1ststep-job-agent-ci"
readonly source_container="supabase_db_${project_id}"
readonly restore_container="1ststep-ci-restore-${GITHUB_RUN_ID:-manual}-${GITHUB_RUN_ATTEMPT:-1}"
readonly migration_path="supabase/migrations/20260901195545_job_agent_canonical_baseline.sql"
readonly artifact_dir="artifacts"
readonly summary_path="${artifact_dir}/isolated-database-ci-summary.json"
readonly dump_path="${RUNNER_TEMP:-/tmp}/1ststep-job-agent-ci.dump"
readonly fixture_tenant="cccccccccccccccccccccccccccccccccccccccc"

cleanup() {
  docker rm --force "${restore_container}" >/dev/null 2>&1 || true
  rm -f -- "${dump_path}"
}
trap cleanup EXIT

if ! docker inspect "${source_container}" >/dev/null 2>&1; then
  echo "The isolated Supabase database container is unavailable." >&2
  exit 1
fi

source_image="$(docker inspect --format '{{.Config.Image}}' "${source_container}")"
source_postgres_version="$(docker exec "${source_container}" psql -Atq -U postgres -d postgres -c 'show server_version')"
supabase_cli_version="$(supabase --version | tr -d '\r\n')"

docker exec "${source_container}" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c \
  "insert into public.app_tenants (tenant_id) values ('${fixture_tenant}') on conflict do nothing" >/dev/null

source_rows="$(docker exec "${source_container}" psql -Atq -U postgres -d postgres -c \
  "select count(*) from public.app_tenants where tenant_id = '${fixture_tenant}'")"
test "${source_rows}" = "1"

docker exec "${source_container}" pg_dump -U postgres -d postgres --format=custom --data-only \
  --schema=public --no-owner --no-privileges --file=/tmp/1ststep-job-agent-ci.dump
docker cp "${source_container}:/tmp/1ststep-job-agent-ci.dump" "${dump_path}" >/dev/null

docker run --detach --name "${restore_container}" --env POSTGRES_PASSWORD=postgres "${source_image}" >/dev/null
for _ in $(seq 1 60); do
  if docker exec "${restore_container}" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "${restore_container}" pg_isready -U postgres -d postgres >/dev/null

docker exec -i "${restore_container}" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "${migration_path}" >/dev/null
docker cp "${dump_path}" "${restore_container}:/tmp/1ststep-job-agent-ci.dump" >/dev/null
docker exec "${restore_container}" pg_restore -U postgres -d postgres --data-only --no-owner \
  --no-privileges --exit-on-error /tmp/1ststep-job-agent-ci.dump >/dev/null

restored_rows="$(docker exec "${restore_container}" psql -Atq -U postgres -d postgres -c \
  "select count(*) from public.app_tenants where tenant_id = '${fixture_tenant}'")"
test "${restored_rows}" = "${source_rows}"

table_count="$(docker exec "${restore_container}" psql -Atq -U postgres -d postgres -c \
  "select count(*) from pg_tables where schemaname = 'public' and tablename in ('app_tenants','app_identities','applicant_profiles','applicant_facts','discovered_jobs','applications','document_versions','human_actions','audit_events','candidate_preferences','fact_corrections','job_sources','source_performance','learning_signals','learning_proposals','evaluation_runs','policy_versions','workflow_operations','workflow_events','provider_circuit_states')")"
test "${table_count}" = "20"

rls_count="$(docker exec "${restore_container}" psql -Atq -U postgres -d postgres -c \
  "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity")"
test "${rls_count}" = "20"

docker rm --force "${restore_container}" >/dev/null
if docker inspect "${restore_container}" >/dev/null 2>&1; then
  echo "The disposable restore target was not destroyed." >&2
  exit 1
fi

mkdir -p -- "${artifact_dir}"
export CI_SOURCE_COMMIT="${GITHUB_SHA:-$(git rev-parse HEAD)}"
export CI_RECORDED_AT="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
export CI_SUPABASE_VERSION="${supabase_cli_version}"
export CI_POSTGRES_VERSION="${source_postgres_version}"
export CI_MIGRATION_SHA256="$(sha256sum "${migration_path}" | cut -d ' ' -f 1)"
export CI_BACKUP_SHA256="$(sha256sum "${dump_path}" | cut -d ' ' -f 1)"
export CI_SOURCE_ROWS="${source_rows}"
export CI_RESTORED_ROWS="${restored_rows}"
export CI_TABLE_COUNT="${table_count}"
export CI_RLS_COUNT="${rls_count}"
export CI_RESTORE_CLEANUP_VERIFIED="true"

node scripts/write-isolated-database-ci-summary.mjs "${summary_path}"
cat "${summary_path}" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
