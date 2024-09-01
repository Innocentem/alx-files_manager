/* this file contains the class DBClient
 * the class DBClient should have the constructor that creates a client to MongoDB
 */

import { MongoClient, ObjectId } from 'mongodb';

class DBClient {
    constructor() {
        const host = process.env.DB_HOST || 'localhost';
        const port = process.env.DB_PORT || 27017;
        const database = process.env.DB_DATABASE || 'files_manager';

        this.url = `mongodb://${host}:${port}`;
        this.databaseName = database;
        this.client = new MongoClient(this.url, { useNewUrlParser: true, useUnifiedTopology: true });
        this.db = null;
        this.connected = false;
    }

    async connect() {
        if (!this.connected) {
            try {
                await this.client.connect();
                this.db = this.client.db(this.databaseName);
                this.connected = true;
            } catch (err) {
                console.error('Failed to connect to MongoDB:', err);
                this.connected = false;
            }
        }
    }

    isAlive() {
        return this.connected;
    }

    async nbUsers() {
        await this.connect();
        if (this.isAlive()) {
            return this.db.collection('users').countDocuments();
        } else {
            throw new Error('Database connection is not established.');
        }
    }

    async nbFiles() {
        await this.connect();
        if (this.isAlive()) {
            return this.db.collection('files').countDocuments();
        } else {
            throw new Error('Database connection is not established.');
        }
    }

    async getUserByToken(token) {
        await this.connect();
        if (this.isAlive()) {
            return this.db.collection('users').findOne({ token });
        } else {
            throw new Error('Database connection is not established.');
        }
    }

    async getFileById(fileId) {
        await this.connect();
        if (this.isAlive()) {
            return this.db.collection('files').findOne({ _id: ObjectId(fileId) });
        } else {
            throw new Error('Database connection is not established.');
        }
    }

    async getFilesByUserId(userId, parentId = 0, page = 0) {
        await this.connect();
        if (this.isAlive()) {
            return this.db.collection('files')
                .find({ userId: ObjectId(userId), parentId: ObjectId(parentId) })
                .skip(page * 20)
                .limit(20)
                .toArray();
        } else {
            throw new Error('Database connection is not established.');
        }
    }
}

const dbClient = new DBClient();
export default dbClient;
