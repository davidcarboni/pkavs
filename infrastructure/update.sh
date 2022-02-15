#!/usr/bin/env bash
set -eu

# One-pass infrastructuer deploy to apply any updates
npm run lint

echo "Running deploy"
cdk deploy --all --outputs-file ../secrets/cdk-outputs.json
echo "Setting Github secrets"
source ../secrets/github.sh
npm run secrets
echo "Writing Docker Compose environment file"
npm run compose
git commit -m "Infrastructure build" ../docker-compose.env
echo "End: infractructure, Github Actions and Docker Compose environment setup."
