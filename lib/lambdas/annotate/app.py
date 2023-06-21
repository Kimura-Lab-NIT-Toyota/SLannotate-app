import boto3
import codecs
from dlutil.detector import KimlabSignLanguagePredict
from dlutil.detector import from_csv, to_csv
def handler(event,context):
    print("starting...")
    # load csv from S3
    s3 = boto3.resource('s3')
    bucket = s3.Bucket(event.Records[0].s3.bucket.name)
    obj = bucket.Object(event.Records[0].s3.object.key)
    response = obj.get()    
    print(response.Body.read())
    # process
    predictor = KimlabSignLanguagePredict.setup(
        "./model/t18.pth",
        "./model//KSLD1.9.static.pkl"
    )
    output = None
    predictor.process(from_csv(response.Body,encoding=codecs.BOM_UTF8),output)
    #TODO: save output to DDB
    print(output)
    return output