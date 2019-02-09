/**
 * Blend between from and to
 * @param from
 * @param to
 * @param t
 * @param method - one of linear, easein, easeout and easeinout
 * @returns {*}
 * @constructor
 */
function EasingFunction(from, to, t, method) {
    const range = to - from;
    switch (method.toLowerCase()) {
        default:
        case 'linear':
            return from + (range * t);

        case 'easein':
        case 'ease-in':
            return from + (range * t * t);

        case 'easeout':
        case 'ease-out':
            return from + (range * t * (2 - t));

        case 'easeinout':
        case 'ease-in-out':
            return from + (range * (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t));

        case 'easeincubic':
            return from + (range * t * t * t);

        case 'easeinquart':
            return from + (range * t * t * t * t);

        case 'easeinquint':
            return from + (range * t * t * t * t * t);
    }
}

module.exports = EasingFunction;
