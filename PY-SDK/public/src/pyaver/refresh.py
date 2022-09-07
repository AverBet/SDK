from .aver_client import AverClient
from .user_market import AverMarket, UserMarket
from .utils import load_multiple_account_states



"""
Use this function to quickly refresh market data (it is quicker that AverMarket.load_multiple)
"""
async def refresh_multiple_markets(
    aver_client: AverClient, 
    markets: list[AverMarket],
    ) -> list[AverMarket]:
    """
    Refresh all data for multiple markets quickly

    This function optimizes the calls to the Solana network batching them efficiently so that many can be reloaded in the fewest calls.

    Use instead instead of src.market.AverMarket.load_multiple()

    Args:
        aver_client (AverClient): AverClient object
        markets (list[AverMarket]): List of AverMarket objects

    Returns:
        list[AverMarket]: List of refreshed AverMarket objects
    """
    market_pubkeys = [m.market_pubkey for m in markets]
    market_store_pubkeys = [m.market_state.market_store for m in markets]

    slabs_pubkeys = []
    for m in markets:
        if(m.market_store_state is None or m.market_store_state.orderbook_accounts is None):
            continue
        oa = m.market_store_state.orderbook_accounts
        for s in oa:
            slabs_pubkeys.append(s.bids)
            slabs_pubkeys.append(s.asks)
    
    multiple_account_states = await load_multiple_account_states(
        aver_client, 
        market_pubkeys,
        market_store_pubkeys,
        slabs_pubkeys,
        )

    markets = AverMarket.get_markets_from_account_states(
        aver_client, 
        market_pubkeys, 
        multiple_account_states['market_states'], 
        multiple_account_states['market_stores'], 
        multiple_account_states['slabs'],
        multiple_account_states['program_ids']
    )

    return markets

async def refresh_market(aver_client: AverClient, market: AverMarket) -> AverMarket:
    """
    Refresh all data for an AverMarket quickly

    This function optimizes the calls to the Solana network batching them efficiently so that many can be reloaded in the fewest calls.

    Use instead instead of src.market.AverMarket.load()

    Args:
        aver_client (AverClient): AverClient object
        market (AverMarket): AverMarket object

    Returns:
        AverMarket: Refreshed AverMarket object
    """
    return (await refresh_multiple_markets(aver_client, [market]))[0]

async def refresh_multiple_user_markets(
    aver_client: AverClient, 
    user_markets: list[UserMarket],
    ) -> list[UserMarket]:
    """
    Refresh all data for multiple user markets quickly

    This function optimizes the calls to the Solana network batching them efficiently so that many can be reloaded in the fewest calls.

    Also refreshes the underlying AverMarket objects

    Args:
        aver_client (AverClient): AverMarket object
        user_markets (list[UserMarket]): List of UserMarket objects

    Returns:
        list[UserMarket]: List of refreshed UserMarket objects
    """
    market_pubkeys = [u.market.market_pubkey for u in user_markets]
    market_store_pubkeys = [u.market.market_state.market_store for u in user_markets]
    user_markets_pubkeys = [u.pubkey for u in user_markets]
    user_pubkeys = [u.user_market_state.user for u in user_markets]
    uhl_pubkeys = [u.user_host_lifetime.pubkey for u in user_markets]

    slabs_pubkeys = []
    for u in user_markets:
        if(u.market.market_store_state is None or u.market.market_store_state.orderbook_accounts is None):
            continue
        oa = u.market.market_store_state.orderbook_accounts
        for s in oa:
            slabs_pubkeys.append(s.bids)
            slabs_pubkeys.append(s.asks)
    
    multiple_account_states = await load_multiple_account_states(
        aver_client, 
        market_pubkeys,
        market_store_pubkeys,
        slabs_pubkeys,
        user_markets_pubkeys,
        user_pubkeys,
        uhl_pubkeys
        )

    markets = AverMarket.get_markets_from_account_states(
        aver_client, 
        market_pubkeys, 
        multiple_account_states['market_states'], 
        multiple_account_states['market_stores'], 
        multiple_account_states['slabs'],
        [u.market.program_id for u in user_markets]
    )

    user_markets = UserMarket.get_user_markets_from_account_state(
        aver_client,
        user_markets_pubkeys,
        multiple_account_states['user_market_states'],
        markets,
        multiple_account_states['user_balance_states'],
        multiple_account_states['user_host_lifetime_states'],
        uhl_pubkeys
    )
    
    return user_markets

async def refresh_user_market(aver_client: AverClient, user_market: UserMarket) -> UserMarket:
    """
    Refresh all data for a user markets quickly

    This function optimizes the calls to the Solana network batching them efficiently so that many can be reloaded in the fewest calls.

    Also refreshes the underlying AverMarket object

    Args:
        aver_client (AverClient): AverClient object
        user_market (UserMarket): UserMarket object

    Returns:
        UserMarket: Refreshed UserMarket object
    """
    return (await refresh_multiple_user_markets(aver_client, [user_market]))[0]

