/* this file is called AppController.js
 * it contains the definition of the 2 endpoints
 */

import redisClient from '../utils/redis'; // Ensure this is set up correctly
import dbClient from '../utils/db';

class AppController {
    static async getStatus(req, res) {
        try {
            const redisAlive = redisClient.isAlive();
            await dbClient.connect(); // Ensure DB is connected
            const dbAlive = dbClient.isAlive();
            res.status(200).json({ redis: redisAlive, db: dbAlive });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    static async getStats(req, res) {
        try {
            await dbClient.connect(); // Ensure DB is connected
            const usersCount = await dbClient.nbUsers();
            const filesCount = await dbClient.nbFiles();
            res.status(200).json({ users: usersCount, files: filesCount });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

export default AppController;
