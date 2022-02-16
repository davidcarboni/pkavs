import { Repository } from 'aws-cdk-lib/aws-ecr';
import {
  CfnAccessKey, Effect, Policy, PolicyStatement, User,
} from 'aws-cdk-lib/aws-iam';
import { Function } from 'aws-cdk-lib/aws-lambda';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Stack } from 'aws-cdk-lib';

/**
 * A user for Gihud Actions CI/CD.
 */
export default function ghaUser(
  stack: Stack,
  ecrRepositories: Repository[],
  lambdas?: Function[],
  services?: ecs.FargateService[],
): CfnAccessKey | undefined {
  const statements: PolicyStatement[] = [];

  // ECR login
  statements.push(new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'ecr:GetAuthorizationToken',
    ],
    resources: [
      '*',
    ],
  }));

  // ECR repositories
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

  // Lambda functions
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

  // Fargate services
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

  // A policy that includes these statments
  const ghaPolicy = new Policy(stack, 'ghaUserPolicy', {
    policyName: 'ghaUserPolicy',
    statements,
  });

  // A user with the policy attached
  const user = new User(stack, 'ghaUser', { userName: stack.stackName });
  user.attachInlinePolicy(ghaPolicy);

  // Credentials
  let accessKey: CfnAccessKey | undefined;
  if (!process.env.REKEY) {
    accessKey = new CfnAccessKey(stack, 'ghaUserAccessKey', {
      userName: user.userName,
    });
  }

  return accessKey;
}
