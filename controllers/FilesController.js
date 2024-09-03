/*this file is called FilesController.js
 * it contains the new endpoint
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import mime from 'mime-types';
import Queue from 'bull';
import { fileQueue } from '../utils/queues';

const FOLDER_PATH = process.env.FOLDER_PATH || '/tmp/files_manager';

class FilesController {
    static async postUpload(req, res) {
        try {
            const token = req.headers['x-token'];
            if (!token) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const userId = await redisClient.get(`auth_${token}`);
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const { name, type, parentId = 0, isPublic = false, data } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Missing name' });
            }

            if (!type || !['folder', 'file', 'image'].includes(type)) {
                return res.status(400).json({ error: 'Missing or invalid type' });
            }

            if (type !== 'folder' && !data) {
                return res.status(400).json({ error: 'Missing data' });
            }

            if (parentId !== 0) {
                await dbClient.connect();
                const filesCollection = dbClient.db.collection('files');
                const parentFile = await filesCollection.findOne({ _id: ObjectId(parentId) });
                
                if (!parentFile) {
                    return res.status(400).json({ error: 'Parent not found' });
                }

                if (parentFile.type !== 'folder') {
                    return res.status(400).json({ error: 'Parent is not a folder' });
                }
            }

            const fileDocument = {
                userId,
                name,
                type,
                parentId,
                isPublic,
            };

            if (type === 'folder') {
                await dbClient.connect();
                const filesCollection = dbClient.db.collection('files');
                const result = await filesCollection.insertOne(fileDocument);
                fileDocument.id = result.insertedId.toString();
                res.status(201).json(fileDocument);
            } else {
                const fileId = uuidv4();
                const filePath = path.join(FOLDER_PATH, fileId);

                if (!fs.existsSync(FOLDER_PATH)) {
                    fs.mkdirSync(FOLDER_PATH, { recursive: true });
                }

                const fileContent = Buffer.from(data, 'base64');
                fs.writeFileSync(filePath, fileContent);

                fileDocument.localPath = filePath;
                await dbClient.connect();
                const filesCollection = dbClient.db.collection('files');
                const result = await filesCollection.insertOne(fileDocument);
                fileDocument.id = result.insertedId.toString();
                res.status(201).json(fileDocument);
                if (type === 'image') {
                    await fileQueue.add({
                        userId,
                        fileId: fileDocument.id
                    });
                }
            }
        } catch (error) {
            console.error('Error during file upload:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    static async getShow(req, res) {
        try {
            const token = req.headers['x-token'];
            if (!token) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const userId = await redisClient.get(`auth_${token}`);
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const file = await dbClient.getFileById(req.params.id);
            if (!file || file.userId.toString() !== userId) {
                return res.status(404).json({ error: 'Not found' });
            }

            res.json(file);
        } catch (error) {
            console.error('Error retrieving file:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    static async getIndex(req, res) {
        try {
            const token = req.headers['x-token'];
            if (!token) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const userId = await redisClient.get(`auth_${token}`);
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const { parentId = 0, page = 0 } = req.query;
            const pageNumber = parseInt(page, 10) || 0;

            const files = await dbClient.getFilesByUserId(userId, parentId, pageNumber);
            res.json(files);
        } catch (error) {
            console.error('Error retrieving files:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    static async putPublish(req, res) {
        try {
            const token = req.headers['x-token'];
            if (!token) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const userId = await redisClient.get(`auth_${token}`);
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const file = await dbClient.getFileById(req.params.id);
            if (!file || file.userId.toString() !== userId) {
                return res.status(404).json({ error: 'Not found' });
            }

            file.isPublic = true;
            await dbClient.db.collection('files').updateOne({ _id: ObjectId(req.params.id) }, { $set: { isPublic: true } });

            res.json(file);
        } catch (error) {
            console.error('Error publishing file:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    static async getFile(req, res) {
        try {
            const token = req.headers['x-token'];
            const { id } = req.params;
            const { size } = req.query;
            const file = await dbClient.getFileById(id);
            if (!file) {
                return res.status(404).json({ error: 'Not found' });
            }
            const userId = token ? await redisClient.get(`auth_${token}`) : null;
            if (!file.isPublic && (!userId || file.userId.toString() !== userId)) {
                return res.status(404).json({ error: 'Not found' });
            }
            if (file.type === 'folder') {
                return res.status(400).json({ error: 'A folder doesn\'t have content' });
            }
            let filePath = path.join(FOLDER_PATH, file.id);
            if (file.type === 'image' && size) {
                const validSizes = ['500', '250', '100'];
                if (!validSizes.includes(size)) {
                    return res.status(400).json({ error: 'Invalid size' });
                }
                filePath = path.join(FOLDER_PATH, `${file.id}_${size}`);
            }
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'Not found' });
            }
            const mimeType = mime.lookup(file.name) || 'application/octet-stream';
            res.setHeader('Content-Type', mimeType);
            fs.createReadStream(filePath).pipe(res);
        } catch (error) {
            console.error('Error retrieving file content:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
    
    static async putUnpublish(req, res) {
        try {
            const token = req.headers['x-token'];
            if (!token) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const userId = await redisClient.get(`auth_${token}`);
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const file = await dbClient.getFileById(req.params.id);
            if (!file || file.userId.toString() !== userId) {
                return res.status(404).json({ error: 'Not found' });
            }

            file.isPublic = false;
            await dbClient.db.collection('files').updateOne({ _id: ObjectId(req.params.id) }, { $set: { isPublic: false } });

            res.json(file);
        } catch (error) {
            console.error('Error unpublishing file:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

export default FilesController;
