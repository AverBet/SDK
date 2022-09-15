from requests import post
from solana.publickey import PublicKey

def request_token_airdrop(
    aver_api_endpoint: str,
    quote_token: PublicKey,
    owner: PublicKey, 
    amount: int = 1_000_000_000,
    ):

    url = aver_api_endpoint + '/airdrop'

    body = {
        'wallet': owner.to_base58(),
        'mint': quote_token.__str__(),
        'amount': amount
    }

    response = post(url, body)
    return response.json()