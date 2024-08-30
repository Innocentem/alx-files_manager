import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class UsersController {
    static async getMe(req, res) {
        try {
            const token = req.headers['x-token'];
            if (!token) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const userId = await redisClient.get(`auth_${token}`);
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            await dbClient.connect();
            const usersCollection = dbClient.db.collection('users');
            const user = await usersCollection.findOne({ _id: userId });
            
            if (!user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            res.status(200).json({ id: user._id, email: user.email });
        } catch (error) {
            console.error('Error retrieving user:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

export default UsersController;
