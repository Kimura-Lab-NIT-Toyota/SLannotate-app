import boto3
from dlutil.detector import KimlabSignLanguagePredict
from dlutil.detector import from_csv
import urllib.parse
import io
def handler(event,context):
    print("starting...")
    # load csv from S3
    s3 = boto3.resource('s3')
    print(event)
    bucket = s3.Bucket(urllib.parse.unquote(event['Records'][0]['s3']['bucket']['name']))
    obj = bucket.Object(urllib.parse.unquote(event['Records'][0]['s3']['object']['key']))
    print(urllib.parse.unquote(event['Records'][0]['s3']['bucket']['name']))
    print(urllib.parse.unquote(event['Records'][0]['s3']['object']['key']))
    response = obj.get()
    # process
    predictor = KimlabSignLanguagePredict.setup(
        "models/t18.pth",
        "models/KSLD1.9.static.pkl"
    )
    output = predictor.process(from_csv(io.StringIO(response["Body"].read().decode('utf-8')),skip_header=1))
    #TODO: save output to DDB
    print(output)
    return 