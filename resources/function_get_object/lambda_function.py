import json
import boto3
import logging
import os
from botocore.exceptions import ClientError

logger = logging.getLogger()
s3_client = boto3.client('s3')

def lambda_handler(event, context):
    return get_object(event)

def get_object(event):
    queryParam = event["queryStringParameters"]
    try:
        key = queryParam["objectKey"] + '.json'
        response = s3_client.generate_presigned_url('get_object',
                                                    Params={'Bucket': os.environ.get('BUCKETNAME'),
                                                            'Key': key},
                                                    ExpiresIn=3600)
    except ClientError as e:
        logging.error(e)
        return None

    # The response contains the presigned URL
    return {
        'statusCode': 200,
        'headers': {
            "Content-Type": 'application/json',
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": 'Content-Type,X-Amz-Date,X-Api-Key',
            "Access-Control-Allow-Methods": "OPTIONS,POST"
        },
        'body': json.dumps(response)
    }