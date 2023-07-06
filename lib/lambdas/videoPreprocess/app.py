import boto3
import urllib.parse
import os
def handler(event,context):
    S3_key = urllib.parse.unquote(event['Records'][0]['s3']['object']['key'])
    if len(S3_key.split('/')) != 3:
        #このケースの場合リトライしても自明に失敗するので、ログだけだして終了する
        print("recieved invalid format S3 key ")
        print("Got: %s, want:{user_name}/CSV/{file_name}" % S3_key)
    else:
        user_id = S3_key.split('/')[0]
        ddb = boto3.client('dynamodb', region_name="ap-northeast-1")
        table_name = os.getenv('TABLE_NAME', 'video_details_table')

        options = {
            'TableName': table_name,
            'Item':{
               'user_id':{'S':user_id },
               'video_id':{'S': S3_key },
               'status':{'S':'FAILED' },
            }
        }
        ddb.put_item(**options)
        #TODO:convert movie and store csv.

def mp4_to_csv():
    print("convert success!")