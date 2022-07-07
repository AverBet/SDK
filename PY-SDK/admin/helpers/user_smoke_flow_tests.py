from solana.keypair import Keypair
from pyaver.aver_client import AverClient
from asyncio import gather
from solana.rpc.commitment import Confirmed, Finalized
from pyaver.market import AverMarket
# from constants import DEFAULT_QUOTE_TOKEN_DEVNET, DEFAULT_HOST_ACCOUNT_DEVNET
from pyaver.enums import Side, SizeFormat
from pyaver.user_host_lifetime import UserHostLifetime
from pyaver.constants import AVER_HOST_ACCOUNT
from solana.rpc.types import TxOpts
from pyaver.user_market import UserMarket
from pyaver.utils import round_price_to_nearest_tick_size, sign_and_send_transaction_instructions
from pyaver.refresh import refresh_multiple_user_markets

async def user_flow_smoke_tests(
    client: AverClient,
    owner: Keypair,
    market: Keypair,
    full_test: bool = False
):
    user_host_lifetime = UserHostLifetime.derive_pubkey_and_bump(owner.public_key, AVER_HOST_ACCOUNT)[0]

    #User Host Lifetime
    user_quote_token_ata = await client.get_or_create_associated_token_account(
        owner.public_key, owner
    )
    assert user_quote_token_ata is not None, 'user quote token ata'

    #This can also be tested when get_or_create_user_market_account
    # if(full_test):
    #     sig = await UserHostLifetime.create_user_host_lifetime(
    #         client,
    #         owner,
    #         user_quote_token_ata,
    #         TxOpts()
    #     )
    #     con = await client.provider.connection.confirm_transaction(sig['result'], Finalized)
    #     assert (con['result']['value'][0]['err'] is None), 'Init User Host Lifetime'
    #     loaded_user_host_lifetime = await UserHostLifetime.load(client, user_host_lifetime)

    #Load market
    loaded_market = await AverMarket.load(client, market.public_key)
    assert loaded_market.market_pubkey == market.public_key, 'Correctly loaded market'
    assert loaded_market.market_state.quote_token_mint == client.quote_token,'Correctly loaded market'
    assert len(loaded_market.orderbooks) == loaded_market.market_state.number_of_outcomes, 'Correctly loaded market'

    #Load markets
    loaded_markets = await AverMarket.load_multiple(client, [market.public_key, market.public_key])
    for m in loaded_markets:
        assert m.market_pubkey == market.public_key, 'Correctly loaded market'
        assert m.market_state.quote_token_mint == client.quote_token,'Correctly loaded market'
        assert len(m.orderbooks) == m.market_state.number_of_outcomes, 'Correctly loaded market'

    #User Markets
    user_market = UserMarket.derive_pubkey_and_bump(owner.public_key, market.public_key, AVER_HOST_ACCOUNT)[0]
    # if(full_test):
    #     sig = await UserMarket.create_user_market_account(
    #         client,
    #         loaded_market,
    #         owner,
    #         TxOpts(),
    #     )
    #     con = await client.provider.connection.confirm_transaction(sig['result'], Finalized)
    #     assert (con['result']['value'][0]['err'] is None), 'Init User Market Account'
    # loaded_user_market = await UserMarket.load(client, loaded_market, owner.public_key)
    loaded_user_market = await UserMarket.get_or_create_user_market_account(
        client,
        owner,
        loaded_market,
        TxOpts()
    )
    test_uma_values(loaded_user_market, user_market, user_host_lifetime, owner.public_key)

    loaded_user_markets = await UserMarket.load_multiple(client, loaded_markets, owner.public_key)
    for u in loaded_user_markets:
        test_uma_values(u, user_market, user_host_lifetime, owner.public_key)
    
    loaded_uma_by_uma = await UserMarket.load_by_uma(client, user_market, market)
    test_uma_values(loaded_uma_by_uma, user_market, user_host_lifetime, owner.public_key)

    #DEPOSIT AND WITHDRAW
    if(full_test):
        deposit_amount = 10_000
        sig = await loaded_user_market.deposit_tokens(owner, deposit_amount, TxOpts())
        con = await client.provider.connection.confirm_transaction(sig['result'], Finalized)
        assert (con['result']['value'][0]['err'] is None), 'Deposited Tokens'

        refreshed_uma = (await refresh_multiple_user_markets(client, [loaded_user_market]))[0]
        for op in refreshed_uma.user_market_state.outcome_positions:
            assert op.free == deposit_amount, 'Deposit Tokens'
        assert refreshed_uma.calculate_funds_available_to_withdraw() == deposit_amount

        sig = await refreshed_uma.withdraw_idle_funds(owner, TxOpts())
        con = await client.provider.connection.confirm_transaction(sig['result'], Finalized)
        assert (con['result']['value'][0]['err'] is None), 'Withdraw Tokens'

        refreshed_uma = (await refresh_multiple_user_markets(client, [loaded_user_market]))[0]

        for op in refreshed_uma.user_market_state.outcome_positions:
            assert op.free == 0 , 'Deposit Tokens'
        assert refreshed_uma.calculate_funds_available_to_withdraw() == 0


    refreshed_uma = (await refresh_multiple_user_markets(client, [loaded_user_market]))[0]

    #PLACE AND CANCEL ORDERS
    if(full_test):
        outcome_number = 0
        price = 0.12345
        size = 100

        assert len(refreshed_uma.user_market_state.orders) == 0, 'UMA Orders empty'
        sig = await refreshed_uma.place_order(
            owner,
            outcome_number,
            Side.BUY,
            price,
            size,
            SizeFormat.PAYOUT,
            TxOpts()
        )
        con = await client.provider.connection.confirm_transaction(sig['result'], Finalized)
        assert (con['result']['value'][0]['err'] is None), 'Place order'

        refreshed_uma = (await refresh_multiple_user_markets(client, [loaded_user_market]))[0]

        bidL2 = refreshed_uma.market.orderbooks[outcome_number].get_bids_l2(1, True)
        rounded_price = round_price_to_nearest_tick_size(price)
        assert len(refreshed_uma.user_market_state.orders) == 1, 'Placed one order - UMA'
        assert len(bidL2) == 1, 'Bid l2'
        assert bidL2[0].price == rounded_price, 'price'
        assert round(bidL2[0].size) == size, 'size'

        sig = await refreshed_uma.cancel_order(
            owner,
            refreshed_uma.user_market_state.orders[0].order_id,
            outcome_number,
            TxOpts()
        )
        con = await client.provider.connection.confirm_transaction(sig['result'], Finalized)
        assert (con['result']['value'][0]['err'] is None), 'Cancel order'

        refreshed_uma = (await refresh_multiple_user_markets(client, [loaded_user_market]))[0]
        assert len(refreshed_uma.user_market_state.orders) == 0, 'Cancel one order - UMA'
        bidL2 = refreshed_uma.market.orderbooks[outcome_number].get_bids_l2(1, True)
        assert len(bidL2) == 0, 'Bid l2'

    # #PLACE AND CANCEL MULTIPLE ORDERS
    bid1 = 0.03423 #first orderbook
    bid2 = 0.244978 #second orderbook
    ask2 = 0.529764 #first orderbook
    ask1 = 0.899999 #second orderbook
    size = 50

    user_quote_token_ata = await client.get_or_create_associated_token_account(
            owner.public_key,
            owner,
        )

    ix1 = refreshed_uma.make_place_order_instruction(
        0,
        Side.BUY,
        bid1,
        size,
        SizeFormat.PAYOUT,
        user_quote_token_ata,
        active_pre_flight_check=True
        )
    ix2 = refreshed_uma.make_place_order_instruction(
        1,
        Side.BUY,
        bid2,
        size,
        SizeFormat.PAYOUT,
        user_quote_token_ata,
        active_pre_flight_check=True
        )
    ix3 = refreshed_uma.make_place_order_instruction(
        0,
        Side.SELL,
        ask1,
        size,
        SizeFormat.PAYOUT,
        user_quote_token_ata,
        active_pre_flight_check=True
        )
    ix4 = refreshed_uma.make_place_order_instruction(
        1,
        Side.SELL,
        ask2,
        size,
        SizeFormat.PAYOUT,
        user_quote_token_ata,
        active_pre_flight_check=True
        )

    sig = await sign_and_send_transaction_instructions(
        client,
        [],
        owner,
        [ix1, ix2, ix3, ix4],
    )
    con = await client.provider.connection.confirm_transaction(sig['result'], Finalized)
    assert (con['result']['value'][0]['err'] is None), 'Place multiple order'

    refreshed_uma = (await refresh_multiple_user_markets(client, [loaded_user_market]))[0]

    #Binary markets
    if(refreshed_uma.market.market_state.number_of_outcomes == 2):
        assert(len(refreshed_uma.user_market_state.orders) == 4), 'Placed multiple orders'
        
        expected_bid1 = round_price_to_nearest_tick_size(bid1)
        expected_bid2 = round_price_to_nearest_tick_size(1 - ask2)
        expected_ask2 = round_price_to_nearest_tick_size(1 - bid2)
        expected_ask1 = round_price_to_nearest_tick_size(ask1)

        bid_l2 = refreshed_uma.market.orderbooks[0].get_bids_l2(2, True)
        ask_l2 = refreshed_uma.market.orderbooks[0].get_asks_l2(2, True)

        assert(len(bid_l2) == 2)
        assert(len(ask_l2) == 2)

        assert abs(bid_l2[1].price - expected_bid1) < 10 ** -6
        assert abs(bid_l2[0].price - expected_bid2) < 10 ** -6
        assert abs(ask_l2[0].price - expected_ask2) < 10 ** -6
        assert abs(ask_l2[1].price - expected_ask1) < 10 ** -6

        assert round(bid_l2[0].size) == size
        assert round(ask_l2[0].size) == size

        factor = 10 ** 6
        expected_bid1 = round((1-round_price_to_nearest_tick_size(ask1)) * factor) / factor
        expected_bid2 = round_price_to_nearest_tick_size(bid2)
        expected_ask2 = round_price_to_nearest_tick_size(ask2)
        expected_ask1 = round((1-round_price_to_nearest_tick_size(bid1)) * factor) / factor

        bid_l2 = refreshed_uma.market.orderbooks[1].get_bids_l2(2, True)
        ask_l2 = refreshed_uma.market.orderbooks[1].get_asks_l2(2, True)

        assert(len(bid_l2) == 2)
        assert(len(ask_l2) == 2)

        assert abs(bid_l2[1].price - expected_bid1) < 10 ** -6
        assert abs(bid_l2[0].price - expected_bid2) < 10 ** -6
        assert abs(ask_l2[0].price - expected_ask2) < 10 ** -6
        assert abs(ask_l2[1].price - expected_ask1) < 10 ** -6

        assert round(bid_l2[0].size) == size
        assert round(ask_l2[0].size) == size
    
    #NON BINARY MARKETS
    if(refreshed_uma.market.market_state.number_of_outcomes < 2):
        assert(len(refreshed_uma.user_market_state.orders) == 4), 'Placed multiple orders'

        bidL2 = refreshed_uma.market.orderbooks[0].get_bids_l2(2, True)
        rounded_bid_price = round_price_to_nearest_tick_size(bid1)

        assert len(bidL2) == 1
        assert bidL2[0].price == rounded_bid_price
        assert round(bidL2[0].size) == size

        askL2 = refreshed_uma.market.orderbooks[0].get_asks_l2(2, True)
        rounded_ask_price = round_price_to_nearest_tick_size(ask1)

        assert len(askL2) == 1
        assert askL2[0].price == rounded_ask_price
        assert round(askL2[0].size) == size

        bidL2 = refreshed_uma.market.orderbooks[1].get_bids_l2(2, True)
        rounded_bid_price = round_price_to_nearest_tick_size(bid2)

        assert len(bidL2) == 1
        assert bidL2[0].price == rounded_bid_price
        assert round(bidL2[0].size) == size

        askL2 = refreshed_uma.market.orderbooks[1].get_asks_l2(2, True)
        rounded_ask_price = round_price_to_nearest_tick_size(ask2)

        assert len(askL2) == 1
        assert askL2[0].price == rounded_ask_price
        assert round(askL2[0].size) == size



    #CANCEL ALL ORDERS
    orders_to_cancel = list(range(0, refreshed_uma.market.market_state.number_of_outcomes))
    print(orders_to_cancel)
    sigs = await refreshed_uma.cancel_all_orders(
        owner,
        orders_to_cancel,
        TxOpts()
    )
    cons = await gather(*[client.provider.connection.confirm_transaction(sig['result'], Finalized) for sig in sigs])
    for con in cons:
        assert (con['result']['value'][0]['err'] is None), 'Cancel multiple order'

    refreshed_uma = (await refresh_multiple_user_markets(client, [loaded_user_market]))[0]

    #Make sure orderbooks are empty
    bids_l2_1 = refreshed_uma.market.orderbooks[0].get_bids_l2(10, True)
    bids_l2_2 = refreshed_uma.market.orderbooks[1].get_bids_l2(10, True)
    asks_l2_1 = refreshed_uma.market.orderbooks[0].get_asks_l2(10, True)
    asks_l2_2 = refreshed_uma.market.orderbooks[1].get_asks_l2(10, True)

    assert(len(bids_l2_1) == 0)
    assert(len(bids_l2_2) == 0)
    assert(len(asks_l2_1) == 0)
    assert(len(asks_l2_2) == 0)



def test_uma_values(loaded_user_market, user_market, user_host_lifetime, owner):
    assert loaded_user_market.user_market_state.max_number_of_orders == loaded_user_market.user_market_state.number_of_outcomes * 5, 'UMA'
    assert loaded_user_market.pubkey == user_market, 'UMA'
    assert loaded_user_market.user_market_state.user_host_lifetime == user_host_lifetime, 'UMA'
    assert loaded_user_market.user_market_state.user == owner, 'UMA'