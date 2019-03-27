# Instabot Funding Bot


A simple first pass at a funding bot. Offers your funding balance for lending.

It uses the Bitfinex API v2, using Websockets, so it's pretty efficient.

It shares some code with my Algorithmic Trading bot (also open source on Github - https://instabot42.github.io/)


## Basic setup

Clone the repo, then...

```bash
cd funding-bot
npm install
npm run setup
```

The last command will create your default local config, so now edit the new `config/local.json` file.

Add you API keys. I recommend that you create new keys for this -
needs read and write permission for Margin Funding (so it can query offers and place new offers),
plus read permission for your wallet (so it knows how much you have to offer). Don't give it any more
permission than it needs.

Also add settings for each symbol you want the bot to trade on. There is an example for BTC included.

And finally, to start the app running...

```bash
npm run start
```

## Config

All configuration is found in the `config/local.json` file (created with `npm run setup`).

The default setup will look a bit like this....

```json
{
  "credentials": {
    "key": "api-key",
    "secret": "api-secret"
  },
  "funding": [
    {
      "symbol": "btc",
      "sleep": 5,
      "offers": [
        {
          "amount": 100,
          "frrMultipleLow": 0.5,
          "frrMultipleHigh": 5.0,
          "atLeastLow": 0.0,
          "atLeastHigh": 0.1,
          "lendingPeriodLow": 0.01,
          "lendingPeriodHigh": 0.1,
          "minOrderSize": 0.02,
          "orderCount": 10,
          "randomAmountsPercent": 5,
          "easing": "linear"
        }
      ],
      "alerts": [
        {
          "rate": 0.01,
          "alertMessage": "BTC funding rate broken 0.01% #funding"
        }
      ]
    }
  ],
  "server": {
    "logLevel": 1,
    "updateIntervalMinutes": 60,
    "alertWebhook": ""
  }
}
```

##### credentials

Put your API keys in here.

##### funding

This contains an list of all the different funding markets you want to trade in. The values have the following meanings...

- symbol: The name of the symbol (btc, usd, ltc and eth are supported by Bitfinex at the moment)
- sleep: how long to wait after cancelling orders before trying to place new orders
- offers: an array of offers to make on the symbol. Each offer contains the following settings...
  - amount: Percentage of your available funds to use on this offer. Ideally, the amounts of all offers for a symbol should add up to 100, assuming you want to use all your funds.
  - frrMultipleLow: Used to determine the lower end of the range for offers. Current FRR * frrMultipleLow
  - frrMultipleHigh: The FRR multiplier used to find the high end of the range of prices to offer at
  - atLeastLow: The lowest funding rate that will be used. If the frrMultipleLow resulted in a value lower than this, then this will be used instead
  - atLeastHigh: Similar toatLeastLow, only for the higher end of the range
  - lendingPeriodLow: Every offer below this value will be offered for the lowest allowed time (2 days)
  - lendingPeriodHigh: All offers over this value will be offered for the longest allowed time (30 days). Rates between the low and high will calculate a suitable offer period between the 2 and 30 days.
  - minOrderSize: The smallest order size the bot should try and use. Note that Bitfinex has a min order size of around $50 equivalent
  - orderCount: The ideal number of orders to place. May be less than this when there are not enough funds to provide orderCount * minOrderSize orders.
  - randomAmountsPercent: How much (as a percentage) to randomise order sizes by. eg, 5 would result in order sizes being +-5% from the default amount. If available funds are limited and minOrderSize is taking effect, the randomisation will be reduced to attempt to keep all orders above the min.
  - easing: The easing method used to spread the orders out in the range. defaults to 'linear'. can be one of linear, easein, easeout, easeinout, easeincubic, easeinquart, easeinquint.

##### Alerts

- rate: The funding rate that must be crossed for the alert to fire.
- maxFrequency: A number, in minutes. The alert can fire at most every maxFrequency minutes. This is to prevent a surge of alerts if the funding rate is fluctuating rapidly above and below the trigger rate.
- alertMessage: The message to send in the webhook

The funding bot can alert you when the funding rates exceeds some threshold you set. It does this by calling a webhook that you
define. This can be used to push alerts from the bot to services like [Alert-a-tron](https://alertatron.com/),
[IFTTT](https://ifttt.com/), or [Zapier](https://zapier.com/).

You will need to provide a webhook URL in the `server.alertWebhook` setting for alerts to work.
This URL will be called each time an alert is triggered.

Each symbol can contain a list of alerts. If the funding rate exceeds `rate`, then the webhook is called (HTTP POST)
with the `alertMessage` passed in a parameter called `message`.


##### server

This section contains some more general settings.

- logLevel: 2 for debug output, 0 for no output. 1 for some
- updateIntervalMinutes: The number of minutes to wait between each update. It defaults to 60, so every hour the
  funding bot will cancel all your open offers and recalculate where to place them. This will re-allocate any funding
  that has expired and returned to you.
- alertWebhook: covered in the alerts section above. Basically the URL that should be called each time an alert is fired.




## All donations gratefully accepted!

If you're using this to help you trade 24/7, it would be great if you could throw me a few Satoshi
from time to time to say thanks.

* Bitcoin: 3NFKTZwmTmvyieXyez5wfegfqK2mipoWwW
* Litecoin: LUov5izfzuDakBeLGGCtyzmZcwCB2nXBDY
* Eth: 0xA456DE943e64fCdf9B9C2d04d0653a752Ce6Fc3E

Thanks!


## License

Copyright 2018 Instabot

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in the
Software without restriction, including without limitation the rights to use, copy,
modify, merge, publish, distribute, sublicense, and/or sell copies of the Software,
and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
