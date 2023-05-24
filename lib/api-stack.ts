import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy, StackProps, aws_cognito } from 'aws-cdk-lib';
import { Construct } from 'constructs';
//アプリケーションのAPIを管理するスタック。

interface apiProps extends StackProps {
    userPool: aws_cognito.UserPool;
}
export class SLannotateApiStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: apiProps) {
        super(scope, id, props);

        //アップロードされた動画を格納するバケット
        const videoBucket = new cdk.aws_s3.Bucket(this, "SLannotateVideoBucket", {
            removalPolicy: RemovalPolicy.DESTROY,
        });
        //APIからS3を触るためのロール作成
        const S3Role = new cdk.aws_iam.Role(this, "SLannotateVideoBucketUploadRole", {
            assumedBy: new cdk.aws_iam.ServicePrincipal("apigateway.amazonaws.com"),
            path: "/",
        })
        videoBucket.grantWrite(S3Role);
        videoBucket.grantDelete(S3Role);

        //API作成
        //authorizerを作成(auth-stackで作成したUserPoolを呼び出す)
        const userPool = props.userPool;
        const authorizer = new cdk.aws_apigateway.CognitoUserPoolsAuthorizer(this, 'SLannotateApiAuthorizer', {
            cognitoUserPools: [userPool],
        });

        const api = new cdk.aws_apigateway.RestApi(this, 'SLannotateApi', {
            cloudWatchRole: true,
            restApiName: 'SLannotateApi',
            description: 'SLannotate API',
            defaultMethodOptions: {
                authorizer,
            },
            deployOptions: {
                dataTraceEnabled: true,
                loggingLevel: cdk.aws_apigateway.MethodLoggingLevel.INFO
            },
            defaultCorsPreflightOptions: {
                allowOrigins: cdk.aws_apigateway.Cors.ALL_ORIGINS,
                allowMethods: cdk.aws_apigateway.Cors.ALL_METHODS,
                allowHeaders: cdk.aws_apigateway.Cors.DEFAULT_HEADERS,
                statusCode: 200,
            },
            binaryMediaTypes: ['*/*'],
        });

        //LambdaとAPIの紐付け
        /* ~/users -
                    |- {userId} - GET:User details
                    |    |- files - GET:List of files
                    |    |    |- {fileName} - GET:File details
                    |    |    |- {fileName} - PUT:Upload File 
                    |    |    |    |- annotate - GET:Annotate result
                    |    |    |    |- annotate - POST:Annotate request
        */
    
        const users = api.root.addResource('users');
        const userId = users.addResource('{userId}');
        const files = userId.addResource('files');
        const fileName = files.addResource('{fileName}');
        const annotate = fileName.addResource('annotate');

        //TODO:Implement these methods
        //userId.addMethod('GET', new cdk.aws_apigateway.LambdaIntegration(getUserByUserIdLambda));
        //files.addMethod('GET', new cdk.aws_apigateway.LambdaIntegration(getFilesByUserIdLambda));
        //存在可否がわかるように、URLを返す(なければ空文字)とかでもよいかも
        //fileName.addMethod('GET', new cdk.aws_apigateway.LambdaIntegration(getFileByFileIdLambda));
        //Upload FileはLambdaを介さないので、Lambdaとの紐付けはしなくてよい
        //これもLambdaなしで行けそう

        // lambdas/api/${funcName}のソースを使うので、funcNameはソースのフォルダ名と一致させる必要がある
        const getAnnotateResultLambda = createLambda(this, 'getAnnotateResult');
        const requestAnnotateLambda = createLambda(this, 'requestAnnotate');

        annotate.addMethod('GET', new cdk.aws_apigateway.LambdaIntegration(getAnnotateResultLambda));
        annotate.addMethod('POST', new cdk.aws_apigateway.LambdaIntegration(requestAnnotateLambda));

        const defaultIntegrationResponsesOfCORS = {
            'method.response.header.Access-Control-Allow-Headers':
                "'Content-Type,Authorization'",
            'method.response.header.Access-Control-Allow-Methods':
                "'OPTIONS,POST,PUT,GET,DELETE'",
            'method.response.header.Access-Control-Allow-Origin': "'*'",
        }

