set -eu
artifact_directory=/opt/onecrew/onecrew_lite-app/.scratch/service-v15-initialize
sha256sum -c .scratch/service-v15-validated.sha256
test -s ../onecrew_lite-web/dist-cloud/cloud.html
node src/cloud/cli.ts initialize --data-directory "$artifact_directory"
test "$(stat -c %a "$artifact_directory")" = 700
test "$(stat -c %a "$artifact_directory/cloud.key")" = 600
test "$(stat -c %a "$artifact_directory/cloud.sqlite")" = 600
