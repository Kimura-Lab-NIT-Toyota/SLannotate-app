import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy,StackProps,aws_cognito } from 'aws-cdk-lib';
import { Construct } from 'constructs';
//アプリケーションのAPIを管理するスタック。

interface apiProps extends StackProps{
    userPool:aws_cognito.UserPool;
}
export class SLannotateApiStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: apiProps) {
        super(scope, id, props);

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
        //アップロードされた動画を格納するバケット
        const videoBucket = new cdk.aws_s3.Bucket(this, "SLannotateVideoBucket", {
            removalPolicy: RemovalPolicy.DESTROY,
        });
        //APIからS3を触るためのロール作成
        const uploadRole = new cdk.aws_iam.Role(this, "SLannotateVideoBucketUploadRole", {
            assumedBy: new cdk.aws_iam.ServicePrincipal("apigateway.amazonaws.com"),
            path: "/",
        })
        videoBucket.grantWrite(uploadRole);

        //API作成
        const api = new cdk.aws_apigateway.RestApi(this, 'SLannotateApi', {
            restApiName: 'SLannotateApi',
            description: 'SLannotate API',
            deployOptions: {
                metricsEnabled: true
            },
            binaryMediaTypes: ['*/*'],
        });
        //authorizerを作成(auth-stackで作成したUserPoolを呼び出す)
        const userPool = props.userPool;
        const authorizer = new cdk.aws_apigateway.CognitoUserPoolsAuthorizer(this, 'SLannotateApiAuthorizer', {
            cognitoUserPools: [userPool],
        });
        //LambdaとAPIの紐付け
        /* ~/users -
                    |- {userId} - GET:User details
                    |    |- files - GET:List of files
                    |    |    |- {fileName} - GET:File details
                    |    |    |- {fileName} - POST:Upload File 
                    |    |    |    |- annotate - GET:Annotate result
                    |    |    |    |- annotate - POST:Annotate request
        */
        const users = api.root.addResource('users');
        const userId = users.addResource('{userId}');
        const files = userId.addResource('files');
        const fileName = files.addResource('{fileName}');
        const annotate = fileName.addResource('annotate');

        //TODO:Implement these method
        //userId.addMethod('GET', new cdk.aws_apigateway.LambdaIntegration(getUserByUserIdLambda));
        //files.addMethod('GET', new cdk.aws_apigateway.LambdaIntegration(getFilesByUserIdLambda));
        //存在可否がわかるように、URLを返す(なければ空文字)とかでもよいかも
        //fileName.addMethod('GET', new cdk.aws_apigateway.LambdaIntegration(getFileByFileIdLambda));
        //Upload FileはLambdaを介さないので、Lambdaとの紐付けはしなくてよい
        //これもLambdaなしで行けそう
        annotate.addMethod('GET', new cdk.aws_apigateway.LambdaIntegration(getAnnotateResultLambda),{authorizer:authorizer});
        annotate.addMethod('POST', new cdk.aws_apigateway.LambdaIntegration(requestAnnotateLambda),{authorizer:authorizer});

        //UploadはLambdaを使わなくても行けるらしい
        const integrationResponses = [{
            statusCode: '200',
        },
        {
            statusCode: '400',
            selectionPattern: "4\\d{2}",
            responseTemplates: {
                "application/json": '{ message: "Invalid request." }',
            },
        }, {
            statusCode: '500',
            selectionPattern: "5\\d{2}",
            responseTemplates: {
                "application/json": '{ message: "Internal server error." }',
            },
        }
        ]
        fileName.addMethod('PUT', new cdk.aws_apigateway.AwsIntegration({
            service: 's3',
            integrationHttpMethod: 'PUT',
            path: `${videoBucket.bucketName}/{folder}/{object}`,
            options: {
                credentialsRole: uploadRole,
                // S3のパスとAPIのリクエストパスを紐付ける
                requestParameters: {
                    'integration.request.header.Content-Type': 'method.request.header.Content-Type',
                    'integration.request.path.folder': 'method.request.path.userId',
                    'integration.request.path.object': 'method.request.path.fileName',
                },
                integrationResponses: integrationResponses,
            }
        }),
            {
                authorizer:authorizer,
                requestParameters: {
                    'method.request.header.Content-Type': true,
                    'method.request.path.userId': true,
                    'method.request.path.fileName': true,
                }
            }
        );
    }
}