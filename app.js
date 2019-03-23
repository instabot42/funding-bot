const config = require('config');
const moment = require('moment');
const logger = require('./common/logger').logger;
const Bitfinex = require('./exchange/bitfinexv2');
const scaledPrices = require('./common/scaled_prices');
const util = require('./common/util');
const callWebhook = require('./notifications/webhook');

const startTime = new Date();
const alertWebhook = config.get('server.alertWebhook');
const fundingMarkets = config.get('funding');
const symbols = fundingMarkets.map(item => item.symbol);
const bfx = new Bitfinex(config.get('credentials.key'), config.get('credentials.secret'));

const rateUpdates = {};

/**
 * return 0-1 offering the normalised position of a rate between 2 values
 * @param rate
 * @param min
 * @param max
 * @returns {number}
 */
function normaliseRate(rate, min, max) {
    if (rate < min) return 0;
    if (rate > max) return 1;

    return (rate - min) / (max - min);
}

/**
 * intended to give the number of days between min and max
 * @param t - range 0 to 1
 * @param min
 * @param max
 * @returns {*}
 */
function duration(t, min, max) {
    return util.round(min + ((max - min) * t), 0);
}

/**
 * Just wait for some seconds
 * @param s
 * @returns {Promise<any>}
 */
function sleep(s) {
    return new Promise((resolve) => {
        setTimeout(() => { resolve(); }, s * 1000);
    });
}

/**
 *
 * @returns {Promise<void>}
 */
async function rebalanceFunding(options) {
    try {
        const symbol = options.symbol;

        // Cancel existing offers
        logger.info(`Refreshing offers on ${symbol} at ${Date()}...`);
        logger.progress('  Cancelling existing open offers');
        bfx.cancelAllOffers(symbol);

        // wait for the dust to settle
        logger.progress('  waiting...');
        await sleep(options.sleep);

        // work out funds available
        const available = bfx.fundsAvailable(symbol);
        if (available < options.minOrderSize) {
            logger.info(`  Not enough ${symbol} - ${available} available`);
            return;
        }

        // Work out order sizes and count
        options.offers.forEach((offer) => {
            // figure out what percentage of available funds to use for this offer
            const allocatedFunds = (available * offer.amount) / 100;

            // work out the order count, limited by min order size and available funds
            const idealOrderCount = offer.orderCount;
            const perOrder = util.roundDown(Math.max(allocatedFunds / idealOrderCount, offer.minOrderSize), 5);
            const orderCount = Math.floor(allocatedFunds / perOrder);

            // figure out the range we'll offer into
            const frr = bfx.frr(symbol);
            const lowRate = Math.max(frr * offer.frrMultipleLow, offer.atLeastLow / 100);
            const highRate = Math.max(frr * offer.frrMultipleHigh, offer.atLeastHigh / 100);

            // progress update
            logger.results('Offer...');
            logger.progress(`  Adding ${orderCount} orders, per order: ${perOrder}, total: ${util.roundDown(allocatedFunds, 4)}`);
            logger.progress(`  Rates from ${util.roundDown(lowRate * 100, 6)}% to ${util.roundDown(highRate * 100, 6)}% with ${offer.easing} scale.`);

            if (orderCount > 0) {
                // Use a non-linear scaled order to position all the offers
                const rates = scaledPrices(orderCount, lowRate, highRate, 0, offer.easing, i => util.round(i, 8));
                const averageRate = rates.reduce((a, r) => a + r) / orderCount;
                logger.progress(`  Average Rate ${util.roundDown(averageRate * 100, 3)}%.`);

                // place the orders
                rates.forEach((rate) => {
                    // decide how long to make the offer for and submit it
                    const days = duration(normaliseRate(rate, offer.lendingPeriodLow / 100, offer.lendingPeriodHigh / 100), 2, 30);
                    bfx.newOffer(symbol, perOrder, rate, days);
                });
            }
        });
    } catch (err) {
        logger.error(err.message);
        logger.error(err);
    }
}

/**
 * Called when there is a new high in the funding rate
 * @param symbol
 * @param oldRate
 * @param newRate
 */
function onFundingRateChanged(symbol, oldRate, newRate) {
    if (rateUpdates[symbol] === undefined) {
        rateUpdates[symbol] = 0;
    }
    rateUpdates[symbol] += 1;
    if (rateUpdates[symbol] > 200) {
        logger.results(`${symbol.toUpperCase()} rate: ${util.roundDown(newRate * 100, 4)}%`);
        rateUpdates[symbol] = 0;
    }

    // only interested in the rate going up...
    if (oldRate > newRate) {
        return;
    }

    // See if they have a webhook url defined
    if (!alertWebhook) {
        return;
    }

    // Any alert levels configured for this market
    const options = fundingMarkets.find(market => market.symbol === symbol);
    if (!options.alerts) {
        return;
    }

    // get the alerts into rate order (lowest rate first)
    options.alerts.sort((a, b) => a.rate - b.rate);

    // See if we've crossed over the alert threshold
    options.alerts.forEach((alert) => {
        if (alert.lastTriggered === undefined) {
            alert.lastTriggered = moment().subtract(1, 'hours');
        }
        const justNow = moment().subtract(5, 'minutes');
        const rate = alert.rate / 100.0;
        if (newRate >= rate && oldRate < rate) {
            if (alert.lastTriggered < justNow) {
                logger.error(`Alert fired - rates crossed over ${alert.rate}%. was ${oldRate}, now ${newRate}`);

                callWebhook(alertWebhook, alert.alertMessage);
                alert.lastTriggered = moment();
            } else {
                logger.results(`rates crossed over ${alert.rate}%. But sent alert in last 5 minutes.`);
            }
        }
    });
}

/**
 * Update all the symbols we are tracking
 */
function runBot() {
    // Force each symbol to run out of sync with the others, to spread the load
    const waitMinutes = config.get('server.updateIntervalMinutes');
    logger.results(`Refreshing funding positions every ${waitMinutes} minutes.`);
    logger.debug('waiting a few seconds for connection to stabilise before starting...');

    fundingMarkets.forEach((options, i) => {
        sleep(10 * i).then(() => {
            rebalanceFunding(options);
            setInterval(() => { rebalanceFunding(options); }, 1000 * 60 * waitMinutes);
        });
    });

    // Listen out for funding rate highs
    bfx.fundingRateChangedCallback(onFundingRateChanged);
}

/** ************************************************************ */

// Set up the logger
logger.setLevel(config.get('server.logLevel'));

// Welcome message
logger.bright('\n');
logger.bright('=================================================\n');
logger.bright('  Instabot Funding bot starting  ️ \n');
logger.bright('  Tip BTC: 3NFKTZwmTmvyieXyez5wfegfqK2mipoWwW\n');
logger.bright('=================================================\n');
logger.results(`\nStarted at ${startTime}\n`);

// start the socket connections
bfx.init(symbols);

// Wait 5 seconds for the socket connection to settle
sleep(5).then(() => {
    runBot();
});
