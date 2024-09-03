/* this file is called index.js
 * it contains all endpoints of our API
 */

import express from 'express';
import FilesController from '../controllers/FilesController';
import UsersController from '../controllers/UsersController';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const router = express.Router();

// GET /status
router.get('/status', (req, res) => {
    res.json({ status: 'OK' });
});

// GET /stats
router.get('/stats', async (req, res) => {
    try {
        const nbUsers = await dbClient.nbUsers();
        const nbFiles = await dbClient.nbFiles();
        res.json({ users: nbUsers, files: nbFiles });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /users
router.post('/users', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Missing email or password' });
        }

        await dbClient.connect();
        const usersCollection = dbClient.db.collection('users');
        const result = await usersCollection.insertOne({ email, password });

        if (result.insertedId) {
            const userId = result.insertedId.toString();
            
            // Add a job to the userQueue for sending a welcome email
            const userQueue = new Queue('userQueue', {
                connection: { host: 'localhost', port: 6379 }
            });
            await userQueue.add('sendWelcomeEmail', { userId });

            res.status(201).json({ userId });
        } else {
            res.status(500).json({ error: 'Failed to create user' });
        }
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /connect
router.get('/connect', async (req, res) => {
    try {
        const isConnected = await dbClient.isAlive();
        res.json({ connected: isConnected });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /disconnect
router.get('/disconnect', async (req, res) => {
    try {
        await dbClient.client.close();
        res.json({ status: 'Disconnected' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /users/me
router.get('/users/me', async (req, res) => {
    try {
        const token = req.headers['x-token'];
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        const userId = await redisClient.get(`auth_${token}`);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        await dbClient.connect();
        const user = await dbClient.db.collection('users').findOne({ _id: new ObjectId(userId) });

        if (user) {
            res.json(user);
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('Error retrieving user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /files
router.post('/files', FilesController.postUpload);

// GET /files/:id
router.get('/files/:id', async (req, res) => {
    try {
        const fileId = req.params.id;
        await dbClient.connect();
        const file = await dbClient.getFileById(fileId);

        if (!file) return res.status(404).json({ error: 'File not found' });

        res.json(file);
    } catch (error) {
        console.error('Error retrieving file:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /files
router.get('/files', async (req, res) => {
    try {
        const { page = 0 } = req.query;
        await dbClient.connect();
        const files = await dbClient.db.collection('files').find().skip(page * 20).limit(20).toArray();
        res.json(files);
    } catch (error) {
        console.error('Error retrieving files:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /files/:id/publish
router.put('/files/:id/publish', async (req, res) => {
    try {
        const fileId = req.params.id;
        const token = req.headers['x-token'];
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        const userId = await redisClient.get(`auth_${token}`);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        await dbClient.connect();
        const file = await dbClient.db.collection('files').findOne({ _id: new ObjectId(fileId), userId: new ObjectId(userId) });

        if (!file) return res.status(404).json({ error: 'File not found' });

        await dbClient.db.collection('files').updateOne({ _id: new ObjectId(fileId) }, { $set: { isPublic: true } });

        const updatedFile = await dbClient.db.collection('files').findOne({ _id: new ObjectId(fileId) });
        res.json(updatedFile);
    } catch (error) {
        console.error('Error publishing file:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /files/:id/unpublish
router.put('/files/:id/unpublish', async (req, res) => {
    try {
        const fileId = req.params.id;
        const token = req.headers['x-token'];
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        const userId = await redisClient.get(`auth_${token}`);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        await dbClient.connect();
        const file = await dbClient.db.collection('files').findOne({ _id: new ObjectId(fileId), userId: new ObjectId(userId) });

        if (!file) return res.status(404).json({ error: 'File not found' });

        await dbClient.db.collection('files').updateOne({ _id: new ObjectId(fileId) }, { $set: { isPublic: false } });

        const updatedFile = await dbClient.db.collection('files').findOne({ _id: new ObjectId(fileId) });
        res.json(updatedFile);
    } catch (error) {
        console.error('Error unpublishing file:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /files/:id/data
router.get('/files/:id/data', async (req, res) => {
    try {
        const fileId = req.params.id;
        const { size } = req.query;
        await dbClient.connect();
        const file = await dbClient.getFileById(fileId);

        if (!file) return res.status(404).json({ error: 'File not found' });

        if (!file.isPublic && !req.headers['x-token']) return res.status(404).json({ error: 'Not found' });

        if (file.type === 'folder') return res.status(400).json({ error: 'A folder doesn\'t have content' });

        const filePath = path.join(process.env.FOLDER_PATH || '/tmp/files_manager', fileId.toString());
        
        if (size) {
            const thumbnailPath = `${filePath}_${size}`;
            if (fs.existsSync(thumbnailPath)) {
                res.sendFile(thumbnailPath);
            } else {
                res.status(404).json({ error: 'File not found' });
            }
        } else {
            if (fs.existsSync(filePath)) {
                const mime = require('mime-types');
                const mimeType = mime.lookup(filePath);
                res.setHeader('Content-Type', mimeType || 'application/octet-stream');
                res.sendFile(filePath);
            } else {
                res.status(404).json({ error: 'File not found' });
            }
        }
    } catch (error) {
        console.error('Error retrieving file data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
