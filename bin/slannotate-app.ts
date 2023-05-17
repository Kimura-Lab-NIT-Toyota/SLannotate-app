#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SLannotateFrontStack } from '../lib/slannotate-front-stack';
import { SLannotateApiStack } from '../lib/slannotate-api-stack';

const app = new cdk.App();

const front = new SLannotateFrontStack(app, 'SLannotateFrontStack', {});
const api = new SLannotateApiStack(app, 'SLannotateApiStack', {});
