import boto3
import codecs
from dlutil.detector import KimlabSignLanguagePredict
from dlutil.detector import from_csv
import urllib.parse
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
    print(response['Body'].read())
    # process
    predictor = KimlabSignLanguagePredict.setup(
        "models/t18.pth",
        "models/KSLD1.9.static.pkl"
    )
    output = None
    predictor.process(from_csv(response["Body"],encoding=codecs.BOM_UTF8),output)
    #TODO: save output to DDB
    print(output)
    return output