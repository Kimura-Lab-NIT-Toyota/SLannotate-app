#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SLannotateFrontStack } from '../lib/front-stack';
import { SLannotateApiStack } from '../lib/api-stack';
import { CognitoAuthStack } from '../lib/auth-stack';
import { TableStack } from '../lib/table-stack';
const app = new cdk.App();

const auth = new CognitoAuthStack(app, 'SLannotateAuthStack', {});
const front = new SLannotateFrontStack(app, 'SLannotateFrontStack', {});
const table = new TableStack(app, 'SLannotateTableStack', {});
const api = new SLannotateApiStack(app, 'SLannotateApiStack', {
    userPool: auth.userPool,
    table: table.table
});