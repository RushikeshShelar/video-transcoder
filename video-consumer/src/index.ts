// video-consumer/src/index.ts
import dotenv from 'dotenv';
dotenv.config();

import { ReceiveMessageCommand, DeleteMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { S3Event } from 'aws-lambda';
import { spinContainer } from './azure';

const sqsClient = new SQSClient({
    region: process.env.REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY || " ",
        secretAccessKey: process.env.AWS_ACCESS_SECRET || " "
    }
});

const s3Client = new S3Client({
    region: process.env.REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY || " ",
        secretAccessKey: process.env.AWS_ACCESS_SECRET || " "
    }
});


async function deleteSourceVideo(bucketName: string, key: string) {
    try {
        const deleteCommand = new DeleteObjectCommand({
            Bucket: bucketName,
            Key: key
        });
        await s3Client.send(deleteCommand);
        console.log(`Successfully deleted source video: ${key} from bucket: ${bucketName}`);
    } catch (error) {
        console.error(`Error deleting source video: ${key} from bucket: ${bucketName}`, error);
        throw error;
    }
}


async function init() {
    const command = new ReceiveMessageCommand({
        QueueUrl: process.env.SQS_URL || " ",
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20
    });

    while (true) {
        const { Messages } = await sqsClient.send(command);
        if (!Messages) {
            console.log("No new messages");
            continue;
        }

        for (const message of Messages) {
            const { MessageId, ReceiptHandle, Body } = message;
            console.log(`Message received: `, { MessageId, Body });
            if (!Body) continue;

            try {
                const event = JSON.parse(Body) as S3Event;
                if ("Service" in event && "Event" in event && event.Event === "s3:TestEvent") continue;

                for (const record of event.Records) {
                    const { s3 } = record;
                    const { bucket, object: { key } } = s3;

                    try {
                        await spinContainer(bucket.name, key);

                        await deleteSourceVideo(bucket.name, key);

                        // Delete message from queue after processing
                        if (ReceiptHandle) {
                            const deleteCommand = new DeleteMessageCommand({
                                QueueUrl: process.env.SQS_URL,
                                ReceiptHandle
                            });
                            await sqsClient.send(deleteCommand);
                            console.log(`Deleted message: ${MessageId}`);
                        }
                    } catch (error) {
                        console.error("Error processing video:", error);
                        // Don't delete the SQS message if processing failed
                        // It will become visible again after the visibility timeout
                        throw error;
                    }
                }

            } catch (error) {
                console.error("[MESSAGE QUEUE ERROR]", error);
            }
        }
    }
}

// Uncomment this to Run Locally on Docker 
// async function spinContainer(bucketName: string, key: string) {
//     return new Promise((resolve, reject) => {
//         console.log(`Starting Docker container to process video: ${key}`);

//         exec(
//             `docker run --rm -e BUCKET_NAME=${bucketName} -e KEY=${key} -e OUTPUT_BUCKET_NAME=${process.env.OUTPUT_BUCKET_NAME} transcoder-container`,
//             (error, stdout, stderr) => {
//                 if (error) {
//                     console.error(`Error: ${error.message}`);
//                     reject(error);
//                     return;
//                 }
//                 if (stderr) console.error(`Stderr: ${stderr}`);
//                 console.log(`Stdout: ${stdout}`);
//                 resolve(true);
//             }
//         );
//     });
// }

init();
