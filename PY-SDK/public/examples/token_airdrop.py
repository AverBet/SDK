from solana.publickey import PublicKey
from requests import post, get

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

#Only call this function once
def getApiDataInitially(url: str = 'https://api.aver.exchange/v2/markets/');
    response = get(url).json()
    return response

#Pass in API Data as loaded above.
#Also pass in market pubkeys we care about
#Make sure pubkey data is trimmed on all excess whitespace
def getPubkeyCategoryData(api_data: list, pubkeys: list(str)):
    data = {}
    for d in api_data:
        if d['pubkey'] in pubkeys:
            data[d['pubkey']] = d['event']['sub_category']['category']['name']
    
    return data