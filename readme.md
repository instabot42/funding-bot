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


## All donations gratefully accepted! 

If you're using this to help you trade 24/7, it would be great if you could throw me a few Satoshi 
from time to time to say thanks. 

* Bitcoin: 39vBjyAu65vYEd7thnW75V7eULTcz7wgxV
* Litecoin: LUov5izfzuDakBeLGGCtyzmZcwCB2nXBDY
* Eth: 0x2F18958381D3a1025e136b5AEF727dDa132602f8
 
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
