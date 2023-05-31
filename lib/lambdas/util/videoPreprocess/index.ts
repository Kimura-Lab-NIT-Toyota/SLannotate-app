import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
export const handler = function (event: any, context: any, callback: any) {
    const tableName = process.env.TABLE_NAME || 'video_details_table';
    const region = process.env.REGION || 'ap-northeast-1';

    const key = event.Records[0].s3.object.key;
    if (key.split('/').length != 2) {
        console.log("Process exited because invalid fileName or userName. Check if they doesn't include '/'");
        return;
    } else {
        const userId = key.split('/')[0];
        const fileName = key.split('/')[1];
        if (fileName.split('.')[1] != 'mp4') {
            console.log("Process exited because invalid MediaType. Check if it's .mp4");
            return;
        } 

        const ddbClient = new DynamoDBClient({ region: region });
        const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
        //TODO:Check if user exists. When not,skip it.
        const putItem = async ()=>{
            const params = {
                TableName: 'slannotate-user',
                Item:{
                    'user_id': userId,
                    'video_id': fileName,
                    'status': 'PROGRESS'
                }
            }
    
            try{
                const res = await ddbDocClient.send(new PutCommand(params));
                console.log(res);//TODO:Remove this line
            }catch(err){
                console.log(err);
            }
        }
        putItem();
    }
}

/*Example of event
{
    "Records": [
        {
            "eventVersion": "2.1",
            "eventSource": "aws:s3",
            "awsRegion": "ap-northeast-1",
            "eventTime": "2023-05-31T02:28:03.526Z",
            "eventName": "ObjectCreated:Put",
            "userIdentity": {
                "principalId": "AWS:AIDA3K6UAOSHM3WV7V3MQ"
            },
            "requestParameters": {
                "sourceIPAddress": "133.85.2.240"
            },
            "responseElements": {
                "x-amz-request-id": "S7DJPJ3C1K4E3W4M",
                "x-amz-id-2": "JgdFIkSQVH8Y23Q9pINdcWYs4LkpnnqJHZvufWdz+FnaiTyWhYg5586OZBF7if27xXz9dZbcYUedVdjF+K1EVkcXvukrnvrDAfAHWLVmzvA="
            },
            "s3": {
                "s3SchemaVersion": "1.0",
                "configurationId": "OTU2MzFlMzgtYTU3YS00ODczLTlhMjktOTI3NTgxYTkzNTQz",
                "bucket": {
                    "name": "slannotateapistack-slannotatevideobucket46a1b430-16saikpothbrt",
                    "ownerIdentity": {
                        "principalId": "AY7NYVEV6BYRD"
                    },
                    "arn": "arn:aws:s3:::slannotateapistack-slannotatevideobucket46a1b430-16saikpothbrt"
                },
                "object": {
                    "key": "usr1/mov_hts-samp003.mp4",
                    "size": 3858260,
                    "eTag": "080e5e0034183a548b0e7f7e80e86ff2",
                    "sequencer": "006476B0B36793B6DF"
                }
            }
        }
    ]
} 
*/