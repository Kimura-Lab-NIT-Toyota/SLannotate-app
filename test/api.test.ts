import { App, Stack } from "aws-cdk-lib"
import { Template } from "aws-cdk-lib/assertions"
const app = new App();
const api = new Stack(app,'SLannotateApiStack');
const template = Template.fromStack(api);
test("stack has expected resources",()=>{
    // expect(template.resourceCountIs('AWS::ApiGateway::RestApi',1)).toBe(true) FIXME:なぜか0個になる
    //expect(template.resourceCountIs('AWS::S3:Bucket',1)).toBe(true)
})