#!/usr/bin/env bash
set -eu
export AWS_PROFILE=carboni

# We need to set secrets in the environment before we can bootstrap or deploy:
source ../secrets/github.sh
source ../secrets/slack.sh

# Set Github secrets
function gha_secrets {
  echo "Setting Github secrets"
  npm run secrets
  echo "Giving Github a few seconds..." && sleep 10
}

# Trigger CI builds by adding commits to the component directories
function gha_build {
  components=(
    pkavs
  )

  # Dispatch workflows
  source ../secrets/github.sh
  for repository in "${components[@]}"
  do
    url=https://api.github.com/repos/davidcarboni/pkavs/actions/workflows/${repository}.yml/dispatches
    echo $url
    curl \
    -H "Authorization: token ${PERSONAL_ACCESS_TOKEN}" \
    -X POST \
    -H "Accept: application/vnd.github.v3+json" \
    $url \
    -d '{"ref":"main", "inputs": {"update_component":"no"}}'
  done

  # Wait for builds to (hopefully) succeed
  echo "Sleeping for 3 minutes... (`date`)" && sleep 60
  echo "Sleeping for 2 minutes..." && sleep 60
  echo "Sleeping for 1 more minute..." && sleep 60
}

# First-pass deployment
function first_pass {
  echo "Running deploy initial pass"
  PASS=initial cdk deploy --all --outputs-file ../secrets/cdk-outputs.json --require-approval never
}

# Second-pass deployment
function second_pass {
  echo "Running deploy full pass"
  PASS=full cdk deploy --all --outputs-file ../secrets/cdk-outputs.json --require-approval never
}

# Infractructure build in 2 passes, with container builds in the middle:

echo "Starting infrastructure build: $(date)"
npm run lint

# First ever deploy (and safe to call on subsequent deploys):
account=$(aws sts get-caller-identity --query Account --output text)
cdk bootstrap aws://${account}/eu-west-2 # UK Resources
cdk bootstrap aws://${account}/us-east-1 # Cloudfront resources

time first_pass
gha_secrets
gha_build
time second_pass

echo "End: $(date)"
