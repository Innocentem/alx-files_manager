//this file is called worker.js

import { Queue, Worker, QueueScheduler } from 'bullmq';
import { MongoClient, ObjectId } from 'mongodb';
import path from 'path';
import fs from 'fs';
import imageThumbnail from 'image-thumbnail';
import { v4 as uuidv4 } from 'uuid';

const client = new MongoClient(process.env.DB_URL || 'mongodb://localhost:27017');
await client.connect();
const db = client.db('files_manager');

const userQueue = new Queue('userQueue', {
    connection: { host: 'localhost', port: 6379 }
});
const fileQueue = new Queue('fileQueue', {
    connection: { host: 'localhost', port: 6379 }
});

const queueScheduler = new QueueScheduler('userQueue', {
    connection: { host: 'localhost', port: 6379 }
});
const fileQueueScheduler = new QueueScheduler('fileQueue', {
    connection: { host: 'localhost', port: 6379 }
});

const userWorker = new Worker('userQueue', async (job) => {
    if (!job.data.userId) throw new Error('Missing userId');
    
    const user = await db.collection('users').findOne({ _id: new ObjectId(job.data.userId) });
    if (!user) throw new Error('User not found');
    
    console.log(`Welcome ${user.email}!`);
}, {
    connection: { host: 'localhost', port: 6379 }
});

const fileWorker = new Worker('fileQueue', async (job) => {
    if (!job.data.fileId || !job.data.userId) throw new Error('Missing fileId or userId');
    
    const file = await db.collection('files').findOne({ _id: new ObjectId(job.data.fileId), userId: new ObjectId(job.data.userId) });
    if (!file) throw new Error('File not found');

    if (file.type !== 'image') throw new Error('File is not an image');
    
    const filePath = path.join(process.env.FOLDER_PATH || '/tmp/files_manager', file._id.toString());
    
    if (!fs.existsSync(filePath)) throw new Error('File does not exist');

    const sizes = [500, 250, 100];
    await Promise.all(sizes.map(async (size) => {
        try {
            const thumbnail = await imageThumbnail(filePath, { width: size });
            const thumbnailPath = `${filePath}_${size}`;
            fs.writeFileSync(thumbnailPath, thumbnail);
        } catch (error) {
            console.error(`Error generating thumbnail of size ${size}:`, error);
        }
    }));
}, {
    connection: { host: 'localhost', port: 6379 }
});
