import { expect } from 'chai';
import dbClient from '../utils/db';
import sinon from 'sinon';
import { ObjectId } from 'mongodb';

describe('DB Client', () => {
    before(async () => {
        await dbClient.connect();
    });

    after(() => {
        dbClient.client.close();
    });

    it('should check connection status', () => {
        expect(dbClient.isAlive()).to.be.true;
    });

    it('should count documents in users collection', async () => {
        const count = await dbClient.nbUsers();
        expect(count).to.be.a('number');
    });

    it('should count documents in files collection', async () => {
        const count = await dbClient.nbFiles();
        expect(count).to.be.a('number');
    });

    it('should get a user by token', async () => {
        const userId = new ObjectId();
        const token = 'test_token';
        await dbClient.db.collection('users').insertOne({ _id: userId, token });
        const user = await dbClient.getUserByToken(token);
        expect(user).to.have.property('_id', userId);
    });

    it('should get a file by ID', async () => {
        const fileId = new ObjectId();
        await dbClient.db.collection('files').insertOne({ _id: fileId, name: 'test_file' });
        const file = await dbClient.getFileById(fileId);
        expect(file).to.have.property('_id', fileId);
    });

    it('should get files by user ID', async () => {
        const userId = new ObjectId();
        await dbClient.db.collection('files').insertOne({ userId, name: 'test_file' });
        const files = await dbClient.getFilesByUserId(userId);
        expect(files).to.be.an('array');
    });
});
