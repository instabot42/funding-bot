const BFX = require('bitfinex-api-node');
const logger = require('../common/logger').logger;
const util = require('../common/util');


class BitfinexApiv2 {
    /**
     * Set up the API
     * @param key
     * @param secret
     */
    constructor(key, secret) {
        // Keep hold of the API key and secret
        this.key = key;
        this.secret = secret;

        this.bfx = new BFX({
            apiKey: key,
            apiSecret: secret,
            transform: true,
            ws: {
                autoReconnect: true,
                seqAudit: false,
                manageOrderBooks: true,
            },
        });

        this.ws = this.bfx.ws();

        // cache of some data
        this.state = {
            ticker: [],
            wallet: [],
            walletTimer: null,
            offers: [],
            loans: [],
            lastRates: {},
        };

        this.calcs = [];
        this.fundingRateChanged = () => {};
    }

    /**
     * Open the socket connection and attaches handles to events we need to know about
     * @returns {Promise<any>}
     */
    init(symbols) {
        const self = this;


        this.calcs = symbols.map(symbol => `wallet_funding_${symbol.toUpperCase()}`);

        return new Promise((resolve) => {
            const ws = self.ws;

            ws.on('error', (err) => {
                logger.error('Error detected on socket connection');
                logger.error(err);
            });
            ws.on('open', () => { logger.debug('socket opened'); ws.auth(); });
            ws.on('close', () => { logger.debug('socket closed'); });

            // ws.on('message', msg => console.log(msg));

            // Happens once when we are authenticated. We use this to complete set up
            ws.once('auth', () => {
                logger.progress('bfx v2 API Authenticated');

                // subscribe tickers
                symbols.forEach((symbol) => {
                    const bfxSymbol = `f${symbol.toUpperCase()}`;

                    this.state.lastRates[symbol] = 0;
                    ws.subscribeTicker(bfxSymbol);
                    ws.subscribeTrades(bfxSymbol);
                });

                // calc the wallet
                this.refreshAvailableFunds();

                // give it a little bit of time to settle.
                setTimeout(() => {
                    resolve();
                }, 1000);
            });

            // Some handlers to track the state our of wallet
            ws.onWalletSnapshot({}, (wallet) => {
                logger.debug('wallet snapshot');
                self.onWalletUpdate(wallet);
                self.refreshAvailableFunds();
            });

            ws.onWalletUpdate({}, (wallet) => {
                logger.debug('wallet update');
                self.onWalletUpdate([wallet]);
            });


            symbols.forEach((symbol) => {
                const eventFilter = { symbol: `f${symbol.toUpperCase()}` };
                logger.debug(`Register handlers for ${symbol}`);

                // Every time the price changes, this happens.
                ws.onTicker(eventFilter, (ticker) => {
                    logger.debug(`ticker for ${symbol}`);
                    this.onTicker(ticker);
                });

                ws.onTrades(eventFilter, (trades) => {
                    trades.forEach((trade) => {
                        const previous = this.state.lastRates[symbol];
                        this.state.lastRates[symbol] = trade.rate;

                        if (trade.rate !== previous) {
                            this.fundingRateChanged(symbol, previous, trade.rate);
                        }
                    });
                });

                // Funds I'm offering to lend out
                ws.onFundingOfferSnapshot(eventFilter, (offers) => {
                    // Limit orders offering my BTC for funding
                    logger.debug(`${symbol} funding offer snapshot`);
                    this.onFundingOffers(offers.map(offer => offer.toJS()));
                });

                ws.onFundingOfferNew(eventFilter, (offer) => {
                    logger.debug(`${symbol} funding offer created`);
                    this.onFundingOffers([offer.toJS()]);
                });

                ws.onFundingOfferUpdate(eventFilter, (offer) => {
                    logger.debug(`${symbol} funding offer updated`);
                    // remove an older version of this order
                    this.onFundingOffers([offer.toJS()]);
                });

                ws.onFundingOfferClose(eventFilter, (offer) => {
                    logger.debug(`${symbol} funding offer closed`);
                    this.onRemoveFundingOffers([offer.toJS()]);
                });


                // Lent out funds
                ws.onFundingCreditSnapshot(eventFilter, (loans) => {
                    // These are funds I have lent to someone - waiting for them to give them back.
                    logger.debug(`${symbol} funding credits snapshot`);
                    this.onLoans(loans.map(loan => loan.toJS()));
                });

                ws.onFundingCreditNew(eventFilter, (loan) => {
                    logger.debug(`${symbol} funding credit created`);
                    this.onLoans([loan.toJS()]);
                });

                ws.onFundingCreditUpdate(eventFilter, (loan) => {
                    logger.debug(`${symbol} funding credit updated`);
                    this.onLoans([loan.toJS()]);
                });

                ws.onFundingCreditClose(eventFilter, (loan) => {
                    logger.debug(`${symbol} funding credit closed`);
                    this.onRemoveLoans([loan.toJS()]);
                });
            });

            // Now all the handlers are set up, open the connection
            ws.open();
        });
    }

