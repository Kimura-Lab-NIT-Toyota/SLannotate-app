import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy, StackProps, aws_cognito } from 'aws-cdk-lib';
import { Construct } from 'constructs';
//アプリケーションのAPIを管理するスタック。

interface apiProps extends StackProps {//別スタックから読み込む値を定義
    userPool: aws_cognito.UserPool;
    table: cdk.aws_dynamodb.Table;
}
export class SLannotateApiStack extends cdk.Stack {
    public readonly videoBucket: cdk.aws_s3.Bucket;//別スタックから参照したい値をpublicで定義
    constructor(scope: Construct, id: string, props: apiProps) {//別スタックから読み込む値を引数に追加するため、apipropsを使う
        super(scope, id, props);

        //アップロードされた動画を格納するバケット
        const videoBucket = new cdk.aws_s3.Bucket(this, "SLannotateVideoBucket", {
            removalPolicy: RemovalPolicy.DESTROY,
        });
        this.videoBucket = videoBucket;
        const table = props.table;
        //APIからS3を触るためのロール作成
        const S3WriteDeleteRole = new cdk.aws_iam.Role(this, "SLannotateVideoBucketWDRole", {
            assumedBy: new cdk.aws_iam.ServicePrincipal("apigateway.amazonaws.com"),
            path: "/",
        })
        videoBucket.grantWrite(S3WriteDeleteRole);
        videoBucket.grantDelete(S3WriteDeleteRole);

        const S3ReadRole = new cdk.aws_iam.Role(this, "SLannotateVideoBucketReadRole", {
            assumedBy: new cdk.aws_iam.ServicePrincipal("apigateway.amazonaws.com"),
        });
        videoBucket.grantRead(S3ReadRole);

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
            binaryMediaTypes: ['*/*,'],
        });



        //動画の前処理+認識。本当はスタックに切り出したいけど、依存の関係でここに書いてしまう。(循環参照を生んでしまうため)
        const videoPreprocessLambda = new cdk.aws_lambda.Function(this, 'videoPreprocessLambda', {
            code: cdk.aws_lambda.Code.fromAsset('lib/lambdas/videoPreprocess'),
            runtime: cdk.aws_lambda.Runtime.PYTHON_3_10,
            handler: 'app.handler',
            logRetention: cdk.aws_logs.RetentionDays.ONE_MONTH,
            timeout: cdk.Duration.seconds(10),
        });

        table.grantWriteData(videoPreprocessLambda);
        //動画がアップロードされたら、動画の前処理を行うLambdaに投げる。DynamoDBへの記録、mp4→CSVの変換とかやってるはず。
        videoBucket.addEventNotification(cdk.aws_s3.EventType.OBJECT_CREATED_PUT, new cdk.aws_s3_notifications.LambdaDestination(videoPreprocessLambda), { suffix: '.mp4' });


        //推論を行うLambda
         //FIXME:このLambdaのデプロイはメチャメチャ遅い。APIの変更を加えるために本筋でないこいつに時間取られるのは辛いので、なんとか切り出したい。
        const annotateLambda = new cdk.aws_lambda.DockerImageFunction(this, 'annotateLambdaFromDockerImage', {
            code: cdk.aws_lambda.DockerImageCode.fromImageAsset('lib/lambdas/annotate/'),
            timeout: cdk.Duration.seconds(60),
            memorySize: 1024,
        });


        //Lambdaに推論結果を格納するDynamoDBへのアクセス権限を与え、S3にCSVがアップロードされる(=前処理が終わる)と、推論を行う設定。
        table.grantWriteData(annotateLambda);
        videoBucket.grantRead(annotateLambda);
        videoBucket.addEventNotification(cdk.aws_s3.EventType.OBJECT_CREATED_PUT, new cdk.aws_s3_notifications.LambdaDestination(annotateLambda), { suffix: '.csv' });

        //動画の処理ここまで

        //API本編
        /* ~/users -
                            |- {userId} - GET:User details とりあえずいらないかも。(ユーザー情報をどうこうしようみたいな状況がない)
                            |    |- files - GET:List of files ✓
                            |    |    |- {fileName} - GET:File details ✓
                            |    |    |- {fileName} - PUT:Update Annotation result ✓
                            |    |    |- {fileName} - DELETE:DELETE File  ✓
                            |    |    | - blob - PUT: Upload File ✓
                            |    |    | - blob - GET: Fetch File  ✓
        */

        const DDBReadRole = new cdk.aws_iam.Role(this, 'SLannotateDDBReadRoleForAPI', {
            assumedBy: new cdk.aws_iam.ServicePrincipal("apigateway.amazonaws.com"),
            path: "/",
        })

        const DDBWriteRole = new cdk.aws_iam.Role(this, 'SLannotateDDBRWRoleForAPI', {
            assumedBy: new cdk.aws_iam.ServicePrincipal("apigateway.amazonaws.com"),
        });
        table.grantReadData(DDBReadRole);
        table.grantWriteData(DDBWriteRole);


        //CORSの設定。Originの異なるサイトからアクセスするとき必要で、今回のユースケースでは常に必要。。
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
        //resources
        const users = api.root.addResource('users');// /users
        const userId = users.addResource('{userId}');// /users/{userId}
        const files = userId.addResource('files'); // /users/{userId}/files
        createGETFiles(files, DDBReadRole, defaultIntegrationResponsesOfCORS, defaultMethodResponseParametersOfCORS);

        const fileName = files.addResource('{fileName}'); // /users/{userId}/files/{fileName}
        //FIXME 殆どVTLで書かれているけど、メンテしづらい&デバッグしづらいといいことがないので、Lambdaで書いたほうが良い。
        createGETFileName(fileName, DDBReadRole, defaultIntegrationResponsesOfCORS, defaultMethodResponseParametersOfCORS);
        createPUTFileName(fileName, DDBWriteRole, videoBucket, defaultIntegrationResponsesOfCORS, defaultMethodResponseParametersOfCORS);
        createDELETEFileName(fileName, S3WriteDeleteRole, videoBucket, defaultIntegrationResponsesOfCORS, defaultMethodResponseParametersOfCORS);

        const fileBlob = fileName.addResource('blob'); // /users/{userId}/files/{fileName}/blob
        createPUTFileBlob(fileBlob, S3WriteDeleteRole, videoBucket, defaultIntegrationResponsesOfCORS, defaultMethodResponseParametersOfCORS);
        createGETFileBlob(fileBlob, S3ReadRole, videoBucket, defaultIntegrationResponsesOfCORS, defaultMethodResponseParametersOfCORS);

    }
}

