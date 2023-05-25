import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class TableStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const table = new cdk.aws_dynamodb.Table(this, 'Table', {
            partitionKey: {
                name: 'user_id',
                type: cdk.aws_dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'video_id',
                type: cdk.aws_dynamodb.AttributeType.NUMBER
            },
            tableName: 'video_details_table',
        });

    }
}
// (uploadした)user_id(string,PartitonKey), video_id(string,SortKey),result(list),status(string,SUCCEED/FAILED)