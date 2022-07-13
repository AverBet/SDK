# aver-py-sdk

## Intro

Definitions of terms:

- AverClient - Create this object first in order to send requests
- Host - Company or entity that is hosting the Market. They collect fees on certain markets. Most users will not need use this. The default host is Aver.
- Market - A particular event or market, upon which orders can be placed
- UserHostLifetime - An account for a user that tracks their orders across multiple markets (with respect to one particular hosting entity). This is required to place orders
- UserMarket - An account for a user required to place orders on a particular market. It requires a UserHostLifetime account.

## Basic usage

You will need to install the required dependencies, including pydash, solana, spl.
We suggest within a virtual environment running `pip install -r requirements.txt`

You can create a .env file with an environment variable called `ENV_NAME` and assign it either DEVNET or MAINNET to switchc between the two
It will default to DEVNET otherwise

```python
secret_key = 'MY_SECRET_KEY'
owner = Keypair.from_secret_key(secret_key)
opts = TxOpts()
network = SolanaNetwork.DEVNET
client = await AverClient.load(owner, opts, network)

market = await Market.load(client, 'MARKET_PUBKEY')

user_market_1 = await UserMarket.get_or_create_user_market_account(
        client,
        owner,
        market,
        TxOpts()
    )

user_market_2 = await UserMarket.load(client, market, owner.public_key)

signature = await user_market_1.place_order(
            owner,
            outcome_number,
            Side.BUY,
            price,
            size,
            SizeFormat.PAYOUT,
            TxOpts()
        )
```

See examples.py for more examples

# Token airdrop

You may wish to airdrop yourself some USDC tokens (Devnet) to play around with using token_airdrop.py

## Tips

- If you place an order, wait until it's confirmed using:

```python
await client.provider.connection.confirm_transaction(sig['result'], Confirmed)
```

- In order to refresh the contents of a market efficiently and quickly use:

```python
refreshed_umas = (await refresh_multiple_user_markets(client, markets_to_refresh))
```

Using functions in refresh.py is quicker than load or load_multiple.

- If you want to pull some specific data, check out data_classes.py.

- Orderbooks are stored in loaded_market_object.orderbooks
