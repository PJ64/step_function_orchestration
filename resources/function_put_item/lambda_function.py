from __future__ import print_function
import boto3, os

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ.get('TABLENAME'))

def lambda_handler(event, context):
    return put_item(event)
    
def put_item(event):
    print(event)
    jsondata = event

    try:
        response = table.put_item(
            Item={
                'accountid': jsondata['order']['accountid'],
                'vendorid': jsondata['order']["vendorid"],
                'orderdate':jsondata['order']["orderdate"],
                'city':jsondata['order']["city"],
                'details':{
                    'coffeetype': jsondata['order']['details']['coffeetype'],
                    'coffeesize': jsondata['order']['details']["coffeesize"],
                    'unitprice': jsondata['order']['details']["unitprice"],
                    'quantity': jsondata['order']['details']["quantity"]
                },
            })
        return event
    except:
        return "FAILED"
    