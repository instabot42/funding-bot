const config = require('config');
const moment = require('moment');
const logger = require('./common/logger').logger;
const Bitfinex = require('./exchange/bitfinexv2');
const scaledPrices = require('./common/scaled_prices');
const scaledAmounts = require('./common/scaled_amounts');
const util = require('./common/util');
const callWebhook = require('./notifications/webhook');

const startTime = new Date();
const alertWebhook = config.get('server.alertWebhook');
const rateLimit = config.get('server.rateLimitDelay');
const fundingMarkets = config.get('funding');
const symbols = fundingMarkets.map(item => item.symbol);
const bfx = new Bitfinex(config.get('credentials.key'), config.get('credentials.secret'));

const rateUpdates = {};
let trackedRates = [];

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
 * Just wait for some ms seconds
 * @param ms
 * @returns {Promise<any>}
 */
function sleepMs(ms) {
    return new Promise((resolve) => {
        setTimeout(() => { resolve(); }, ms);
    });
}

/**
 * Sleep for n seconds
 * @param s
 * @returns {Promise<void>}
 */
async function sleep(s) {
    await sleepMs(s * 1000);
}

/**
 *
 * @param {*} symbol
 * @param {*} sleepSeconds
 * @returns
 */
async function fundsAvailable(symbol, sleepSeconds, rounding) {
    let available = null;
    while (available === null) {
        bfx.refreshSymbolBalance(symbol);
        await sleep(sleepSeconds);
        available = bfx.fundsAvailable(symbol);
    }

    return util.roundDown(available, rounding);
}

/**
 *
 * @returns {Promise<void>}
 */
async function rebalanceFunding(options) {
    try {
        const symbol = options.symbol;
        const rounding = options.rounding;
        const minDays = Math.max(2, options.minDays);
        const maxDays = Math.min(120, options.maxDays);

        // Cancel existing offers
        logger.info(`Refreshing offers on ${symbol} at ${Date()}...`);
        const existingOffers = bfx.getAllOffers(symbol);
        if (existingOffers.length > 0) {
            logger.progress(`  Cancelling existing open offers (${existingOffers.length} orders)`);
            for (const offerId of existingOffers) {
                await sleepMs(rateLimit);
                bfx.cancelOffer(offerId);
            }
        }

        // Find out the total funds
        const totalFunds = bfx.fundsTotal(symbol);
        if (util.roundDown(totalFunds, rounding) === 0) {
            logger.results(`No funds allocated to ${symbol}. Skipping.`);
            return;
        }

        // wait for the dust to settle
        logger.progress('  waiting for available balance to update...');

        // work out funds available
        let available = await fundsAvailable(symbol, options.sleep, rounding);
        if (available < options.minOrderSize) {
            logger.info(`  Not enough ${symbol} - ${available} available - skipping`);
            return;
        }

        logger.info(`Total Funds: ${totalFunds}. Available: ${available}`);

        // Work out order sizes and count
        for (const offer of options.offers) {
            // figure out what percentage of available funds to use for this offer
            const allocatedFundsDesired = (totalFunds * offer.amount) / 100;
            const allocatedFunds = Math.min(allocatedFundsDesired, available);
            available -= allocatedFunds;
            if (available < 0) {
                available = 0;
            }

            if (allocatedFunds < offer.minOrderSize) {
                logger.results(`No funds available for block (${offer.amount}% funds from ${offer.atLeastLow} to ${offer.atLeastHigh}). Wanted to allocate ${allocatedFundsDesired}`);
            } else {
                // work out the order count, limited by min order size and available funds
                const idealOrderCount = offer.orderCount;
                const perOrder = util.roundDown(Math.max(allocatedFunds / idealOrderCount, offer.minOrderSize), rounding);
                const orderCount = Math.floor(allocatedFunds / perOrder);

                // figure out the range we'll offer into
                const frr = bfx.frr(symbol);
                const bestRate = recentBestRate(symbol);
                const lowRate = Math.max(frr * offer.frrMultipleLow, offer.atLeastLow / 100, bestRate * 0.99);
                const highRate = Math.max(frr * offer.frrMultipleHigh, offer.atLeastHigh / 100, bestRate * 1.1);

                // progress update
                logger.results(`Offer ${allocatedFunds} ${symbol} (had wanted to offer ${allocatedFundsDesired} ${symbol} - ${offer.amount}%)`);
                logger.results(`FRR: ${util.roundDown(frr * 100, 5)}%. Best Rate: ${util.roundDown(bestRate * 100, 5)}%.`);
                logger.progress(`  Adding ${orderCount} orders, per order: ${perOrder}, total: ${util.roundDown(orderCount * perOrder, rounding)}`);
                logger.progress(`  Rates from ${util.roundDown(lowRate * 100, 5)}% to ${util.roundDown(highRate * 100, 5)}% with ${offer.easing} scale.`);

                if (orderCount > 0) {
                    // Use a non-linear scaled order to position all the offers
                    const rates = scaledPrices(orderCount, lowRate, highRate, 0, offer.easing, i => util.round(i, 8));
                    const averageRate = rates.reduce((a, r) => a + r) / orderCount;
                    logger.progress(`  Average Rate ${util.roundDown(averageRate * 100, 3)}%.`);

                    // Amounts, with randomisation
                    const round = x => util.roundDown(x, rounding);
                    const amounts = scaledAmounts(orderCount, allocatedFunds, offer.minOrderSize, offer.randomAmountsPercent / 100, round);

                    // place the orders
                    let i = 0;
                    for (const rate of rates) {
                        await sleepMs(rateLimit);

                        // decide how long to make the offer for and submit it
                        const days = duration(normaliseRate(rate, offer.lendingPeriodLow / 100, offer.lendingPeriodHigh / 100), minDays, maxDays);
                        bfx.newOffer(symbol, amounts[i], rate, days);
                        logger.progress(`    ${amounts[i]} ${symbol} at ${util.roundDown(rate*100, 5)}% for ${days} days.`);
                        i += 1;
                    }

                    logger.progress(`  ${i} Orders placed`);
                }
            }
        }

        logger.info(`${symbol} refresh complete.`);
    } catch (err) {
        logger.error(err.message);
        logger.error(err);
    }
}

