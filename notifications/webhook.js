const request = require('request');
const logger = require('../common/logger').logger;

/**
 * Send a message
 */
module.exports = (url, msg) => {
    const data = {
        message: msg,
        from: 'Instabot Funding bot',
    };

    // send a message
    request({
        method: 'post',
        body: data,
        json: true,
        url,
    }, (err, res, body) => {
        if (err) {
            logger.error(err);
        }
    });
};
