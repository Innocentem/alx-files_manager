import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';

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
                const parentFile = await dbClient.getFileById(parentId);
                if (!parentFile) {
                    return res.status(400).json({ error: 'Parent not found' });
                }

                if (parentFile.type !== 'folder') {
                    return res.status(400).json({ error: 'Parent is not a folder' });
                }
            }

            const fileDocument = {
                userId: ObjectId(userId),
                name,
                type,
                parentId: ObjectId(parentId),
                isPublic,
            };

            if (type === 'folder') {
                const result = await dbClient.db.collection('files').insertOne(fileDocument);
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
                const result = await dbClient.db.collection('files').insertOne(fileDocument);
                fileDocument.id = result.insertedId.toString();
                res.status(201).json(fileDocument);
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
}

export default FilesController;
