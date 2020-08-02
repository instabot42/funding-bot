const request = require('request');
const logger = require('../common/logger').logger;

/**
 * Send a message
 */
module.exports = (url, msg, rate, newRate, oldRate) => {
    const formatted = msg.replace('{{rate}}', `${rate * 100}`)
        .replace('{{newRate}}', `${newRate * 100}`)
        .replace('{{oldRate}}', `${oldRate * 100}`);

    const data = {
        message: formatted,
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
