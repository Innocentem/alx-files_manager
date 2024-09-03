/*this file has a class 'Queue'
 * we import the class from bull
 */
import Queue from 'bull';

export const fileQueue = new Queue('fileQueue', {
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
    },
});
