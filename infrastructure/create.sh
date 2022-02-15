#!/usr/bin/env bash
set -eu

# We need to set secrets in the environment before we can bootstrap or deploy:
source ../secrets/github.sh
source ../secrets/slack.sh

export AWS_PROFILE=carboni

# First ever deploy (and safe to call on subsequent deploys):
cdk bootstrap aws://503344433256/eu-west-2 # UK Resources
cdk bootstrap aws://503344433256/us-east-1 # Cloudfront resources

# Set Github secrets
function gha_secrets {
  echo "Setting Github secrets"
  npm run secrets
  echo "Giving Github a few seconds..." && sleep 10
}

# Trigger CI builds by adding commits to the component directories
function gha_build {
  components=(
    auth
    metrics
    web
    api
  )

  # Dispatch workflows
  source ../secrets/github.sh
  for repository in "${components[@]}"
  do
    echo https://api.github.com/repos/davidcarboni/pkavs/actions/workflows/${repository}.yml/dispatches
    curl \
    -H "Authorization: token ${PERSONAL_ACCESS_TOKEN}" \
    -X POST \
    -H "Accept: application/vnd.github.v3+json" \
    https://api.github.com/repos/davidcarboni/pkavs/actions/workflows/${repository}.yml/dispatches \
    -d '{"ref":"main", "inputs": {"update_lambda":"no"}}'
  done

  # Wait for builds to (hopefully) succeed
  echo "Sleeping for 3 minutes... (`date`)" && sleep 60
  echo "Sleeping for 2 minutes..." && sleep 60
  echo "Sleeping for 1 more minute..." && sleep 60
}

# Build an environment file for Docker Compose to run locally
function docker_compose_env {
  echo "Writing Docker Compose environment file"
  npm run compose
  git commit -m "Infrastructure build" ../docker-compose.env
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

time first_pass
gha_secrets
gha_build
time second_pass
docker_compose_env

echo "End: $(date)"
