import {
  CfnOutput, RemovalPolicy, Stack, StackProps,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as rds from 'aws-cdk-lib/aws-rds';
import { ApplicationProtocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Credentials, ParameterGroup } from 'aws-cdk-lib/aws-rds';
import ghaUser from './ghaUser';

// The infrastructure has circular dependencies
// E.g. ECR repositories need to be:
// 1. Created by the CDK
// 2. Populated with an image by a Github Actions build
// 3. The image referenced by a Lanmbda function
// so we need to build in two passes
// const initial = 'initial';
const full = 'full';
const pass = process.env.PASS || full;

// App name
let name = 'pkavs';
const zoneName = 'pingmyhouse.com';
const domainName = `${name}.${zoneName}`;

// DNS
let zone: route53.IHostedZone;
const hostedZoneId = 'Z10401883PXAJJHUQUKVI';

// Web App
let webAppRepository: ecr.Repository;
let albfs: ecsPatterns.ApplicationLoadBalancedFargateService;

export default class PkavsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    name = id;
    console.log(`Setting up stack ${name} on domain ${domainName}.`);

    // Infrastructure
    this.dns();
    this.webApp();

    // Github Actions IAM user
    const accessKey = ghaUser(this, [webAppRepository], [], [albfs.service]);

    // Outputs used by GHA
    new CfnOutput(this, 'clusterArn', { value: albfs.cluster.clusterArn });
    if (accessKey) {
      new CfnOutput(this, 'ghaAccessKeyId', { value: accessKey.ref });
      new CfnOutput(this, 'ghaSecretAccessKey', { value: accessKey.attrSecretAccessKey });
    }
  }

  /**
   * DNS configuration for the app.
   */
  dns() {
    // We look up the hosted zone, otherwise we'd have to update nameservers if the stach is rebuilt
    zone = route53.HostedZone.fromHostedZoneAttributes(this, 'dnsZone', {
      zoneName,
      hostedZoneId,
    });
  }

  /**
   * The resourcdes that make up the web applicaiton.
   */
  webApp() {
    // Container repository
    webAppRepository = new ecr.Repository(this, 'WebAppRepository', {
      repositoryName: name,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // It seems like NAT gateways are costly, so I've set this up to avoid that.
    // Based on: https://www.binarythinktank.com/blog/truly-serverless-container
    // and https://stackoverflow.com/questions/64299664/how-to-configure-aws-cdk-applicationloadbalancedfargateservice-to-log-parsed-jso
    const vpc = new ec2.Vpc(this, 'vpc', {
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'ingress',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        // {
        //   cidrMask: 24,
        //   name: 'application',
        //   subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        // },
        {
          cidrMask: 28,
          name: 'rds',
          // PRIVATE_ISOLATED throws an error at time of writing:
          subnetType: ec2.SubnetType.PRIVATE,
        },
      ],
    });

    // Database
    const credentials = Credentials.fromUsername('odoo');
    const cluster = new rds.ServerlessCluster(this, 'AnotherCluster', {
      engine: rds.DatabaseClusterEngine.AURORA_POSTGRESQL,
      parameterGroup: ParameterGroup.fromParameterGroupName(this, 'ParameterGroup', 'default.aurora-postgresql10'),
      vpc,
      credentials,
    });

    // Fargate
    albfs = new ecsPatterns.ApplicationLoadBalancedFargateService(this, `albFargateService_${name}`, {
      loadBalancerName: `${name}`,
      serviceName: name,
      protocol: ApplicationProtocol.HTTPS,
      domainZone: zone,
      domainName,
      certificate: new acm.DnsValidatedCertificate(this, 'CertificateCom', {
        domainName: zone.zoneName,
        hostedZone: zone,
      }),
      cpu: 512,
      memoryLimitMiB: 1024,
      taskImageOptions: {
        containerName: name,
        image: ecs.ContainerImage.fromEcrRepository(webAppRepository),
        containerPort: 8069,
        environment: {
          CLUSTER_ARN: cluster.clusterArn,
          // SECRET_ARN: cluster.secret!.secretArn,
          DB_USER: credentials.username,
          DB_PASSWORD: credentials.password?.toString()!,
        },
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
  }
}
