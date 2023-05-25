import { App, Stack } from "aws-cdk-lib"
import { Template } from "aws-cdk-lib/assertions"
test("Snapshot testing for Auth stack", () => {
    const app = new App();
    const auth = new Stack(app,"CognitoAuthStack");
    const template = Template.fromStack(auth);
    expect(template.toJSON()).toMatchSnapshot();
})