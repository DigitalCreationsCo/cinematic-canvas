#!/usr/bin/env tsx
import { PubSub } from '@google-cloud/pubsub';
import * as dotenv from 'dotenv';
import { v7 as uuidv7 } from 'uuid';

dotenv.config();

const gcpProjectId = process.env.GCP_PROJECT_ID!;
const pubsub = new PubSub({
    projectId: gcpProjectId,
    ...(process.env.PUBSUB_EMULATOR_HOST ? { apiEndpoint: process.env.PUBSUB_EMULATOR_HOST } : {}),
});

const projectId = uuidv7();
const commandId = uuidv7();

const command = {
    type: 'START_PIPELINE',
    projectId,
    commandId,
    payload: {
        title: 'Test Project - Retry Logic',
        initialPrompt: 'A futuristic city skyline at sunset with flying cars',
        hasAudio: false,
    },
    timestamp: new Date().toISOString(),
};

console.log('Sending START_PIPELINE command:', JSON.stringify(command, null, 2));

const topic = pubsub.topic('pipeline-commands');
const dataBuffer = Buffer.from(JSON.stringify(command));

await topic.publishMessage({
    data: dataBuffer,
    attributes: { type: 'START_PIPELINE' },
});

console.log('✅ Command sent successfully!');
console.log(`Project ID: ${projectId}`);
console.log('Monitor the pipeline console for execution logs...');
