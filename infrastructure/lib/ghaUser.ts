import { Repository } from 'aws-cdk-lib/aws-ecr';
import {
  CfnAccessKey, Effect, Policy, PolicyStatement, User,
} from 'aws-cdk-lib/aws-iam';
import { Function } from 'aws-cdk-lib/aws-lambda';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';

/**
 * A user for Gihud Actions CI/CD.
 */
export default function ghaUser(
  construct: Construct,
  userName: string,
  ecrRepositories: Repository[],
  lambdas?: Function[],
  services?: ecs.FargateService[],
): CfnAccessKey | undefined {
  const statements: PolicyStatement[] = [];

  statements.push(new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'ecr:GetAuthorizationToken',
    ],
    resources: [
      '*',
    ],
  }));

  const repositoryArns = ecrRepositories
    .filter((repository) => repository !== undefined)
    .map((repository) => repository.repositoryArn);
  if (repositoryArns.length > 0) {
    statements.push(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
        'ecr:BatchDeleteImage',
        'ecr:CompleteLayerUpload',
        'ecr:UploadLayerPart',
        'ecr:InitiateLayerUpload',
        'ecr:BatchCheckLayerAvailability',
        'ecr:PutImage',
        'ecr:ListImages',
      ],
      resources: repositoryArns,
    }));
  }

  if (lambdas) {
    const lambdaArns = lambdas
      .filter((lambda) => lambda !== undefined)
      .map((lambda) => lambda.functionArn);
    if (lambdaArns.length > 0) {
      statements.push(new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'lambda:UpdateFunctionCode',
        ],
        resources: lambdaArns,
      }));
    }
  }

  if (services) {
    const serviceArns = services
      .filter((service) => service !== undefined)
      .map((service) => service.serviceArn);
    if (serviceArns.length > 0) {
      statements.push(new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'ecs:UpdateService',
        ],
        resources: serviceArns,
      }));
    }
  }

  const ghaPolicy = new Policy(construct, 'ghaUserPolicy', {
    policyName: 'ghaUserPolicy',
    statements,
  });
  const user = new User(construct, 'ghaUser', { userName });
  user.attachInlinePolicy(ghaPolicy);

  let key: CfnAccessKey | undefined;
  if (!process.env.REKEY) {
    key = new CfnAccessKey(construct, 'ghaUserAccessKey', {
      userName: user.userName,
    });
  }

  return key;
}
