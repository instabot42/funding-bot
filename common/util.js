

class Util {
    /**
     * return a random float between low and high
     * @param low
     * @param high
     * @returns {*}
     */
    static randomRange(low, high) {
        const diff = high - low;
        return low + (Math.random() * diff);
    }

    /**
     * return a random int from low to high
     * @param low
     * @param high
     * @returns {number}
     */
    static randomRangeInt(low, high) {
        const diff = high - low;
        return Math.round(low + (Math.random() * diff));
    }

    /**
     * Generic rounding function used by round, roundUp and roundDown
     * @param type
     * @param value
     * @param exp
     * @returns {*}
     */
    static decimalAdjust(type, value, exp) {
        // If the exp is undefined or zero...
        if (typeof exp === 'undefined' || +exp === 0) {
            return Math[type](value);
        }

        value = +value;
        exp = +exp;

        // If the value is not a number or the exp is not an integer...
        if (isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0)) {
            return NaN;
        }

        // Shift
        value = value.toString().split('e');
        value = Math[type](+(`${value[0]}e${value[1] ? (+value[1] + exp) : exp}`));

        // Shift back
        value = value.toString().split('e');
        return +(`${value[0]}e${value[1] ? (+value[1] - exp) : -exp}`);
    }

    /**
     * Round a number of a given number of significant figures
     * @param value - the number
     * @param sigFigures
     * @returns {number}
     */
    static roundSignificantFigures(value, sigFigures) {
        return Number(value.toPrecision(sigFigures));
    }

    /**
     * rounds a number to a given number of decimal places
     * @param value
     * @param exp
     * @returns {*}
     */
    static round(value, exp) {
        return this.decimalAdjust('round', value, exp);
    }

    /**
     * rounds a number down to the number of decimal places
     * @param value
     * @param exp
     * @returns {*}
     */
    static roundDown(value, exp) {
        return this.decimalAdjust('floor', value, exp);
    }

    /**
     * rounds a number up to the number of decimal places
     * @param value
     * @param exp
     * @returns {*}
     */
    static roundUp(value, exp) {
        return this.decimalAdjust('ceil', value, exp);
    }
}

module.exports = Util;
