import crypto from 'crypto';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';
import { v4 as uuidv4 } from 'uuid';

class AuthController {
    static async getConnect(req, res) {
        try {
            const authHeader = req.headers['authorization'];
            if (!authHeader || !authHeader.startsWith('Basic ')) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const base64Credentials = authHeader.split(' ')[1];
            const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
            const [email, password] = credentials.split(':');

            if (!email || !password) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            await dbClient.connect();
            const usersCollection = dbClient.db.collection('users');
            const hashedPassword = crypto.createHash('sha1').update(password).digest('hex');
            const user = await usersCollection.findOne({ email, password: hashedPassword });

            if (!user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const token = uuidv4();
            await redisClient.set(`auth_${token}`, user._id.toString(), 24 * 60 * 60); // 24 hours
            res.status(200).json({ token });
        } catch (error) {
            console.error('Error during connect:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    static async getDisconnect(req, res) {
        try {
            const token = req.headers['x-token'];
            if (!token) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const exists = await redisClient.get(`auth_${token}`);
            if (!exists) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            await redisClient.del(`auth_${token}`);
            res.status(204).send();
        } catch (error) {
            console.error('Error during disconnect:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

export default AuthController;