    /**
     * Handles a fresh ticker coming in
     * @param ticker
     */
    onTicker(ticker) {
        const tick = ticker.toJS();
        this.state.ticker = this.state.ticker.filter(item => item.symbol !== tick.symbol);
        this.state.ticker.push(tick);
    }

    /**
     * Removes some funding offers from the list
     * @param offers
     */
    onRemoveFundingOffers(offers) {
        offers.forEach((offer) => {
            this.state.offers = this.state.offers.filter(o => o.id !== offer.id);
        });
        this.refreshAvailableFunds();
    }

    /**
     * Adds some funding offers to the list
     * @param offers
     */
    onFundingOffers(offers) {
        this.onRemoveFundingOffers(offers);
        offers.forEach((offer) => {
            this.state.offers.push(offer);
        });
    }

    /**
     * Removes some loans from teh list
     * @param loans
     */
    onRemoveLoans(loans) {
        loans.forEach((loan) => {
            this.state.loans = this.state.loans.filter(o => o.id !== loan.id);
        });
        this.refreshAvailableFunds();
    }

    /**
     * Adds some loans to the list
     * @param loans
     */
    onLoans(loans) {
        this.onRemoveLoans(loans);
        loans.forEach((loan) => {
            this.state.loans.push(loan);
        });
    }

    /**
     * Set the callback to call when funding rate gets to a new high for a symbol
     * @param cb
     */
    fundingRateChangedCallback(cb) {
        this.fundingRateChanged = cb;
    }

    /**
     * Returns the current FRR rate for the symbol
     * @param symbol
     * @returns {*}
     */
    frr(symbol) {
        const tick = this.state.ticker.filter(item => item.symbol === `f${symbol.toUpperCase()}`);
        if (tick.length !== 1) {
            return 0;
        }

        return tick[0].frr;
    }

    /**
     * Create a new offer
     * @param symbol
     * @param amount
     * @param rate
     * @param period
     */
    newOffer(symbol, amount, rate, period) {
        this.ws.send(
            [0, 'fon', null, {
                type: 'LIMIT',
                symbol: `f${symbol.toUpperCase()}`,
                amount: String(amount),
                rate: String(rate),
                period,
                flags: 0,
            }],
        );
    }

    /**
     * Cancel an offer
     * @param id
     */
    cancelOffer(id) {
        this.ws.send(
            [0, 'foc', null, {
                id,
            }],
        );
    }

    /**
     * Cancel all offers
     * @param symbol
     */
    cancelAllOffers(symbol) {
        this.state.offers.filter(item => item.symbol === `f${symbol.toUpperCase()}`).forEach((offer) => {
            this.cancelOffer(offer.id);
        });
    }

    /**
     * return the available funds for the symbol
     * @param symbol
     * @returns {number}
     */
    fundsAvailable(symbol) {
        const funds = this.state.wallet.filter(item => item.currency.toUpperCase() === symbol.toUpperCase());
        if (funds.length === 0) {
            return 0;
        }

        return funds[0].balanceAvailable;
    }

    fundsTotal(symbol) {
        const funds = this.state.wallet.filter(item => item.currency.toUpperCase() === symbol.toUpperCase());
        if (funds.length === 0) {
            return 0;
        }

        return funds[0].balance;
    }

    /**
     * Ask for the available balance to be updated.
     */
    refreshAvailableFunds() {
        clearTimeout(this.state.walletTimer);
        this.state.walletTimer = setTimeout(() => {
            this.ws.requestCalc(this.calcs);
        }, 100);
    }

    /**
     * Called when we get a change to the wallet
     * @param wallet
     */
    onWalletUpdate(wallet) {
        const mapped = wallet.map(item => item.toJS()).filter(item => item.type === 'funding');
        mapped.forEach((item) => {
            this.state.wallet = this.state.wallet.filter(w => w.currency !== item.currency);
            this.state.wallet.push(item);
        });
    }
}

module.exports = BitfinexApiv2;