        const defaultResponseParametersOfCORS = {
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Methods': true,
            'method.response.header.Access-Control-Allow-Origin': true,
        }
        //UploadはLambdaを使わなくても行けるらしい
        fileName.addMethod('PUT', new cdk.aws_apigateway.AwsIntegration({
            service: 's3',
            integrationHttpMethod: 'PUT',
            path: `${videoBucket.bucketName}/{folder}/{object}`,
            options: {
                credentialsRole: S3Role,
                // S3のパスとAPIのリクエストパスを紐付ける
                requestParameters: {
                    'integration.request.header.Content-Type': 'method.request.header.Content-Type',
                    'integration.request.path.folder': 'method.request.path.userId',
                    'integration.request.path.object': 'method.request.path.fileName',
                },
                integrationResponses: [{
                    statusCode: '200',
                    responseParameters: {
                        'method.response.header.Content-Type': 'integration.response.header.Content-Type',
                        'method.response.header.Access-Control-Allow-Headers':
                            "'Content-Type,Authorization'",
                        'method.response.header.Access-Control-Allow-Methods':
                            "'OPTIONS,POST,PUT,GET,DELETE'",
                        'method.response.header.Access-Control-Allow-Origin': "'*'",
                    }
                },
                {
                    statusCode: '400',
                    selectionPattern: "4\\d{2}",
                    responseParameters: defaultIntegrationResponsesOfCORS
                }, {
                    statusCode: '500',
                    selectionPattern: "5\\d{2}",
                    responseParameters: defaultIntegrationResponsesOfCORS
                }
                ],
            }
        }),
            {
                requestParameters: {
                    'method.request.header.Content-Type': true,
                    'method.request.path.userId': true,
                    'method.request.path.fileName': true,
                },
                methodResponses: [
                    {
                        statusCode: '200',
                        responseParameters: {
                            'method.response.header.Content-Type': true,
                            'method.response.header.Access-Control-Allow-Headers': true,
                            'method.response.header.Access-Control-Allow-Methods': true,
                            'method.response.header.Access-Control-Allow-Origin': true,
                        }
                    },
                    {
                        statusCode: '400',
                        responseParameters: defaultResponseParametersOfCORS,
                    },
                    {
                        statusCode: '500',
                        responseParameters: defaultResponseParametersOfCORS,
                    }
                ]
            },
        );

        fileName.addMethod('DELETE', new cdk.aws_apigateway.AwsIntegration({
            service: 's3',
            integrationHttpMethod: 'DELETE',
            path: `${videoBucket.bucketName}/{folder}/{object}`,
            options: {
                credentialsRole: S3Role,
                requestParameters: {
                    'integration.request.header.Content-Type': 'method.request.header.Content-Type',
                    'integration.request.path.folder': 'method.request.path.userId',
                    'integration.request.path.object': 'method.request.path.fileName',
                },
                integrationResponses: [{
                    statusCode: '200',
                    responseParameters: {
                        'method.response.header.Content-Type': 'integration.response.header.Content-Type',
                        'method.response.header.Access-Control-Allow-Headers':
                            "'Content-Type,Authorization'",
                        'method.response.header.Access-Control-Allow-Methods':
                            "'OPTIONS,POST,PUT,GET,DELETE'",
                        'method.response.header.Access-Control-Allow-Origin': "'*'",
                    }
                },
                {
                    statusCode: '400',
                    selectionPattern: "4\\d{2}",
                    responseParameters: defaultIntegrationResponsesOfCORS
                }, {
                    statusCode: '500',
                    selectionPattern: "5\\d{2}",
                    responseParameters: defaultIntegrationResponsesOfCORS
                }
                ],
            }
        }),
            {
                requestParameters: {
                    'method.request.header.Content-Type': true,
                    'method.request.path.userId': true,
                    'method.request.path.fileName': true,
                },
                methodResponses: [
                    {
                        statusCode: '200',
                        responseParameters: {
                            'method.response.header.Content-Type': true,
                            'method.response.header.Access-Control-Allow-Headers': true,
                            'method.response.header.Access-Control-Allow-Methods': true,
                            'method.response.header.Access-Control-Allow-Origin': true,
                        }
                    },
                    {
                        statusCode: '400',
                        responseParameters: defaultResponseParametersOfCORS,
                    },
                    {
                        statusCode: '500',
                        responseParameters: defaultResponseParametersOfCORS,
                    }
                ]
            },
        );
    }
}

function createLambda(stack: cdk.Stack, funcName: string): cdk.aws_lambda.Function {
    return new cdk.aws_lambda.Function(stack, funcName, {
        code: cdk.aws_lambda.Code.fromAsset(`lib/lambdas/api/${funcName}`),
        runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        timeout: cdk.Duration.seconds(300),
    });

}