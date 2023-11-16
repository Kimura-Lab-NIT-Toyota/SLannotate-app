import boto3
import os
from dlutil.detector import KimlabSignLanguagePredict
from dlutil.detector import from_csv
import urllib.parse
import io


def handler(event, context):
    print("starting...")
    # load csv from S3
    s3 = boto3.resource('s3')
    print(event)
    bucket = s3.Bucket(urllib.parse.unquote(
        event['Records'][0]['s3']['bucket']['name']))
    key = urllib.parse.unquote(event['Records'][0]['s3']['object']['key'])
    if len(key.split('/')) != 3:
        print("recieved invalid format S3 key ")
        print("Got: %s, want:{user_name}/CSV/{file_name}" % key)
        return
    obj = bucket.Object(key)

    response = obj.get()
    # process
    predictor = KimlabSignLanguagePredict.setup(
        "models/t18.pth",
        "models/KSLD1.9.static.pkl"
    )
    output = predictor.process(from_csv(io.StringIO(
        response["Body"].read().decode('utf-8')), skip_header=1))

    # 本当はclientを使うべきだが、listの扱いが面倒なのでresourceを使う。
    ddb = boto3.resource('dynamodb', region_name="ap-northeast-1")
    table_name = os.getenv('TABLE_NAME', 'video_details_table')
    table = ddb.Table(table_name)
    table.update_item(
        Key={
            # partition key
            'user_id': key.split('/')[0],
            # sort key
            'video_id':  key
        },
        UpdateExpression='SET #status = :status, proposed = :proposed, #result = :result',
        ExpressionAttributeNames={
            '#status': 'status',
            '#result': 'result',
            '#proposed' : 'proposed'
        },
        ExpressionAttributeValues={
            ':status': 'UNVERIFIED',
            ':proposed': output.tolist(),
            ':result': 'result is here' #TODO 候補の一覧から一番可能性の高いものを選んで暫定的な解とする
        })

    # TODO: save output to DDB,overwrite annnotate status to 'SUCCESS'
    print(output)
    return
