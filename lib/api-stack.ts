import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy, StackProps, aws_cognito } from 'aws-cdk-lib';
import { Construct } from 'constructs';
//アプリケーションのAPIを管理するスタック。

interface apiProps extends StackProps {
    userPool: aws_cognito.UserPool;
    table: cdk.aws_dynamodb.Table;
}
export class SLannotateApiStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: apiProps) {
        super(scope, id, props);

        //アップロードされた動画を格納するバケット
        const videoBucket = new cdk.aws_s3.Bucket(this, "SLannotateVideoBucket", {
            removalPolicy: RemovalPolicy.DESTROY,
        });
        //APIからS3を触るためのロール作成
        const S3WriteDeleteRole = new cdk.aws_iam.Role(this, "SLannotateVideoBucketWDRole", {
            assumedBy: new cdk.aws_iam.ServicePrincipal("apigateway.amazonaws.com"),
            path: "/",
        })
        videoBucket.grantWrite(S3WriteDeleteRole);
        videoBucket.grantDelete(S3WriteDeleteRole);

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
            binaryMediaTypes: ['video/*'],
        });

        //LambdaとAPIの紐付け
        /* ~/users -
                    |- {userId} - GET:User details とりあえずいらないかも。(ユーザー情報をどうこうしようみたいな状況がない)
                    |    |- files - GET:List of files ✓
                    |    |    |- {fileName} - GET:File details ✓
                    |    |    |- {fileName} - PUT:Upload File ✓
                    |    |    |- {fileName} - DELETE:DELETE File  ✓
                    |    |    |    |- annotate - GET:Annotate result 
                    |    |    |    |- annotate - POST:Annotate request これもいらない(アップロード時にアノテートする)
        */
        //TOCONSIDER:アップロードしてアノテートしないことはないので、アップロードされたら暗黙的に(?)処理してもよいのではないか
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

        //動画の前処理の設定(MP4 to CSV, Record to DDB)
        const table = props.table;
        const videoPreprocessLambda = new cdk.aws_lambda.Function(this, 'videoPreprocess', {
            code: cdk.aws_lambda.Code.fromAsset('lib/lambdas/util/videoPreprocess'),
            runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            logRetention: cdk.aws_logs.RetentionDays.ONE_MONTH,
            timeout: cdk.Duration.seconds(300),
        });
        const DDBReadRole = new cdk.aws_iam.Role(this, 'SKabbitateDDBReadRoleForAPI', {
            assumedBy: new cdk.aws_iam.ServicePrincipal("apigateway.amazonaws.com"),
            path: "/",
        })
        table.grantReadData(DDBReadRole);
        table.grantReadWriteData(videoPreprocessLambda);
        videoBucket.addEventNotification(cdk.aws_s3.EventType.OBJECT_CREATED_PUT, new cdk.aws_s3_notifications.LambdaDestination(videoPreprocessLambda));


        const defaultIntegrationResponsesOfCORS = {
            'method.response.header.Access-Control-Allow-Headers':
                "'Content-Type,Authorization'",
            'method.response.header.Access-Control-Allow-Methods':
                "'OPTIONS,POST,PUT,GET,DELETE'",
            'method.response.header.Access-Control-Allow-Origin': "'*'",
        }

        const defaultMethodResponseParametersOfCORS = {
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Methods': true,
            'method.response.header.Access-Control-Allow-Origin': true,
        }
        //ここからAPIの各メソッド
        createGETFiles(files, DDBReadRole, defaultMethodResponseParametersOfCORS);

        createGETFileName(fileName, DDBReadRole, defaultMethodResponseParametersOfCORS);
        createPUTFileName(fileName, S3WriteDeleteRole, videoBucket, defaultIntegrationResponsesOfCORS, defaultMethodResponseParametersOfCORS);
        createDELETEFileName(fileName, S3WriteDeleteRole, videoBucket, defaultIntegrationResponsesOfCORS, defaultMethodResponseParametersOfCORS);

    }
}

