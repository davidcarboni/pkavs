#!/usr/bin/env bash
set -eu
export AWS_PROFILE=carboni

# One-pass infrastructuer deploy to apply any updates
npm run lint

echo "Running deploy"
cdk deploy --all --outputs-file ../secrets/cdk-outputs.json

echo "Setting Github secrets"
source ../secrets/github.sh
npm run secrets

echo "End: infractructure & Github Actions environment setup."
