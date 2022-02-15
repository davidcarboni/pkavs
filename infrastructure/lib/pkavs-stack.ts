import * as cdk from '@aws-cdk/core';
import * as ecr from '@aws-cdk/aws-ecr';
import * as ecs from '@aws-cdk/aws-ecs';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as acm from '@aws-cdk/aws-certificatemanager';
import * as route53 from '@aws-cdk/aws-route53';
import * as ecsPatterns from '@aws-cdk/aws-ecs-patterns';
import * as iam from '@aws-cdk/aws-iam';
import * as rds from '@aws-cdk/aws-rds';
import { ApplicationProtocol } from '@aws-cdk/aws-elasticloadbalancingv2';

// The infrastructure has circular dependencies
// so we need to build it in two passes
const pass = process.env.PASS || 'full';

// App name
const name = 'pkavs';
const domainName = 'tampontaxi.pkavs.org.uk';

// DNS
let zone: route53.IHostedZone;
let certificate: acm.Certificate;

// Web App
let webAppRepository: ecr.Repository;
let albfs: ecsPatterns.ApplicationLoadBalancedFargateService;

// CI/CD
let githubActionsUser: iam.User;
let githubActionsUserAccessKey: iam.CfnAccessKey;

export default class pkavsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    console.log(`Setting up stack ${name} on domain ${domainName}.`);

    this.dns();
    this.webApp();

    // GHA build user
    this.githubActionsUser();

    // Outputs used by GHA
    new cdk.CfnOutput(this, 'clusterArn', { value: albfs.cluster.clusterArn });
    new cdk.CfnOutput(this, 'ghaAccessKeyId', { value: githubActionsUserAccessKey.ref });
    new cdk.CfnOutput(this, 'ghaSecretAccessKey', { value: githubActionsUserAccessKey.attrSecretAccessKey });
  }

  /**
   * DNS configuration for the app.
   */
  dns() {
    // We look up the hosted zone, otherwise we'd have to update nameservers if the stach is rebuilt
    const dnsZone = route53.HostedZone.fromHostedZoneAttributes(this, 'dnsZone', {
      zoneName: domainName,
      hostedZoneId: 'Z10401883PXAJJHUQUKVI',
    });
    certificate = new acm.DnsValidatedCertificate(this, 'CertificateCom', {
      domainName: dnsZone.zoneName,
      hostedZone: dnsZone,
    });
    zone = dnsZone;
  }

  /**
   * The resourcdes that make up the web applicaiton.
   */
  webApp() {
    // Container repository
    webAppRepository = new ecr.Repository(this, 'WebAppRepository', {
      repositoryName: name,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // It seems like NAT gateways are costly, so I've set this up to avoid that.
    // Based on: https://www.binarythinktank.com/blog/truly-serverless-container
    // and https://stackoverflow.com/questions/64299664/how-to-configure-aws-cdk-applicationloadbalancedfargateservice-to-log-parsed-jso
    const vpc = new ec2.Vpc(this, 'vpc');

    // // Web App environment variables
    // - can't do this until Cognito is set up
    // - can't set up Cognito until the Web App has set up an A record
    // Catch-22.
    // This works only after an initial build of the infrastructure.
    const environment: { [key: string]: string; } = {
      ENVIRONMENT: 'variable',
    };

    // Fargate
    albfs = new ecsPatterns.ApplicationLoadBalancedFargateService(this, `albFargateService_${name}`, {
      loadBalancerName: `${name}`,
      serviceName: name,
      protocol: ApplicationProtocol.HTTPS,
      domainZone: zone,
      domainName,
      certificate,
      cpu: 512,
      memoryLimitMiB: 1024,
      taskImageOptions: {
        containerName: name,
        image: ecs.ContainerImage.fromEcrRepository(webAppRepository),
        containerPort: 8069,
        environment,
      },
      desiredCount: 1,
      vpc,
      assignPublicIp: true,
    });

    if (pass === 'initial') {
      // On the first deploy, when there's no image in the repository:
      // https://github.com/aws/aws-cdk/issues/3646#issuecomment-623919242
      const { node } = albfs.service;
      const cfnService = node.findChild('Service') as ecs.CfnService;
      cfnService.desiredCount = 0;
    }

    // TODO tis needs some finessing
    new rds.DatabaseCluster(this, 'Database', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_10_16,
      }),
      credentials: rds.Credentials.fromGeneratedSecret('clusteradmin'), // Optional - will default to 'admin' username and generated password
      instanceProps: {
        // optional , defaults to t3.medium
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.SMALL),
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        vpc,
      },
    });
  }

  /**
   * A user for Gihud Actions CI/CD.
   */
  githubActionsUser() {
    githubActionsUser = new iam.User(this, 'githubActionsUser', { userName: 'githubActionsUser' });

    const statements: iam.PolicyStatement[] = [];

    statements.push(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecr:GetAuthorizationToken',
      ],
      resources: [
        '*',
      ],
    }));

    statements.push(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
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
      resources: [
        webAppRepository.repositoryArn,
      ],
    }));

    statements.push(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecs:UpdateService',
      ],
      resources: [albfs.service.serviceArn],
    }));

    const githubActionsUserPolicy = new iam.Policy(this, 'githubActionsUserPolicy', {
      policyName: 'gha-policy',
      statements,
    });
    githubActionsUser.attachInlinePolicy(githubActionsUserPolicy);

    githubActionsUserAccessKey = new iam.CfnAccessKey(this, 'myAccessKey', {
      userName: githubActionsUser.userName,
    });
  }
}
