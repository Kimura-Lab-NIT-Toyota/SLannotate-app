import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class SLannotateApiStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);
        //APIGateway
        const api = new cdk.aws_apigateway.RestApi(this, 'SLannotateApi', {
            restApiName: 'SLannotateApi',
            description: 'SLannotate API',
            deployOptions: {
                metricsEnabled: true
            },
        });
        //リクエストを実際に処理するLambda
        const getAnnotateResultLambda = new cdk.aws_lambda.Function(this, 'GetAnnotateResultLambda', {
            code: cdk.aws_lambda.Code.fromAsset('lib/lambdas/api/getAnnotateResult'),
            runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            timeout: cdk.Duration.seconds(300),
        });

        const requestAnnotateLambda = new cdk.aws_lambda.Function(this, 'RequestAnnotateLambda', {
            code: cdk.aws_lambda.Code.fromAsset('lib/lambdas/api/requestAnnotate'),
            runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            timeout: cdk.Duration.seconds(300),
        });
        
        const uploadTargetMovieLambda = new cdk.aws_lambda.Function(this, 'UploadTargetMovieLambda', {
            code: cdk.aws_lambda.Code.fromAsset('lib/lambdas/api/uploadTargetMovie'),
            runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            timeout: cdk.Duration.seconds(300),
        });

        //LambdaとAPIの紐付け
        const apiAnnotate = api.root.addResource('annotate');

        apiAnnotate.addMethod('GET', new cdk.aws_apigateway.LambdaIntegration(getAnnotateResultLambda));
        apiAnnotate.addMethod('POST', new cdk.aws_apigateway.LambdaIntegration(requestAnnotateLambda));


        const apiUpload = api.root.addResource('upload');
        apiUpload.addMethod('POST', new cdk.aws_apigateway.LambdaIntegration(uploadTargetMovieLambda));
    }
}