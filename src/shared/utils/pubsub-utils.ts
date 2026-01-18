import { CreateSubscriptionOptions, PubSub, Topic } from "@google-cloud/pubsub";

/**
 * Succinctly ensures a topic exists without throwing on ALREADY_EXISTS.
 */
export async function ensureTopic(pubsub: PubSub,topicName: string): Promise<Topic> {
    const topic = pubsub.topic(topicName);
    try {
        await topic.create();
    } catch (e: any) {
        if (e.code !== 6) throw e;
    }
    console.log(`Ensuring topic ${topicName} exists...`);
    return topic;
}

/**
 * Succinctly ensures a subscription exists without throwing on ALREADY_EXISTS.
 */
export async function ensureSubscription(topic: Topic, name: string, options: CreateSubscriptionOptions = {}) {
    try {
        await topic.createSubscription(name, {
            enableExactlyOnceDelivery: true,
            ackDeadlineSeconds: 60,
            expirationPolicy: { ttl: { seconds: 24 * 60 * 60 } },
            ...options
        });
    } catch (e: any) {
        if (e.code !== 6) throw e;
    }
    console.log(`Ensuring subscription ${name} exists on ${topic.name}...`);
}