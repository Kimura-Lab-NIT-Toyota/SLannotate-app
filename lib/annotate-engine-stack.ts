//use ML model on lambda
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

interface engineProps extends cdk.StackProps{
    table: cdk.aws_dynamodb.Table;
    videoBucket: cdk.aws_s3.Bucket;
}
export class SLannotateEngineStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: engineProps) {
        super(scope, id, props);
        //動画の前処理の設定(動画アップロード時にDDBレコードを追加)
        const table = props.table;
        const videoBucket = props.videoBucket;

        const addRecordToDDBLambda = new cdk.aws_lambda.Function(this, 'SLannotate-addRecordToDDBLambda', {
            code: cdk.aws_lambda.Code.fromAsset('lib/lambdas/addRecordToDDB'),
            runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            logRetention: cdk.aws_logs.RetentionDays.ONE_MONTH,
            timeout: cdk.Duration.seconds(3),
        });

        const lambdaLayer = new cdk.aws_lambda.LayerVersion(this, 'SLannotate-annotateLambdaLayer', {
            code: cdk.aws_lambda.Code.fromAsset('lib/lambda_layer'),
            compatibleRuntimes: [cdk.aws_lambda.Runtime.PYTHON_3_10],
        });

        const annotateLambda = new cdk.aws_lambda.Function(this, 'SLannotate-annotateLambda', {
            code: cdk.aws_lambda.Code.fromAsset('lib/lambdas/annotate'),
            runtime:cdk.aws_lambda.Runtime.PYTHON_3_10,
            handler: 'index.handler',
            logRetention: cdk.aws_logs.RetentionDays.ONE_MONTH,
            layers: [lambdaLayer],
            timeout: cdk.Duration.seconds(3),
        });

        table.grantReadWriteData(addRecordToDDBLambda);
        videoBucket.grantReadWrite(annotateLambda);

        videoBucket.addEventNotification(cdk.aws_s3.EventType.OBJECT_CREATED_PUT, new cdk.aws_s3_notifications.LambdaDestination(addRecordToDDBLambda), { suffix: '.mp4' });
        videoBucket.addEventNotification(cdk.aws_s3.EventType.OBJECT_CREATED_PUT, new cdk.aws_s3_notifications.LambdaDestination(annotateLambda), { suffix: '.csv' });

    }
}