/**
 *
 * @param {*} symbol
 * @param {*} rate
 */
function trackRate(symbol, rate) {
    const index = trackedRates.findIndex(item => item.symbol === symbol);
    if (index < 0) {
        // No entry for this symbol, add one
        trackedRates.push({ symbol, rate, timestamp: moment() });
        return;
    }

    // this rate better or the old one is too old, then replace it
    const recent = moment().subtract(10, 'minutes');
    if (trackedRates[index].rate < rate || trackedRates[index].timestamp < recent) {
        trackedRates = trackedRates.filter(item => item.symbol !== symbol);
        trackedRates.push({ symbol, rate, timestamp: moment() });
    }
}

/**
 *
 * @param {*} symbol
 * @returns
 */
function recentBestRate(symbol) {
    const index = trackedRates.findIndex(item => item.symbol === symbol);
    if (index < 0) {
        return 0;
    }

    // the last good rate we saw
    return trackedRates[index].rate
}

/**
 *
 */
function reportBestRates() {
    logger.info('Recent Best Rates:-');
    trackedRates.forEach((item) => logger.info(`  ${item.symbol} : ${util.roundDown(item.rate * 100, 4)}% (APR ${util.roundDown(item.rate * 100 * 365, 2)}%).`));
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
    trackRate(symbol, newRate);

    // only interested in the rate going up...
    if (oldRate > newRate) {
        return;
    }

    // Show the rate (occasionally)
    if (rateUpdates[symbol] > 100) {
        const best = recentBestRate(symbol);
        logger.results(`${symbol.toUpperCase()} Last Rate: ${util.roundDown(newRate * 100, 4)}% (APR ${util.roundDown(newRate * 100 * 365, 2)}%).`);
        rateUpdates[symbol] = 0;
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
        const freq = alert.maxFrequency || 5;
        const justNow = moment().subtract(freq, 'minutes');
        const rate = alert.rate / 100.0;
        if (newRate >= rate && oldRate < rate) {
            if (alert.lastTriggered.isBefore(justNow)) {
                logger.error(`Alert fired - ${symbol} rates crossed over ${alert.rate}%. was ${oldRate}, now ${newRate}`);

                callWebhook(alertWebhook, alert.alertMessage, rate, newRate, oldRate);
                alert.lastTriggered = moment();
            } else {
                logger.results(`${symbol} rates crossed over ${alert.rate}%. But sent alert in last ${freq} minutes.`);
            }
        }
    });
}

/**
 * Update all the symbols we are tracking
 */
async function runBot() {
    if (fundingMarkets.length === 0) {
        logger.results(`No markets in config, so nothing to do.`);
        return;
    }

    // Force each symbol to run out of sync with the others, to spread the load
    const waitMinutes = config.get('server.updateIntervalMinutes');
    logger.results(`Refreshing funding positions every ${waitMinutes} minutes.`);
    logger.debug('waiting a few seconds for connection to stabilise before starting...');

    // Listen out for funding rate highs
    bfx.fundingRateChangedCallback(onFundingRateChanged);
    setInterval(() => reportBestRates(), 1000 * 60 * 3);

    // Work out how many ms to wait between each market getting started
    const delayBetweenMarkets = Math.floor(1000 * 60 * (waitMinutes / fundingMarkets.length));
    for (let i=0; i<fundingMarkets.length; i+=1) {
        const options = {
            rounding: 5,
            minDays: 2,
            maxDays: 30,
            ...fundingMarkets[i]
        };

        // Start off by setting up the funding for everything right away
        await rebalanceFunding(options);

        // then we will wait a while to distribute the refreshes evenly
        setTimeout(() => {
            // Do the first refresh of the regular ones
            rebalanceFunding(options);

            // and re-trigger this every waitMinutes forever
            setInterval(() => {
                rebalanceFunding(options);
            }, 1000 * 60 * waitMinutes);
        }, delayBetweenMarkets * (i + 1));

        await sleep(5);
    };

    logger.results(`All markets initial setup complete. First refresh in ${util.roundDown(delayBetweenMarkets/1000/60, 2)}m`);
}

/** ************************************************************ */

// Set up the logger
logger.setLevel(config.get('server.logLevel'));

// Welcome message
logger.bright('\n');
logger.bright('=================================================');
logger.bright('  Instabot Funding bot starting  ️ ');
logger.bright('=================================================');
logger.results(`\nStarted at ${startTime}\n`);

// start the socket connections
bfx.init(symbols);

// Wait 5 seconds for the socket connection to settle
sleep(5).then(() => {
    runBot();
});
