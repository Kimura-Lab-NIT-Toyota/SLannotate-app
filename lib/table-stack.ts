import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class TableStack extends cdk.Stack {
    public readonly table : cdk.aws_dynamodb.Table;
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const table = new cdk.aws_dynamodb.Table(this, 'SLannotateTable', {
            partitionKey: {
                name: 'user_id',
                type: cdk.aws_dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'video_id',
                type: cdk.aws_dynamodb.AttributeType.STRING
            },
            tableName: 'video_details_table',
        });
        this.table = table;
    }
}
// (uploadした)user_id(string,PartitonKey), video_id(string,SortKey),result(list),status(string,SUCCEED/FAILED)