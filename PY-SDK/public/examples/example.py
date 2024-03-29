import asyncio
from datetime import datetime
import base58
from solana.rpc.async_api import AsyncClient
from solana.keypair import Keypair
from pyaver.enums import SolanaNetwork
from pyaver.aver_client import AverClient
from pyaver.constants import get_solana_endpoint, AVER_PROGRAM_IDS
from solana.rpc.types import TxOpts
from solana.rpc.commitment import Confirmed
import base58 
from pyaver.enums import Side, SizeFormat, MarketStatus
from pyaver.refresh import refresh_user_market
from solana.publickey import PublicKey
from pyaver.market import AverMarket
from pyaver.user_market import UserMarket
from requests import get
from token_airdrop import request_token_airdrop, api_endpoint

# ----------------------------------------------------
#    DEVNET AVER INTERACTION EXAMPLE
# ----------------------------------------------------
# This example is intended to demonstrate an end-to-end interaction where
# - A wallet is created or reloaded from a secret key
# - The wallet is funded with SOL and Tokens
# - A request is made to the Aver API to obtain a list of markets
# - A market is loaded using the market's identifying public key
# - 

async def main():


    # ----------------------------------------------------
    #    GENERATE OR LOAD A WALLET
    # ----------------------------------------------------
    # Generate or reload an existing keypair ('wallet') - for example from storage in your system or environment files.
    # - New keypairs can be generated by calling Kaypair()

    secret_key = base58.b58decode('zSaKmpRbsJQQjmMRQsADRQ1vss8P2SQLbxGiiL8LFf9rJ8bFT8S1jAqj8Fkwg9hyq6vb97rR8EDkyu5EFD2tFbj')
    owner_keypair = Keypair.from_secret_key(secret_key)
    print(f'Keypair loaded with public key {owner_keypair.public_key}')
    
    # ----------------------------------------------------
    #    GENERATE AN AVERCLIENT INSTANCE TO INTERACT
    # ----------------------------------------------------
    # Here we us default transaction options
    # - You can learn more about these configuration points in the Solana documentation
    # - Generally, it relates to the trade-off of speed vs certainty in confirmation by the network
    
    opts = TxOpts(
        preflight_commitment=Confirmed
    )
    connection = AsyncClient(
        endpoint = get_solana_endpoint(SolanaNetwork.DEVNET),
        commitment = 'confirmed',
        timeout = 30
    )
    client: AverClient = await AverClient.load(
        connection=connection, 
        owner=owner_keypair, 
        opts=opts, 
        network=SolanaNetwork.DEVNET, 
        program_ids=AVER_PROGRAM_IDS
    )



    # ----------------------------------------------------
    #   FUND THE WALLET WITH SOL AND TOKENS, IF NECESSARY
    # ----------------------------------------------------
    # Fund the wallet with Lamports/SOL if required
    # - On mainnet, this would require a purchase/transfer of Lamports/SOL from another wallet or an exchange
    # - On devnet, you can simulate this using an 'airdrop'
    
    # Gets Solana Airdrop 
    print('-'*10)
    print('Topping up SOL/Lamports...')
    lamport_balance = await client.request_lamport_balance(owner_keypair.public_key)
    print(f' - Old SOL/Lamports balance: {lamport_balance}')

    if lamport_balance < 500000:
        await client.request_lamport_airdrop(1_000_000, owner_keypair.public_key)
    
    print(f' - New SOL/Lamports balance: {lamport_balance}')

    print('-'*10)
    print('Topping up USDC Tokens...')
    # Creates (or loads if one already exists) an Associated Token Account - where tokens will be stored for this wallet
    ata = await client.get_or_create_associated_token_account(
        owner_keypair.public_key,
        owner_keypair,
    )
    token_balance = await client.request_token_balance(client.quote_token, owner_keypair.public_key)
    print(f' - Token balance: {token_balance}')

    if token_balance < 50000:
        txn_signature = request_token_airdrop('https://dev.api.aver.exchange/', client.quote_token, owner_keypair.public_key, 1_000_000_000)['signature']
    
        # Wait to ensure transaction has been confirmed before moving on
        await client.provider.connection.confirm_transaction(txn_signature, Confirmed) 
        token_balance = await client.request_token_balance(client.quote_token, owner_keypair.public_key)
        print(f' - New token balance: {token_balance}')



    # ----------------------------------------------------
    #    GET A LIST OF MARKETS AVAILABLE TO TRADE
    # ----------------------------------------------------
    # We can query the Aver API to provide a list of markets
    # Filters can be applied to load specific categories, status, etc
    # Here we simply load all markets and will select the first one in the section below
    # To find out more, query https://dev.api.aver.exchange/v3/markets/ in your browser

    all_markets = get(api_endpoint(client.solana_network) + 'v3/markets?active_only=true')
    results = all_markets.json()['results']
    
    #Load all active markets from endpoint
    market_pubkeys = [PublicKey(m['pubkey']) for m in results if m['internal_status'] == 'active']

    # ----------------------------------------------------
    #    LOAD THE AVERMARKET IN-MEMORY
    # ----------------------------------------------------
    # An AverMarket object can be initialized using only an AverClient and the PublicKey of a valid market
    # This must be awaited, as the class will autopopulate state from all of the related
    #  on-chain accounts which make up this market.

    if len(market_pubkeys) == 0:
        print('There are currently no active markets, returning.')
        return

    #Loads market data from onchain
    loaded_markets = await AverMarket.load_multiple(client, market_pubkeys)
    #Ensure market is in ACTIVE_PRE_EVENT status so we can place orders on it
    active_pre_event_markets = list(filter(lambda market: market.market_state.market_status == MarketStatus.ACTIVE_PRE_EVENT and market.market_state.trading_cease_time > datetime.utcnow().timestamp() if market is not None else False, loaded_markets))
    #Let's just pick the first market in the list
    market = active_pre_event_markets[0]

    # Print market data or specific properties
    print('-'*10)
    print(f'Market {market.market_pubkey} loaded...')
    print(f'Market name: {market.market_state.market_name}')
    for idx, outcome_name in enumerate(market.market_state.outcome_names):
        print(f' - {idx} - {outcome_name}')
    print('-'*10)
    print('Market state:')
    print(market.market_state)

    # Print one or more of the orderbooks or orderbook properties from memory
    outcome_1_orderbook = market.orderbooks[0]
    print('Best Ask Price', outcome_1_orderbook.get_best_ask_price(True))
    print('Best Bid Price', outcome_1_orderbook.get_best_bid_price(True))



    # ----------------------------------------------------
    #    INITIALIZE (OR LOAD) A USER-MARKET ACCOUNT
    #                  FOR THIS MARKET
    # ----------------------------------------------------
    # A User-Market Account (UMA) stores a given wallets matched and 
    #  unmatched orders on-chain
    # A UMA must be initialized before a user can interact with a
    #  market, so that their bets and orders can be stored.
    # If required, this method will also initialized a User-Host-Lifetime
    #  account (UHLA) if necessary automatically.
    # There are some optional parameters to consider when initializing
    #  a UMA - for example, allocating a particular number of slots
    #  for how many unmatched orders can remain open in this market
    #  at the same time. (e.g. a typical user may only need a few,
    #  while a market maker may wish to have capacity to place
    #  several orders per outcome and side.)

    uma = await UserMarket.get_or_create_user_market_account(
        client = client,
        owner = owner_keypair,
        market = market,
        number_of_orders = (3 * market.market_state.number_of_outcomes) # Optional argument
    )
    print('-'*10)
    print(f'UMA created at pubkey {uma.pubkey}')


    # ----------------------------------------------------
    #                 PLACE AN ORDER 
    # ----------------------------------------------------
    # The UMA object can now be used to interact with the market.
    # Actions like placing and order can be called on the UMA object
    # Familiarize yourself with the list and format arguments 
    #  for the place_order() method can accomodate.
    # Some additional example of different formats are provided
    #  and have been commmented out.

    # This order a BUY side on outcome 1 at a price of 0.5 and size 10
    txn_signature = await uma.place_order(
        owner = owner_keypair,                  # Required in keypair format, as the owned needs to 'sign' this transaction to approve it
        outcome_id = 0,                         # Specifies which outcome/selection in the market to trade. Outcomes in a given market are indexed 0,1,..,n.
        side = Side.BUY,                        # Whether we wish to buy/back or sell/lay
        limit_price = 0.5,                      # Limit price (in probability format - range (0,1))
        size = 10,                              # The trade size - specified in size_format (units of payout here)
        size_format = SizeFormat.PAYOUT         # The format to specify the trade size. Payout units are the number of dollars that would be returned in a back-win. Stake = Payout * Price (Probability)
    )
    #Wait to ensure transaction has been confirmed before moving on
    await client.provider.connection.confirm_transaction(txn_signature['result'], Confirmed)
    
    # Another order example - in Decimal Odds and Stake Size
    '''
    decimal_price = 3.0     
    desired_stake = 10.0 
    txn_signature = await uma.place_order(
        owner = owner_keypair,
        outcome_id = 1,              
        side = Side.SELL,                                           # Laying/selling
        limit_price = (1/decimal_price),                            # limit_price must be provided as a probability price, but it is easy to convert from decimal or other odds formats
        size = desired_stake,                                       # Size here is provided as a STAKE, as the size_format is set to STAKE
        size_format = SizeFormat.STAKE,
        # --- Optional arguments ----
        # send_options = TxOpts(),                                  # Additional control could be exercised in terms of how the transaction is sent or confirmed
        # order_type = OrderType.POST_ONLY,                         # Additional control to specify a particular order_type (i.e. post only in this case)
        # self_trade_behavior = SelfTradeBehavior.CANCEL_PROVIDE,   # Additional control to specify self-trade behavior
        # active_pre_flight_check = True,                           # You can turn off client-side checks if you'd prefer to perform your own validations / attempt transactions which may fail on-chain due to invalid inputs or conditions
    )
    '''

    # Another order example - Placing a 'Market Order' - fill up to the size specified at best available price
    '''
    target_payout_units = 50    
    txn_signature = await uma.place_order(
        owner = owner_keypair,
        outcome_id = 1,              
        side = Side.BUY,                                            # Buying/backing
        limit_price = 1,                                            # Setting limit_price = 1 for a BUY/BACK or to 0 for a SELL/LAY for a market order
        size = target_payout_units,                                 # Size here is provided as a PAYOUT, as market orders cannot currently be supported in STAKE format
        size_format = SizeFormat.PAYOUT,
        order_type = OrderType.IOC,                                 # A 'market order' (i.e. limit_price or 0 or 1) will only be accpeted if the order_type is IOC of KILL_OR_FILL (to prevent users from inadvertently putting exposed orders on the book)
    )
    '''


    # ----------------------------------------------------
    #                 PLACE AN ORDER 
    # ----------------------------------------------------
    # The UMA object needs to be refreshed to ensure it
    #  reflects the latest on-chain state.
    # Depending on the configuration (speed vs confirmations 
    #  trade-off) it may take some time before some state 
    #  changes show-up. If using 'Confirmed' Commitment, it
    #  should show up almost immediately. 
    # Refreshing a User Market also automatically refreshes
    #  the data for the corresponding AverMarket object.
    # There are a number of tools for efficiently refreshing
    #  data within the refresh.py file. In particular this
    #  should be used where a script is trading on multiple
    #  markets at a time.

    uma = await refresh_user_market(client, uma)
    market = uma.market
    
    print('-'*10)
    print('UMA after placing order...')
    print('- Unmatched Bets / Open Orders')
    for order in uma.user_market_state.orders:
        print(order)
    print('- Matched exposures')
    for outcome_position in uma.user_market_state.outcome_positions:
        print(outcome_position)

    # ----------------------------------------------------
    #             CANCEL AN ORDER / ORDERS 
    # ----------------------------------------------------
    # The UMA object needs to be refreshed to ensure it
    #  reflects the latest on-chain state.
    # There are other methods available for cancelling orders
    #  in a group. For example, all orders for a market, or
    #  all orders for an outcome within a market.
    
    # NOTE: If the earlier order resulted in a complete fill/match
    #  there may be no residual posted order, and therefore no
    #  order to cancel. Try adjusting the price to one that won't
    #  fill/match to demonstrate.

    if uma.user_market_state.number_of_orders > 0:
        
        my_order = uma.user_market_state.orders[0]

        signature = await uma.cancel_order(
            fee_payer = owner_keypair,
            order_id = my_order.order_id,
            outcome_id = my_order.outcome_id,                                
            active_pre_flight_check=True
        )

        #Wait to ensure transaction has been confirmed before moving on
        await client.provider.connection.confirm_transaction(signature['result'], Confirmed) 

        # Reload the UMA and print it out
        uma = await refresh_user_market(client, uma)
        market = uma.market

        print('-'*10)
        print('UMA after canceling order...')
        print('- Unmatched Bets / Open Orders')
        for order in uma.user_market_state.orders:
            print(order)
        print('- Matched exposures')
        for outcome_position in uma.user_market_state.outcome_positions:
            print(outcome_position)

    else:
        print('No orders to cancel.')




    # ----------------------------------------------------
    #              CLOSE THE CLIENT 
    # ----------------------------------------------------

    #Finally close the client
    await client.close()

    

asyncio.run(main())