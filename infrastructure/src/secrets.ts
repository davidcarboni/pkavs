import { existsSync, readFileSync } from 'fs';
import * as gh from './repo';

// Values from /secrets/github.sh
const owner = process.env.OWNER || process.env.USERNAME || '';
const repo = process.env.REPO || '';

let repoSecrets: string[];

function readSecrets(): { [key: string]: string; } {
  const secrets: { [key: string]: string; } = {};

  const cdkOuputs = '../secrets/cdk-outputs.json';
  // const awsConfig = '~/.aws/credentials';
  if (existsSync(cdkOuputs)) {
    const json = readFileSync(cdkOuputs, 'utf8').trim();
    const outputs = JSON.parse(json);
    const stackKeys = Object.keys(outputs);
    if (stackKeys.length === 1) {
      const keys = outputs[stackKeys[0]];

      // Github secrets
      secrets.AWS_ACCESS_KEY_ID = keys.ghaAccessKeyId;
      secrets.AWS_SECRET_ACCESS_KEY = keys.ghaSecretAccessKey;
      secrets.CLUSTER_ARN = keys.clusterArn;

      // Work out whether there are any "leftover" secrets on the repo that we've not got values for
      repoSecrets = repoSecrets.filter((item) => !Object.keys(secrets).includes(item));

      return secrets;
    }
    throw new Error('No output keys found from CDK');
  }
  throw new Error(`Couldn't find file ${cdkOuputs}`);
}

(async () => {
  console.log(`Updating secrets on ${owner}/${repo}`);
  try {
    // Cache the repo public key
    await gh.getRepoPublicKey(owner, repo);

    // List the current secrets
    repoSecrets = await gh.listRepoSecrets(owner, repo);
    console.log(`${owner}/${repo} has ${repoSecrets.length} secrets: ${repoSecrets}`);

    // Parse the input json
    const secrets = readSecrets();
    if (repoSecrets.length > 0) {
      console.log(`Secrets not included in the CloudFormation outputs (${repoSecrets.length}):\n ${repoSecrets}`);
    }

    // Github secrets
    const promises: Promise<string>[] = [];
    Object.keys(secrets).forEach((secretName) => {
      const promise = gh.setSecret(secretName, secrets[secretName], owner, repo);
      promises.push(promise);
    });
    Promise.all(promises).then((result) => console.log(`Set ${result.length} secrets: ${JSON.stringify(result)}`));
  } catch (err) {
    console.error(err);
  }
})();
