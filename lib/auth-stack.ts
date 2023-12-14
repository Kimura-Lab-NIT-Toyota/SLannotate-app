import { Stack, aws_cognito, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
//ユーザー認証基盤のスタック
//MAU5万人まで無料、その後はだいたい200人ごとに1USD
export class CognitoAuthStack extends Stack {
    public readonly userPool: aws_cognito.UserPool;
    constructor(scope: any, id: string, props?: any) {
        super(scope, id, props);

        const userPool = new aws_cognito.UserPool(this, 'SLannotateUserPool', {
            userPoolName: 'SLannotateUserPool',
            selfSignUpEnabled: false,//ユーザーに自分で登録させるならT、IDPassをくばるならF
            signInAliases: {username: true },//TODO:デプロイ時にユーザーをすべて削除。本番環境ではRETAINにしてください。
        });

        userPool.addClient("SLannotateUserPoolClient", {
            userPoolClientName: "SLannotateUserPoolClient",
            generateSecret: false,
            oAuth: {
                callbackUrls: ["https://d2guuix4ia1xx3.cloudfront.net/"],//TODO:これ昔のやつ。消さなくて動いてるし無理に消す必要ないけど、いらないのがあるのきもい。
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