import dotenv from 'dotenv';
dotenv.config();

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import ffmpeg from 'fluent-ffmpeg';
import fs from "fs";
import path from "path";
import { Readable } from 'stream';
import * as fsExtra from 'fs-extra';

const RESOLUTIONS = [
    { name: "360p", height: 360, width: 480 },
    { name: "480p", height: 480, width: 858 },
    { name: "720p", height: 720, width: 1280 },
];

const client = new S3Client({
    region: "us-east-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY || "",
        secretAccessKey: process.env.AWS_ACCESS_SECRET || "",
    }
});

const BUCKET_NAME = process.env.BUCKET_NAME;
const KEY = process.env.KEY;
const OUTPUT_BUCKET_NAME = process.env.OUTPUT_BUCKET_NAME;


async function init() {
    try {
        // Ensure the videos directory exists
        await fs.promises.mkdir('videos', { recursive: true });
        await fs.promises.mkdir('transcoded', { recursive: true });

        // 1. Download the Original Video
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: KEY,
        });

        const result = await client.send(command);

        if (result.Body instanceof Readable) {
            const originalFilePath = `videos/original-video.mp4`;
            const writeStream = fs.createWriteStream(originalFilePath);

            // Pipe the readable stream to the writable stream
            result.Body.pipe(writeStream);

            // Wait until the write stream is finished
            await new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });

            const originalVideoPath = path.resolve(originalFilePath);

            // 2. Start Transcoder
            const promises = RESOLUTIONS.map(resolution => {
                const output = `transcoded/video-${resolution.name}.mp4`;

                return new Promise<void>((resolve, reject) => {
                    ffmpeg(originalVideoPath)
                        .output(output)
                        .withVideoCodec("libx264")
                        .withAudioCodec("aac")
                        .withSize(`${resolution.width}x${resolution.height}`)
                        .on('end', async () => {
                            try {
                                // 3. Upload the Video to new S3 Bucket
                                const putCommand = new PutObjectCommand({
                                    Bucket: OUTPUT_BUCKET_NAME,
                                    Key: `transcoded/${path.basename(output)}`,
                                    Body: await new Promise<Buffer>((resolve, reject) => {
                                        fs.readFile(output, (err, data) => {
                                            if (err) reject(err);
                                            else resolve(data);
                                        });
                                    })
                                });
                                await client.send(putCommand);
                                console.log(`Uploaded ${output}`);
                                resolve();
                            } catch (uploadError) {
                                console.error(`Error uploading ${output}:`, uploadError);
                                reject(uploadError);
                            }
                        })
                        .on('error', (err) => {
                            console.error('Error during transcoding:', err);
                            reject(err);
                        })
                        .format(`mp4`)
                        .run();
                });
            });

            await Promise.all(promises);
        } else {
            throw new Error("Failed to download video: result.Body is not a readable stream");
        }
    } catch (error) {
        console.error("An error occurred:", error);
    } finally {
        // Clean up - remove the original video file after processing
        try {
            await fsExtra.remove('videos/original-video.mp4');
            console.log("Cleaned up original video file.");
        } catch (cleanupError) {
            console.error("Error during cleanup:", cleanupError);
        }
        process.exit(0);
    }
}


init().finally(() => process.exit(0));
