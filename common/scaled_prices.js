const easing = require('./easing');


/**
 *
 * @param orderCount
 * @param from
 * @param to
 * @param randomDiff
 * @param easingFunction
 * @param round
 * @returns {number[]}
 */
module.exports = (orderCount, from, to, randomDiff, easingFunction, round) => {
    // No orders, no results
    if (orderCount < 1) {
        return [];
    }

    if (orderCount < 2) {
        return [from];
    }

    const range = to - from;

    // Create an array with a progress from 0 to 1
    const sizes = Array(...Array(orderCount)).map((item, i) => easing(0, 1, i / (orderCount - 1), easingFunction));

    // Add a random amount from each entry if needed
    const safeDiff = randomDiff > 1 ? 1 : (randomDiff < 0 ? 0 : randomDiff);
    const randomised = sizes.map((entry, i) => ((i === 0) ? entry : entry + ((Math.random() * safeDiff))));

    // Figure out the total range steps after the randomising
    const max = randomised.reduce((t, orderSize) => (orderSize > t ? orderSize : t), 0);
    const scaleFactor = range / max;

    // scale the steps into the range and map them into the range from-to
    return randomised.map(entry => round(from + (entry * scaleFactor)));
};