//TODO:ページネーションしてない。デフォルトの上限が何個か知らないが、ある程度多いし過去の動画見れなくてもそう困らないので実装してない。
//一定以上ファイルが増えると見れなくなるので、余裕があればやっておくとよい。nextTokenを出すようにするだけのはず。
function createGETFiles(resource: cdk.aws_apigateway.Resource, DDBoperateRole: cdk.aws_iam.Role, integrationResponse: any, methodResponse: any) {
    const tableName = process.env.TABLE_NAME || "video_details_table"
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
                responseTemplates: {//To remove attribute(like "S" or "N"), marshal with VTL.VTL is shit,so should replace
                //NOTE:#if($foreach.hasNext),#endの部分は、"if foreach has next items output ',' otherwise do nothing."という意味。
                //つまり、配列の区切りとしてカンマをつけ、最後の要素の後ろにはカンマをつけないようにするためのもの。
                //VTL本当に辛いのでASAPでLambdaに変えると良いです。時間無いのでやってませんが。
                    'application/json': `
                    #set($input = $input.path('$'))
                    {
                        "videos":[
                            #foreach($elem in $input.Items){
                                "userId": "$elem.user_id.S",
                                "videoId": "$elem.video_id.S",
                                "status": "$elem.status.S",
                                "proposed": "$elem.proposed.L",
                                "result": [
                                    #foreach($r in $elem.result.L)
                                        "$r.S"
                                    #if($foreach.hasNext),#end
                                    #end
                                ] 
                            }#if($foreach.hasNext),#end
                            #end
                        ]
                    }`
                },
                responseParameters: integrationResponse
            }]
        }
    }), {
        methodResponses: [
            {
                statusCode: '200',
                responseParameters: methodResponse
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
function createGETFileName(fileName: cdk.aws_apigateway.Resource, DDBoperateRole: cdk.aws_iam.Role, integrationResponse: any, methodResponse: any) {
    const tableName = process.env.TABLE_NAME || "video_details_table"
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
                        "proposed": $input.path('$').Item.proposed.L,
                      }`
                },
                responseParameters: integrationResponse
            }]
        }
    }), {
        methodResponses: [
            {
                statusCode: '200',
                responseParameters: methodResponse
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

function createPUTFileName(fileName: cdk.aws_apigateway.Resource, DDBoperateRole: cdk.aws_iam.Role, bucket: cdk.aws_s3.Bucket, integrationResponse: any, methodResponse: any) {
    const tableName = process.env.TABLE_NAME || "video_details_table"
    fileName.addMethod('PUT', new cdk.aws_apigateway.AwsIntegration({
        service: 'dynamodb',
        action: 'UpdateItem',
        options: {
            credentialsRole: DDBoperateRole,
            requestTemplates: {
                //VTL(#foreachみたいなやつ)を書くとJSONの形式でなくなるので、JSON.stringifyは使えない。
                'application/json': `{
                    "Key": {
                        "user_id": {
                            "S": "$input.params('userId')"
                        },
                        "video_id": {
                            "S": "$input.params('fileName')"
                        }},
                    "TableName": "${tableName}",
                    
                    "UpdateExpression": "SET #result = :result",
                    "ExpressionAttributeNames": {
                        "#result": "result"
                    },
                    "ExpressionAttributeValues": {
                        ":result": {
                            "L": [
                                #foreach($elem in $input.path('$.result'))
                                {"S": "$elem"}
                                #if($foreach.hasNext),#end
                                #end
                            ]
                        }
                        }
                }`
            },
            integrationResponses: [{
                statusCode: '200',
                //FIXME:resultが正しく出力されていない。
                responseTemplates: {
                    'application/json': `{
                        "status": "success",
                        "message": "Annotation result updated successfully",
                        "result": $input.path('$.result')
                    }`
                },
                responseParameters: integrationResponse
            },
            {
                statusCode: '400',
                responseTemplates: {
                    'application/json': `{
                        "status": "error",
                        "message": "Bad Request"
                }`
            },
            }
        ]
        }
    }), {
        methodResponses: [
            {
                statusCode: '200',
                responseParameters: methodResponse
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
    );
}

function createDELETEFileName(fileName: cdk.aws_apigateway.Resource, S3operateRole: cdk.aws_iam.Role, bucket: cdk.aws_s3.Bucket, integrationResponse: any, methodResponse: any) {
    fileName.addMethod('DELETE', new cdk.aws_apigateway.AwsIntegration({
        service: 's3',
        integrationHttpMethod: 'DELETE',
        path: `${bucket.bucketName}/{folder}/video/{object}`,
        options: {
            credentialsRole: S3operateRole,
            requestParameters: {
                'integration.request.header.Content-Type': 'method.request.header.Content-Type',
                'integration.request.path.folder': 'method.request.path.userId',
                'integration.request.path.object': 'method.request.path.fileName',
            },
            integrationResponses: [{
                statusCode: '200',
                responseParameters: integrationResponse
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
                    responseParameters: methodResponse
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

function createGETFileBlob(fileBlob: cdk.aws_apigateway.Resource, S3operateRole: cdk.aws_iam.Role, bucket: cdk.aws_s3.Bucket, integrationResponse: any, methodResponse: any) {
    fileBlob.addMethod('GET', new cdk.aws_apigateway.AwsIntegration({
        service: 's3',
        integrationHttpMethod: 'GET',
        path: `${bucket.bucketName}/{folder}/video/{object}`,
        options: {
            credentialsRole: S3operateRole,
            requestParameters: {
                'integration.request.header.Content-Type': 'method.request.header.Content-Type',
                'integration.request.path.folder': 'method.request.path.userId',
                'integration.request.path.object': 'method.request.path.fileName',

            },
            integrationResponses: [{
                statusCode: '200',
                responseParameters: integrationResponse
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
                    responseParameters: methodResponse
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

function createPUTFileBlob(fileBlob: cdk.aws_apigateway.Resource, S3operateRole: cdk.aws_iam.Role, bucket: cdk.aws_s3.Bucket, integrationResponse: any, methodResponse: any) {
    fileBlob.addMethod('PUT', new cdk.aws_apigateway.AwsIntegration({
        service: 's3',
        integrationHttpMethod: 'PUT',
        path: `${bucket.bucketName}/{folder}/video/{object}`,
        options: {
            credentialsRole: S3operateRole,
            requestParameters: {
                'integration.request.header.Content-Type': 'method.request.header.Content-Type',
                'integration.request.path.folder': 'method.request.path.userId',
                'integration.request.path.object': 'method.request.path.fileName',

            },
            integrationResponses: [{
                statusCode: '200',
                responseParameters: integrationResponse
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
                    responseParameters: methodResponse
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