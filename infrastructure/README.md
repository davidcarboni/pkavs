# CDK Infrastructure

This infrastructure is built using AWS Cloud Development Kit (CDK):

 * `npm install --global aws-cdk typescript`
 * `cdk init app --language=typescript`

NB this project is run with the `deploy.sh` script.

The outputs of the CloudFormation stack are written to `../secrets/cdk-outpus.json`. The outputs provides inputs for `../github/run.sh`.
