from solana.keypair import Keypair
from pyaver.aver_client import AverClient
from solana.rpc.commitment import Confirmed
from pyaver.market import AverMarket
from asyncio import gather
from .init_market_instruction import InitMarketAccounts, InitMarketArgs
from .init_market_instruction import init_market
import time
from solana.publickey import PublicKey
from .supplement_init_market import SupplementInitMarketAccounts, supplement_init_market, SupplementInitMarketArgs

async def create_init_market_smoke_tests(
    client: AverClient,
    owner: Keypair,
    outcome_length: int,
    market: Keypair,
    market_authority: Keypair,
    program_id: PublicKey
):
    #CREATE MARKET
    init_market_args = InitMarketArgs(
        active_immediately=True,
        cranker_reward=0,
        fee_tier_collection_bps_rates=[0,0,0,0,0,0,0],
        going_in_play_flag=True,
        inplay_start_time=1682447605,
        market_name="test_market",
        max_quote_tokens_in=10000000000000000,
        max_quote_tokens_in_permission_capped=10000000000000000,
        min_new_order_base_size=1,
        min_new_order_quote_size=1,
        min_orderbook_base_size=1,
        number_of_outcomes=outcome_length,
        number_of_winners=1,
        permissioned_market_flag=False, 
        trading_cease_time=1682447605,
    )

    init_market_accs = InitMarketAccounts(
        market=market,
        market_authority=market_authority,
        payer=owner
    )

    program = await client.get_program_from_program_id(program_id)

    sig = await init_market(client, program, init_market_args, init_market_accs)
    con = await client.provider.connection.confirm_transaction(sig, Confirmed)
    assert(con['result']['value'][0]['err'] is None), 'Init market'
    
    #CREATE SUPP MARKET
    number_of_outcomes = outcome_length
    number_of_iterations = 1 if number_of_outcomes == 2 else number_of_outcomes
    
    coroutines = []

    for i in range(number_of_iterations):
        outcome_names = [f'outcome_{i}'] if number_of_outcomes > 2 else ['outcome_1', 'outcome_2']
        supplement_init_market_args = SupplementInitMarketArgs(
            event_capacity=100,
            nodes_capacity=100,
            outcome_id=i,
            outcome_names=outcome_names
        )

        supplement_init_market_accs = SupplementInitMarketAccounts(
            market=market.public_key,
            market_authority=market_authority,
            payer=owner
        )

        print(f'creating supplement init market: {i}')
        coroutines.append(supplement_init_market(client.program, supplement_init_market_args, supplement_init_market_accs))
    sigs = await gather(*coroutines)
    time.sleep(10)
    cons = await gather(*[client.provider.connection.confirm_transaction(sig, Confirmed) for sig in sigs])
    for con in cons:
        assert (con['result']['value'][0]['err'] is None), 'Supp market'
    time.sleep(10)

    #LOAD CREATED MARKET
    market_object = await AverMarket.load(client, market.public_key)
    [expected_market_store_pubkey, _] = AverMarket.derive_market_store_pubkey_and_bump(market.public_key)
    assert(market_object.market_pubkey == market.public_key), 'Loaded market matching'
    assert(market_object.market_state.market_authority == market_authority.public_key), 'Loaded matching market authority'
    assert(market_object.market_state.market_store == expected_market_store_pubkey), 'Loaded market store'
    assert(len(market_object.orderbooks) == market_object.market_state.number_of_outcomes), 'Outcome numbers'
    for o in market_object.orderbooks:
        assert(o.slab_asks is not None), 'Slab Asks'
        assert(o.slab_bids is not None), 'Slab Bids'