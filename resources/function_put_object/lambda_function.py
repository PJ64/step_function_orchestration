import boto3, datetime, json,os
dt = datetime.datetime.today()

s3 = boto3.resource('s3')

def lambda_handler(event, context):
    return put_object(event)

def put_object(event):
    period = str(dt.year) + "/" + str(dt.month)
    accountid = event['order']['accountid']

    message = json.dumps(event)
    data = message.encode("utf-8")

    key = period + '/' + accountid + '.json'

    try:
        response = s3.Bucket(os.environ.get('BUCKETNAME')).put_object(
            Key=key, 
            Body=data,    
            Metadata={
                'accountid': accountid,
                'billingperiod': period
            },)
        return "SUCCEED"
    except:
        return "FAILED"