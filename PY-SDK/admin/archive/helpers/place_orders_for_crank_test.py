from solana.keypair import Keypair
from pyaver.aver_client import AverClient
from solana.rpc.commitment import Finalized, Confirmed
from pyaver.market import AverMarket
import asyncio
from pyaver.refresh import refresh_multiple_user_markets
from pyaver.enums import Side, SizeFormat
from .crank_market import crank_market
from pyaver.user_market import UserMarket
import time

async def place_orders_for_crank_test(
    client: AverClient,
    owner_1: Keypair,
    owner_2: Keypair,
    market: Keypair,
    full_test: bool
):
    outcome_id = 0
    size = 10
    price = 0.5
    stake = size * price
    payout = size

    time.sleep(5)
    loaded_market = await AverMarket.load(client, market.public_key)

    factor = 10 ** loaded_market.market_state.decimals

    uma_1, uma_2 = await asyncio.gather(UserMarket.get_or_create_user_market_account(
        client,
        owner_1,
        loaded_market,
    ),  UserMarket.get_or_create_user_market_account(
        client,
        owner_2,
        loaded_market,
    ))

    if(full_test):
        assert(len(uma_1.user_market_state.orders) == 0)
        assert(len(uma_2.user_market_state.orders) == 0)

        assert(uma_1.user_market_state.outcome_positions[0].free == 0)
        assert(uma_1.user_market_state.outcome_positions[0].locked == 0)
        assert(uma_2.user_market_state.outcome_positions[0].free == 0)
        assert(uma_2.user_market_state.outcome_positions[0].locked == 0)

        sig_1 = await uma_1.place_order(
            owner_1,
            outcome_id,
            Side.SELL,
            price,
            size,
            SizeFormat.PAYOUT
        )
        sig_2 = await uma_2.place_order(
            owner_2,
            outcome_id,
            Side.BUY,
            price,
            size,
            SizeFormat.PAYOUT
        )

        await asyncio.gather(
            client.provider.connection.confirm_transaction(sig_1['result']), 
            client.provider.connection.confirm_transaction(sig_2['result'])
        ) 

    uma_1, uma_2 = await refresh_multiple_user_markets(client, [uma_1, uma_2])

    print('PRE CRANK, POST ORDER')
    print(uma_1.user_market_state.outcome_positions[outcome_id])
    print(uma_2.user_market_state.outcome_positions[outcome_id])

    assert(uma_1.user_market_state.outcome_positions[outcome_id].free == 0)
    assert(uma_1.user_market_state.outcome_positions[outcome_id].locked == stake * factor)
    assert(uma_2.user_market_state.outcome_positions[outcome_id].free == payout * factor)
    assert(uma_2.user_market_state.outcome_positions[outcome_id].locked == 0)

    sig = await loaded_market.crank_market([outcome_id], None, owner_1)
    await client.provider.connection.confirm_transaction(sig, commitment=Finalized) 

    uma_1, uma_2 = await refresh_multiple_user_markets(client, [uma_1, uma_2])

    print('POST CRANK, POST ORDER')
    print(uma_1.user_market_state.outcome_positions[outcome_id])
    print(uma_2.user_market_state.outcome_positions[outcome_id])

    assert(uma_1.user_market_state.outcome_positions[outcome_id].free == 0)
    assert(uma_1.user_market_state.outcome_positions[outcome_id].locked == 0)
    assert(uma_2.user_market_state.outcome_positions[outcome_id].free == payout * factor)
    assert(uma_2.user_market_state.outcome_positions[outcome_id].locked == 0)

    exposures_1 = uma_1.calculate_exposures()
    exposures_2 = uma_2.calculate_exposures()

    print(exposures_1, exposures_2)

    assert(exposures_1[outcome_id] == (0 - stake) * factor)
    assert(exposures_2[outcome_id] == (size - stake) * factor)