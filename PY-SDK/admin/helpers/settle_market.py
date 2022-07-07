from typing import List
from solana.publickey import PublicKey
from solana.keypair import Keypair
from solana.transaction import AccountMeta
from pyaver.market import AverMarket
from spl.token.constants import TOKEN_PROGRAM_ID
from anchorpy import Context
from pyaver.refresh import refresh_market
from .settle_crank import get_uma_accounts_for_market
from pyaver.user_market import UserMarket
from pyaver.user_host_lifetime import UserHostLifetime
import math
from solana.rpc.commitment import Confirmed

MAX_ACCOUNTS_TO_SETTLE = 2

async def settle_market(
    market: AverMarket,
    reward_target: PublicKey = None,
    payer: Keypair = None,
):
    '''
    '''
   
    if reward_target == None:
        reward_target = market.aver_client.owner.public_key
    if payer == None:
        payer = market.aver_client.owner

    refreshed_market = await refresh_market(market.aver_client, market)
    
    print(f'Settling for market: {market.market_pubkey}')

    # Get and load all of the remaining UMAs for this market
    umas_buffers_all = get_uma_accounts_for_market(market.aver_client, market.market_pubkey)
    umas_loaded_all = await UserMarket.load_multiple_by_uma(market.aver_client, [PublicKey(x) for x in umas_buffers_all.keys()], [market for _i in umas_buffers_all.keys()])
    umas_by_user_all = {uma.user_market_state.user: uma for uma in umas_loaded_all}

    print(f' - UMAs remaining to settle: {len(umas_by_user_all)}')

    # Get all of the remaining UHLs for the user's who own these UMAs
    uhl_pubkeys_all = [uma.user_market_state.user_host_lifetime for uma in umas_by_user_all.values()]
    uhl_loaded_all = await UserHostLifetime.load_multiple(market.aver_client, uhl_pubkeys_all)
    uhls_by_user_all = {uhl.user_host_lifetime_state.user: uhl for uhl in uhl_loaded_all}
    
    print(f' - UHLs obtained for UMAs (should equal): {len(uhls_by_user_all)}')

    host_pubkeys = list(set([uhl.user_host_lifetime_state.host for uhl in uhls_by_user_all.values()]))
    host_accounts_quads_all = {host_pubkey: [] for host_pubkey in host_pubkeys}
    
    print(f' - Number of unique hosts: {len(host_pubkeys)}')

    for user_pubkey, uma in umas_by_user_all.items():
        uhl = uhls_by_user_all[user_pubkey]
        host_accounts_quads_all[uhl.user_host_lifetime_state.host] += [PublicKey(user_pubkey), PublicKey(uma.pubkey), PublicKey(uhl.pubkey), PublicKey(uhl.user_host_lifetime_state.user_quote_token_ata)]

    print(f' - For each host, we need to iterate sepeare lists...')

    for host_pubkey, host_specific_accounts in host_accounts_quads_all.items():
        print(f'  - For host: {host_pubkey}')
        print(f'  - UMAs to settle: {len(host_specific_accounts)}')

        number_of_chunks = math.ceil((len(host_specific_accounts)/4)/MAX_ACCOUNTS_TO_SETTLE)
        host_specific_accounts_remaining = host_specific_accounts
        
        print(f'  - In {number_of_chunks} chunks of {MAX_ACCOUNTS_TO_SETTLE}')

        for chunk_idx in range(number_of_chunks):
            chunk_accounts = host_specific_accounts_remaining[:MAX_ACCOUNTS_TO_SETTLE*4]
            host_specific_accounts_remaining = host_specific_accounts_remaining[len(chunk_accounts):]
            
            print(f'  - Settling chunk #{chunk_idx}: {chunk_accounts}')

            sig = await send_settle_market(
                market=market,
                host=PublicKey(host_pubkey),
                user_accounts=chunk_accounts, # [x for x in y for y in chunk_accounts]
                reward_target=reward_target,
                payer=payer,
            )
            market.aver_client.solana_client.confirm_transaction(sig, Confirmed)

    return await refresh_market(market.aver_client, refreshed_market)

def prepare_user_accounts_list(user_account: List[PublicKey]) -> List[PublicKey]:
    str_list = [str(pk) for pk in user_account]
    deduped_list = list(set(str_list))
    # TODO: Not clear if this sort is doing the same thing as dex_v4 - they use .sort_unstable()
    sorted_list = sorted(deduped_list)
    pubkey_list = [PublicKey(stpk) for stpk in sorted_list]
    return pubkey_list


async def send_settle_market(
    market: AverMarket,
    host: PublicKey,
    user_accounts: list[PublicKey],
    reward_target: PublicKey = None,
    payer: Keypair = None,
):
    if reward_target == None:
        reward_target = market.aver_client.owner.public_key
    if payer == None:
        payer = market.aver_client.owner
    
    remaining_accounts = [AccountMeta(
        pk, False, True
    ) for pk in user_accounts]

    return await market.aver_client.program.rpc["settle"](
            ctx=Context(
                accounts={
                    "market": market.market_pubkey,
                    "vault_authority": market.market_state.vault_authority,
                    "quote_vault": market.market_state.quote_vault,
                    "host": host,
                    "reward_target": reward_target,
                    "spl_token_program": TOKEN_PROGRAM_ID,

                },
                remaining_accounts=remaining_accounts,
                signers=[
                    payer
                ],
            ),
        )