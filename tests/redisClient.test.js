/* this is a test file
 * its used to test the redisClient file
 */

import { expect } from 'chai';
import redisClient from '../utils/redis';
import sinon from 'sinon';

describe('Redis Client', () => {
    beforeEach(() => {
        sinon.restore();
    });

    it('should be connected', () => {
        expect(redisClient.isAlive()).to.be.true;
    });

    it('should set and get a value', async () => {
        await redisClient.set('test_key', 'test_value', 10);
        const value = await redisClient.get('test_key');
        expect(value).to.equal('test_value');
    });

    it('should delete a value', async () => {
        await redisClient.set('test_key', 'test_value', 10);
        await redisClient.del('test_key');
        const value = await redisClient.get('test_key');
        expect(value).to.be.null;
    });
});
