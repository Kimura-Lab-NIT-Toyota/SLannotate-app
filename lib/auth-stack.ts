import { Stack, aws_cognito, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
//ユーザー認証基盤のスタック
//MAU5万人まで無料、その後はだいたい200人ごとに1USD
export class CognitoAuthStack extends Stack {
    public readonly userPool: aws_cognito.UserPool;
    constructor(scope: any, id: string, props?: any) {
        super(scope, id, props);

        const userPool = new aws_cognito.UserPool(this, 'SLannotateUserPool', {
            userPoolName: 'SLannotateUserPool',
            selfSignUpEnabled: true,//ユーザーに自分で登録させるならT、IDPassをくばるならF
            accountRecovery: aws_cognito.AccountRecovery.EMAIL_ONLY,
            standardAttributes: {
                email: {
                    required: true,
                    mutable: true,//true場合emailアドレスの変更が可能
                },
            },
            autoVerify: { email: true },
            signInAliases: { email: true, username: true },
            removalPolicy: RemovalPolicy.DESTROY,//TODO:デプロイ時にユーザーをすべて削除。本番環境ではRETAINにしてください。
        });

        userPool.addClient("SLannotateUserPoolClient", {
            userPoolClientName: "SLannotateUserPoolClient",
            generateSecret: false,
            oAuth: {
                callbackUrls: ["https://d2guuix4ia1xx3.cloudfront.net/"],
                flows: {
                    implicitCodeGrant: true,
                    authorizationCodeGrant: true,
                },
                scopes: [
                    aws_cognito.OAuthScope.OPENID,
                ],
            },
            authFlows: {
                adminUserPassword: true,
                userSrp: true,
            },
        });

        userPool.addDomain("SLannotateUserPoolDomain", {
            cognitoDomain: {
                domainPrefix: "slannotate",
            },

        });
        //apiで参照できるように出力する
        this.userPool = userPool;
    }
}