function createGETFiles(resource: cdk.aws_apigateway.Resource, DDBoperateRole: cdk.aws_iam.Role, methodResponse: any) {
    const tableName = process.env.TableName || "video_details_table"
    resource.addMethod('GET', new cdk.aws_apigateway.AwsIntegration({
        service: 'dynamodb',
        action: 'Query',
        options: {
            credentialsRole: DDBoperateRole,
            requestTemplates: {
                'application/json': JSON.stringify({
                    "KeyConditionExpression": "user_id = :u",
                    "ExpressionAttributeValues": {
                        ":u": { "S": "$input.params('userId')" }
                    },
                    "TableName": `${tableName}`
                })
            },
            integrationResponses: [{
                statusCode: '200',
                responseTemplates: {//To remove attribute(like "S" or "N"), marshal with VTL.
                    'application/json': `
                    #set($input = $input.path('$'))
                    {
                        "videos":[
                            #foreach($elem in $input.Items){
                                "userId": "$elem.user_id.S",
                                "videoId": "$elem.video_id.S",
                                "status": "$elem.status.S",
                                "result": "$elem.result.L",
                            }#if($foreach.hasNext),#end
                            #end
                        ]
                    }`
                }
            }]
        }
    }), {
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
                responseParameters: methodResponse,
            },
            {
                statusCode: '500',
                responseParameters: methodResponse,
            }
        ]
    }
    )
}
function createGETFileName(fileName: cdk.aws_apigateway.Resource, DDBoperateRole: cdk.aws_iam.Role, methodResponse: any) {
    const tableName = process.env.TableName || "video_details_table"
    fileName.addMethod('GET', new cdk.aws_apigateway.AwsIntegration({
        service: 'dynamodb',
        action: 'GetItem',
        options: {
            credentialsRole: DDBoperateRole,
            requestTemplates: {
                'application/json': JSON.stringify({
                    "Key": {
                        "user_id": {
                            "S": "$input.params('userId')"
                        },
                        "video_id": {
                            "S": "$input.params('fileName')"
                        }
                    },
                    "TableName": `${tableName}`
                })
            },
            integrationResponses: [{
                statusCode: '200',
                responseTemplates: {
                    'application/json': `{
                        "status": "$input.path('$').Item.status.S",
                        "result": $input.path('$').Item.result.L,
                      }`
                }
            }]
        }
    }), {
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
                responseParameters: methodResponse,
            },
            {
                statusCode: '500',
                responseParameters: methodResponse,
            }
        ]
    }
    )
}
function createDELETEFileName(fileName: cdk.aws_apigateway.Resource, S3operateRole: cdk.aws_iam.Role, bucket: cdk.aws_s3.Bucket, integrationResponse: any, methodResponse: any) {
    fileName.addMethod('DELETE', new cdk.aws_apigateway.AwsIntegration({
        service: 's3',
        integrationHttpMethod: 'DELETE',
        path: `${bucket.bucketName}/{folder}/{object}`,
        options: {
            credentialsRole: S3operateRole,
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
                responseParameters: integrationResponse
            }, {
                statusCode: '500',
                selectionPattern: "5\\d{2}",
                responseParameters: integrationResponse
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
                    responseParameters: methodResponse,
                },
                {
                    statusCode: '500',
                    responseParameters: methodResponse,
                }
            ]
        },
    );
}

function createPUTFileName(fileName: cdk.aws_apigateway.Resource, S3operateRole: cdk.aws_iam.Role, bucket: cdk.aws_s3.Bucket, integrationResponse: any, methodResponse: any) {
    fileName.addMethod('PUT', new cdk.aws_apigateway.AwsIntegration({
        service: 's3',
        integrationHttpMethod: 'PUT',
        path: `${bucket.bucketName}/{folder}/{object}`,
        options: {
            credentialsRole: S3operateRole,
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
                responseParameters: integrationResponse
            }, {
                statusCode: '500',
                selectionPattern: "5\\d{2}",
                responseParameters: integrationResponse
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
                    responseParameters: methodResponse,
                },
                {
                    statusCode: '500',
                    responseParameters: methodResponse,
                }
            ]
        },
    );
}


function createLambda(stack: cdk.Stack, funcName: string): cdk.aws_lambda.Function {
    return new cdk.aws_lambda.Function(stack, funcName, {
        code: cdk.aws_lambda.Code.fromAsset(`lib/lambdas/api/${funcName}`),
        runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        logRetention: cdk.aws_logs.RetentionDays.ONE_MONTH,
        timeout: cdk.Duration.seconds(1),
    });
}