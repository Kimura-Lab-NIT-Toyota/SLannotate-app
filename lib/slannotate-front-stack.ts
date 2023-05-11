import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class SLannotateFrontStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const assetPath = "./app/build/";
    //Webページ本体を格納するS3バケット
    const SLannotateFrontBucket = new cdk.aws_s3.Bucket(this, "SLannotateFrontBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
    });

    //CloudFrontのみからアクセスできるような設定
    const oai = new cdk.aws_cloudfront.OriginAccessIdentity(this, "OriginAccessIdentity", {
      comment: `${SLannotateFrontBucket.bucketName}'s OAI`,
    });

    const S3CanonicalPolicy = new cdk.aws_iam.PolicyStatement({
      actions: ["s3:GetObject"],
      effect: cdk.aws_iam.Effect.ALLOW,
      principals: [
        new cdk.aws_iam.CanonicalUserPrincipal(
          oai.cloudFrontOriginAccessIdentityS3CanonicalUserId
        ),
      ],
      resources: [`${SLannotateFrontBucket.bucketArn}/*`]
    });

    SLannotateFrontBucket.addToResourcePolicy(S3CanonicalPolicy);

    //CloudFrontの配信設定
    const distribution = new cdk.aws_cloudfront.Distribution(this, "SLannotateFrontDistribution", {
      comment: "SLannotate App Distribution",
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: new cdk.aws_cloudfront_origins.S3Origin(SLannotateFrontBucket, {
          originAccessIdentity: oai
        }),
      },
      priceClass: cdk.aws_cloudfront.PriceClass.PRICE_CLASS_200,
    });

    new cdk.aws_s3_deployment.BucketDeployment(this, "SLannotateFrontDeployment", {
      sources: [
        cdk.aws_s3_deployment.Source.asset(assetPath)
      ],
      destinationBucket: SLannotateFrontBucket,
      distribution: distribution,
      distributionPaths: ['/*'],
    })
  }
}