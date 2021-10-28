import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as StepFunctionOrchestration from '../lib/step_function_orchestration-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new StepFunctionOrchestration.StepFunctionOrchestrationStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
