import { Duration, RemovalPolicy, Construct, Stack, StackProps } from '@aws-cdk/core';
import { ManagedPolicy, Role, PolicyStatement, ServicePrincipal, Policy, Effect } from '@aws-cdk/aws-iam';
import { Function, Runtime, Code, Tracing } from '@aws-cdk/aws-lambda';
import { RestApi, LambdaIntegration, AwsIntegration } from '@aws-cdk/aws-apigateway';
import { Bucket } from '@aws-cdk/aws-s3';
import { Choice, Fail, Succeed, Condition, StateMachine } from '@aws-cdk/aws-stepfunctions';
import { LambdaInvoke, SnsPublish } from '@aws-cdk/aws-stepfunctions-tasks';
import { Table, AttributeType } from '@aws-cdk/aws-dynamodb';
import { Topic } from '@aws-cdk/aws-sns';

export class StepFunctionOrchestrationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    //create sns topic
    const sns_topic = new Topic(this, "sns_topic", {
      topicName: "step_function_orchestration_topic",
      displayName: "lambda_api_topistep_function_orchestration_topic"
    })

    //S3 bucket
    const bucket = new Bucket(this, 'step_function_orchestration_bucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    //Create DynamoDB table
    const dynamoTable = new Table(this, "DynamoDBTable", {
      partitionKey: {
        name: 'accountid',
        type: AttributeType.STRING
      },
      sortKey: {
        name: 'vendorid',
        type: AttributeType.STRING
      },
      tableName: 'step_function_orchestration',
      removalPolicy: RemovalPolicy.DESTROY
    });

    //IAM Roles and Policies
    const role_lambda_put_object = new Role(this, 'PolicyStatement', {
      roleName: 'step_function_orchestration_lambda_put_object',
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ]
    });
    role_lambda_put_object.addToPolicy(new PolicyStatement({
      resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
      actions: ['s3:PutObject'],
    }));

    const role_lambda_get_object = new Role(this, 'role_lambda_get_object', {
      roleName: 'step_function_orchestration_lambda_get_object',
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ]
    });
    role_lambda_get_object.addToPolicy(new PolicyStatement({
      resources: [bucket.bucketArn, bucket.bucketArn + "/*"],
      actions: ['s3:GetObject']
    }));

    const role_lambda_put_item = new Role(this, 'role_lambda_put_item', {
      roleName: 'step_function_orchestration_put_item',
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ]
    });
    role_lambda_put_item.addToPolicy(new PolicyStatement({
      resources: [dynamoTable.tableArn],
      actions: ["dynamodb:PutItem"],
    }));

    const role_lambda_get_item = new Role(this, 'role_lambda_get_item', {
      roleName: 'step_function_orchestration_get_item',
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ]
    });
    role_lambda_get_item.addToPolicy(new PolicyStatement({
      resources: [dynamoTable.tableArn],
      actions: ["dynamodb:GetItem"],
    }));

    const role_api = new Role(this, 'role_api', {
      roleName: 'step_function_orchestration_api',
      assumedBy: new ServicePrincipal('apigateway.amazonaws.com')
    });

    //Lambda Functions
    const lambda_put_object = new Function(this, "lambda_put_object", {
      runtime: Runtime.PYTHON_3_8,
      code: Code.fromAsset("resources/function_put_object"),
      handler: "lambda_function.lambda_handler",
      functionName: "step_function_orchestration_put_object",
      tracing: Tracing.ACTIVE,
      role: role_lambda_put_object,
      environment: {
        'BUCKETNAME': bucket.bucketName
      }
    });

    const lambda_get_object = new Function(this, "lambda_get_object", {
      runtime: Runtime.PYTHON_3_8,
      code: Code.fromAsset("resources/function_get_object"),
      handler: "lambda_function.lambda_handler",
      functionName: "step_function_orchestration_get_object",
      tracing: Tracing.ACTIVE,
      role: role_lambda_get_object,
      environment: {
        'BUCKETNAME': bucket.bucketName,
      }
    });

    const lambda_put_item = new Function(this, "lambda_put_item", {
      runtime: Runtime.PYTHON_3_8,
      code: Code.fromAsset("resources/function_put_item"),
      handler: "lambda_function.lambda_handler",
      functionName: "step_function_orchestration_put_item",
      tracing: Tracing.ACTIVE,
      role: role_lambda_put_item,
      environment: {
        'TABLENAME': dynamoTable.tableName
      }
    });

    const lambda_get_item = new Function(this, "lambda_get_item", {
      runtime: Runtime.PYTHON_3_7,
      handler: "lambda_function.lambda_handler",
      code: Code.fromAsset("resources/function_get_item"),
      functionName: "step_function_orchestration_get_item",
      role: role_lambda_get_item,
      environment: {
        'TABLENAME': dynamoTable.tableName,
      }
    });


    //Step function
    const role_statemachine = new Role(this, 'role_statemachine', {
      roleName: 'step_function_orchestration_statemachine',
      assumedBy: new ServicePrincipal('states.amazonaws.com'),
    });
    role_statemachine.addToPolicy(new PolicyStatement({
      resources: [lambda_put_item.functionArn, lambda_put_object.functionArn,sns_topic.topicArn],
      actions: ['lambda:InvokeFunction','sns:Publish'],
    }));

    const task_put_item = new LambdaInvoke(this, 'task_put_item', {
      lambdaFunction: lambda_put_item,
      outputPath: '$.Payload',
    });

    const task_put_object = new LambdaInvoke(this, 'task_put_object', {
      lambdaFunction: lambda_put_object,
      outputPath: '$.Payload',
    });

    const task_put_item_choice = new Choice(this, "task_put_item_choice");

    const jobFailed = new Fail(this, 'Job Failed', {
      cause: 'Place order failed',
      error: 'DescribeJob returned FAILED',
    });

    const jobSucceeded = new Succeed(this, 'Job Succeeded');

    const definition = task_put_item
      .next(task_put_item_choice
        .when(Condition.stringEquals("$", "FAILED"), jobFailed)
        .otherwise(task_put_object
          .next(jobSucceeded)));

    const statemachine = new StateMachine(this, 'StateMachine', {
      definition,
      timeout: Duration.minutes(5),
      stateMachineName: 'step_function_orchestration',
      role: role_statemachine
    });

    //ApiGateway
    role_api.attachInlinePolicy(
      new Policy(this, "apipolicy", {
        statements: [
          new PolicyStatement({
            actions: ["states:StartExecution"],
            effect: Effect.ALLOW,
            resources: [statemachine.stateMachineArn],
          }),
        ],
      })
    );

    const api = new RestApi(this, "apigw", {
      restApiName: "step_function_orchestration",
      description: "This service serves the step function orchestration demonstration"
    });
    const api_order_resource = api.root.addResource("order");
    const api_invoice_resource = api.root.addResource("invoice");

    var lambda_get_item_integration = new LambdaIntegration(lambda_get_item);
    var lambda_get_object_integration = new LambdaIntegration(lambda_get_object);

    api_order_resource.addMethod("GET", lambda_get_item_integration);
    api_order_resource.addMethod("POST", new AwsIntegration({
      service: "states",
      action: "StartExecution",
      integrationHttpMethod: "POST",
      options: {
        credentialsRole: role_api,
        integrationResponses: [
          {
            statusCode: "200",
            responseTemplates: {
              "application/json": `{"done": true}`,
            },
          },
        ],
        requestTemplates: {
          "application/json": `{
            "input": "$util.escapeJavaScript($input.json('$'))",
            "stateMachineArn":"` + statemachine.stateMachineArn + `"
          }`,
        },
      },
    }),
      {
        methodResponses: [{ statusCode: "200" }],
      });
    api_invoice_resource.addMethod("GET", lambda_get_object_integration);
  }
}
