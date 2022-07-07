from jsonrpcclient import requests
from solana.keypair import Keypair
from pyaver.aver_client import AverClient
from solana.rpc.commitment import Confirmed
from .token_airdrop import request_token_airdrop

async def aver_client_setup_tests(owner: Keypair, client: AverClient):
    #TEST AVER CLIENT
    #assert owner.public_key.to_base58() == client.owner.public_key.to_base58(), 'Test aver client'
    assert client.program is not None, 'Test aver client'

    #HEALTH CHECK
    health_check_result = await client.check_health()
    assert health_check_result.get('api') is not None, 'health check'
    assert health_check_result.get('solana') is not None, 'health check'

    #AIRDROP SOL
    sig = await client.provider.connection.request_airdrop(owner.public_key, 1_000_000_000, Confirmed)
    con = await client.provider.connection.confirm_transaction(sig['result'], Confirmed)
    balance = await client.provider.connection.get_balance(owner.public_key, Confirmed)
    assert(balance['result']['value'] == 1_000_000_000), 'airdrop sol'
    
    #AIRDROP USDC
    ata = await client.get_or_create_associated_token_account(
        owner.public_key,
        owner,
    )
    assert(ata is not None), 'get or create ATA'
    sig_2 = request_token_airdrop(client.aver_api_endpoint, client.quote_token,owner.public_key, 1_000_000_000)['signature']
    await client.provider.connection.confirm_transaction(sig_2, Confirmed) 
    token_balance = await client.request_token_balance(client.quote_token, owner.public_key)
    assert(token_balance == 1_000_000_000), 'token balance check after airdrop'