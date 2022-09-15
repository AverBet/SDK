from solana.publickey import PublicKey
from .enums import Side
from .utils import load_bytes_data, load_multiple_bytes_data
from .data_classes import Price, SlabOrder, UmaOrder
from .slab import Slab
from solana.rpc.async_api import AsyncClient
from solana.utils.helpers import to_uint8_bytes

class Orderbook:
    """
    Orderbook object

    Contains information on open orders on both the bids and asks of a particular outcome in a market
    """

    pubkey: PublicKey
    """
    Orderbook public key
    """
    slab_bids: Slab
    """
    Slab object for bids
    """
    slab_asks: Slab
    """
    Slab object for asks
    """
    slab_bids_pubkey: PublicKey
    """
    Public key of the account containing the bids
    """
    slab_asks_pubkey: PublicKey
    """
    Public key of the account containing the asks
    """
    decimals: int
    """
    Decimal precision for orderbook
    """
    is_inverted: bool
    """
    Whether the bids and asks should be interpretted as inverted when parsing the data. (Used in the case of the second outcome in a two-outcome market.)
    """

    def __init__(
        self, 
        pubkey: PublicKey, 
        slab_bids: Slab,
        slab_asks: Slab,
        slab_bids_pubkey: PublicKey,
        slab_asks_pubkey: PublicKey,
        decimals: int,
        is_inverted: bool = False
        ):
        """
        Initialise an Orderbook object. Do not use this function; use Orderbook.load() instead

        Args:
            pubkey (PublicKey): Orderbook public key
            slab_bids (Slab): Slab object for bids
            slab_asks (Slab): Slab object for asks
            slab_bids_pubkey (PublicKey): Slab bids public key
            slab_asks_pubkey (PublicKey): Slab asks public key
            decimals (int): Decimal precision for orderbook
            is_inverted (bool, optional): Whether the bids and asks have been switched with each other. Defaults to False.
        """
        self.decimals = decimals
        self.pubkey = pubkey
        self.slab_bids = slab_bids
        self.slab_asks = slab_asks
        self.slab_bids_pubkey = slab_bids_pubkey
        self.slab_asks_pubkey = slab_asks_pubkey
        self.is_inverted = is_inverted
    
    @staticmethod
    async def load(
        conn: AsyncClient, 
        slab_bids_pubkey: PublicKey, 
        slab_asks_pubkey: PublicKey, 
        orderbook_pubkey: PublicKey, 
        decimals: int, 
        is_inverted: bool = False
        ):
        """
        Initialise an Orderbook object

        Parameters are found in MarketStoreStates' --> OrderbookAccounts

        Args:
            conn (AsyncClient): Solana AsyncClient object
            slab_bids_pubkey (PublicKey): Slab bids public key
            slab_asks_pubkey (PublicKey): Slab asks public key
            orderbook_pubkey (PublicKey): Orderbook public key
            decimals (int): Decimal precision for orderbook
            is_inverted (bool, optional): Whether the bids and asks have been switched with each other. Defaults to False.

        Returns:
            Orderbook: Orderbook object
        """

        slab_bids = await Orderbook.load_slab(conn, slab_bids_pubkey)
        slab_asks  = await Orderbook.load_slab(conn, slab_asks_pubkey)

        return Orderbook(
            pubkey=orderbook_pubkey, 
            slab_bids=slab_bids, 
            slab_asks=slab_asks, 
            slab_asks_pubkey=slab_asks_pubkey, 
            slab_bids_pubkey=slab_bids_pubkey, 
            decimals=decimals,
            is_inverted=is_inverted
            )

    @staticmethod
    async def load_slab(conn: AsyncClient, slab_address: PublicKey):
        """
        Loads onchain data for a Slab (contains orders for a particular side of the orderbook)

        Args:
            conn (AsyncClient): Solana AsyncClient object
            slab_address (PublicKey): Slab public key

        Returns:
            Slab: Slab object
        """
        data = await load_bytes_data(conn, slab_address)
        return Slab.from_bytes(data)

    @staticmethod
    async def load_multiple_slabs(conn: AsyncClient, slab_addresses: list[PublicKey]):
        """
        Loads onchain data for multiple Slabs (contains orders for a particular side of the orderbook)

        Args:
            conn (AsyncClient): Solana AsyncClient object
            slab_addresses (list[PublicKey]): List of slab public keys

        Returns:
            list[Slab]: List of Slab objects
        """
        data = await load_multiple_bytes_data(conn, slab_addresses)
        slabs = []
        for d in data:
            slabs.append(Slab.from_bytes(d))
        return slabs

    def invert(self):
        """
        Returns a version of the orderbook which has been parsed with bids and asks swtiched and
        prices inverted. (Used for the second outcome in a two-outcome market)

        Returns:
            Orderbook: Orderbook object
        """
        return Orderbook(
            self.pubkey,
            self.slab_asks,
            self.slab_bids,
            self.slab_asks_pubkey,
            self.slab_bids_pubkey,
            self.decimals,
            True
        )
    
    
    @staticmethod
    def convert_price(p: Price, decimals: int):
        """
        Converts price to correct order of magnitude based on decimal precision

        Args:
            p (Price): Unconverted Price object
            decimals (int): Decimal precision for orderbook

        Returns:
            Price: Price object
        """
        exp = 10 ** decimals
        return Price(
            price=p.price / exp,
            #price=round((p.price / 2 ** 32) * exp) / exp,
            size=p.size / exp
        )
    
    @staticmethod
    def get_L2_for_slab(
        slab: Slab, 
        depth: int, 
        increasing : bool, 
        decimals: int, 
        ui_amount=False, 
        is_inverted=False
        ):
        """
        Get Level 2 market information for a particular slab

        This contains information on orders on the slab aggregated by price tick.

        Args:
            slab (Slab): Slab object
            depth (int): Number of orders to return
            increasing (bool): Sort orders increasing
            decimals (int): Decimal precision for orderbook
            ui_amount (bool, optional): Converts prices based on decimal precision if true. Defaults to False.
            is_inverted (bool, optional): Whether the bids and asks have been switched with each other. Defaults to False.

        Returns:
            list[Price]: List of Price objects (size and price) corresponding to orders on the slab
        """

        l2_depth = Orderbook.__get_L2(slab, depth, decimals, increasing)
        if(ui_amount):
            l2_depth = [Orderbook.convert_price(p, decimals) for p in l2_depth]

        if(is_inverted):
            l2_depth = [Orderbook.invert_price(p) for p in l2_depth]

        return l2_depth

    @staticmethod
    def __get_L2(slab: Slab, depth: int, decimals: int, increasing: bool):
        """Get the Level 2 market information."""
        # The first element of the inner list is price, the second is quantity.
        levels: list[list[int]] = []
        for node in slab.items(descending=not increasing):
            price = Orderbook.__get_price_from_slab(node, decimals)
            if len(levels) > 0 and levels[len(levels) - 1][0] == price:
                levels[len(levels) - 1][1] += node.base_quantity
            elif len(levels) == depth:
                break
            else:
                levels.append([price, node.base_quantity])
        return [
            Price(
                price=price_lots, 
                size=size_lots
            )
            for price_lots, size_lots in levels
        ]
    
    @staticmethod
    def __get_L3(slab: Slab, decimals: int, increasing: bool, is_inverted: bool):
        """Get the Level 1 market information."""
        # The first element of the inner list is price, the second is quantity.
        orders: list[SlabOrder] = []
        for node in slab.items(descending = not increasing):
            orders += [SlabOrder(
                id = node.key,
                price = (10**decimals) - Orderbook.__get_price_from_slab(node, decimals) if is_inverted else Orderbook.__get_price_from_slab(node, decimals),
                price_ui = 1 - Orderbook.__get_price_from_slab(node, decimals) * (10**-decimals) if is_inverted else Orderbook.__get_price_from_slab(node, decimals) * (10**-decimals),
                base_quantity = node.base_quantity,
                base_quantity_ui = node.base_quantity * (10**-decimals),
                user_market = node.user_market,
                fee_tier = node.fee_tier,
            )]

        return orders

    @staticmethod
    def __get_price_from_slab(node, decimals: int):
        return float(round( ((node.key >> 64)/(2**32)) * 10**decimals))

    @staticmethod
    def invert_price(p: Price):
        """
        Inverts prices

        This is used when inverting the second outcome in a two-outcome market.

        When switching prices between bids and asks, the price is `1-p`. 

        Example, a BUY on A at a (probability) price of 0.4 is equivelant to a SELL on B at a price of 0.6 (1-0.4) and vice versa.

        Args:
            p (Price): Price object

        Returns:
            Price: Price object
        """
        return Price(
            price=1-p.price, 
            size=p.size
            )

    def derive_orderbook(market: PublicKey, outcome_id: int, program_id: PublicKey):
        """
        Derives PDA (Program Derived Account) for Orderbook public key.
        Orderbook account addresses are derived deterministically using the market's pubkey and outcome id

        Args:
            market_pubkey (PublicKey): Market public key
            outcome_id (int): Outcome ID
            program_id (PublicKey): Program public key

        Returns:
            Orderbook Public Key (PublicKey): Orderbook Public Key
        """
        return PublicKey.find_program_address(
            [bytes('orderbook', 'utf-8'), bytes(market), to_uint8_bytes(outcome_id)], program_id
        )


    def derive_event_queue(market: PublicKey, outcome_id: int, program_id: PublicKey):
        """
        Derives PDA (Program Derived Account) for Event Queue public key.
        EventQueue account addresses are derived deterministically using the market's pubkey and outcome id

        Args:
            market_pubkey (PublicKey): Market public key
            outcome_id (int): Outcome ID
            program_id (PublicKey): Program public key

        Returns:
            EventQueue Public Key (PublicKey): EventQueue Public Key
        """
        return PublicKey.find_program_address(
            [bytes('event-queue', 'utf-8'), bytes(market), to_uint8_bytes(outcome_id)], program_id
        )


    def derive_bids(market: PublicKey, outcome_id: int, program_id: PublicKey):
        """
        Derives PDA (Program Derived Account) for Bids public key.
        Bids account addresses are derived deterministically using the market's pubkey and outcome id

        Args:
            market_pubkey (PublicKey): Market public key
            outcome_id (int): Outcome ID
            program_id (PublicKey): Program public key

        Returns:
            Bids Public Key (PublicKey): Bids Public Key
        """
        return PublicKey.find_program_address(
            [bytes('bids', 'utf-8'), bytes(market), to_uint8_bytes(outcome_id)], program_id
        )


    def derive_asks(market: PublicKey, outcome_id: int, program_id: PublicKey):
        """
        Derives PDA (Program Derived Account) for Bids public key.
        Bids account addresses are derived deterministically using the market's pubkey and outcome id

        Args:
            market_pubkey (PublicKey): Market public key
            outcome_id (int): Outcome ID
            program_id (PublicKey): Program public key

        Returns:
            Bids Public Key (PublicKey): Bids Public Key
        """
        return PublicKey.find_program_address(
            [bytes('asks', 'utf-8'), bytes(market), to_uint8_bytes(outcome_id)], program_id
        )

    def get_bids_L3(self):
        """
        Gets level 1 market information for bids.

        See https://www.thebalance.com/order-book-level-2-market-data-and-depth-of-market-1031118 for more information

        Returns:
            list[SlabOrder]: List of slab orders for bids
        """
        is_increasing = False
        if(self.is_inverted):
            is_increasing = True
        
        return Orderbook.__get_L3(
            self.slab_bids,
            self.decimals,
            is_increasing,
            self.is_inverted
        )

    def get_asks_L3(self):
        """
        Gets level 1 market information for asks

        See https://www.thebalance.com/order-book-level-2-market-data-and-depth-of-market-1031118 for more information

        Returns:
            list[SlabOrder]: List of slab orders for asks
        """
        is_increasing = True
        if(self.is_inverted):
            is_increasing = False
        
        return Orderbook.__get_L3(
            self.slab_asks,
            self.decimals,
            is_increasing,
            self.is_inverted
        )


    def get_bids_l2(self, depth: int, ui_amount: bool):
        """
        Gets level 1 market information for bids

        See https://www.thebalance.com/order-book-level-2-market-data-and-depth-of-market-1031118 for more information

        Args:
            depth (int): Number of orders to return
            ui_amount (bool): Converts prices based on decimal precision if true.

        Returns:
            list[Price]: List of Price objects (size and price) corresponding to orders on the slab
        """
        is_increasing = False
        if(self.is_inverted):
            is_increasing = True
        
        return Orderbook.get_L2_for_slab(
            self.slab_bids,
            depth,
            is_increasing,
            self.decimals,
            ui_amount,
            self.is_inverted,
        )

    def get_asks_l2(self, depth: int, ui_amount: bool):
        """
        Gets level 1 market information for asks

        See https://www.thebalance.com/order-book-level-2-market-data-and-depth-of-market-1031118 for more information

        Args:
            depth (int): Number of orders to return
            ui_amount (bool): Converts prices based on decimal precision if true.

        Returns:
            list[Price]: List of Price objects (size and probability price) corresponding to orders on the slab
        """
        is_increasing = True
        if(self.is_inverted):
            is_increasing = False
        
        return Orderbook.get_L2_for_slab(
            self.slab_asks,
            depth,
            is_increasing,
            self.decimals,
            ui_amount,
            self.is_inverted,
        )
    
    def get_best_bid_price(self, ui_amount: bool):
        """
        Gets the best bid price

        Args:
            ui_amount (bool):  Converts prices based on decimal precision if true.

        Returns:
            Price: Price object (size and price)
        """
        bids = self.get_bids_l2(1, ui_amount)
        if(bids is not None and len(bids) > 0):
            return bids[0]
        return None

    def get_best_ask_price(self, ui_amount: bool):
        """
        Gets the best ask price

        Args:
            ui_amount (bool):  Converts prices based on decimal precision if true.

        Returns:
            Price: Price object (size and price)
        """
        asks = self.get_asks_l2(1, ui_amount)
        if(asks is not None and len(asks) > 0):
            return asks[0]
        return None
    
    def get_bid_price_by_order_id(self, order: UmaOrder):
        """
        Gets bid Price object by UMA Order

        Args:
            UMA Order (UmaOrder): UMA Order

        Returns:
            Price: Price object (size and price)
        """
        order_id = order.aaob_order_id if order.aaob_order_id else order.order_id
        bid = self.slab_bids.get(order_id)
        if(bid is None):
            return None
        
        exp = 10 ** self.decimals
        bid_price = Price(price=bid.key >> 64, size=bid.base_quantity)
        #bid_price = Orderbook.convert_price(bid_price, self.decimals)
        bid_price.price = round((bid_price.price / 2 ** 32) * exp) / exp
        bid_price.size = bid_price.size / exp

        if(self.is_inverted):
            bid_price = Orderbook.invert_price(bid_price)
        
        return bid_price

    def get_ask_price_by_order_id(self, order: UmaOrder):
        """
        Gets ask Price object by UMA Order

        Args:
            UMA Order (UmaOrder): UMA Order

        Returns:
            Price: Price object (size and price)
        """
        order_id = order.aaob_order_id if order.aaob_order_id else order.order_id
        ask = self.slab_asks.get(order_id)
        if(ask is None):
            return None
        
        ask_price = Price(price=ask.key >> 64, size=ask.base_quantity)
        ask_price = Orderbook.convert_price(ask_price, self.decimals)

        if(self.is_inverted):
            ask_price = Orderbook.invert_price(ask_price)
        
        return ask_price
    
    def estimate_avg_fill_for_base_qty(self, base_qty: int, side: Side, ui_amount: bool):
        """
        Gets estimate of average fill price (probability format) given a base/payout quantity

        Args:
            base_qty (int): Base quantity
            side (Side): Side object (bid or ask)
            ui_amount (bool): Converts prices based on decimal precision if true.

        Returns:
            dict[str, float]: Dictionary containing `avg_price`, `worst_price`, `filled`
        """
        return self.__estimate_fill_for_qty(base_qty, side, False, ui_amount)

    def estimate_avg_fill_for_quote_qty(self, quote_qty: int, side: Side, ui_amount: bool):
        """
        Gets estimate of average fill price (probability format) given a stake/quote quantity

        Args:
            quote_qty (int): Base quantity
            side (Side): Side object (bid or ask)
            ui_amount (bool): Converts prices based on decimal precision if true.

        Returns:
            dict[str, float]: Dictionary containing `avg_price`, `worst_price`, `filled`
        """
        return self.__estimate_fill_for_qty(quote_qty, side, True, ui_amount)

    def __estimate_fill_for_qty(self, qty: int, side: Side, quote: bool, ui_amount: bool):
        """
        _summary_

        Args:
            qty (int): Quanity
            side (Side): Side object (bid or ask)
            quote (bool): Quote quantity if true. Base quantity if false.
            ui_amount (bool): Converts prices based on decimal precision if true.

        Returns:
            dict[str, float]: Dictionary containing `avg_price`, `worst_price`, `filled`
        """
        if(side == Side.BUY):
            prices = self.get_bids_l2(100, ui_amount)
        elif(side == Side.SELL):
            prices = self.get_asks_l2(100, ui_amount)
        
        if(quote):
            accumulator = lambda p: p.size
        else:
            accumulator = lambda p: p.size * p.price
        
        new_prices: list[Price] = []
        cumulative_qty = 0
        for price in prices:
            remaining_qty = qty - cumulative_qty
            if(remaining_qty <= accumulator(price)):
                cumulative_qty += remaining_qty
                new_size = remaining_qty if quote else remaining_qty/price.price
                new_prices.append(Price(price=price.price, size=new_size))
                break
            else:
                cumulative_qty += accumulator(price)
                new_prices.append(price)
        
        return {
            'avg_price': Orderbook.weighted_average(
                nums=[p.price for p in new_prices],
                weights=[p.size for p in new_prices]
            ),
            'worst_price': new_prices[-1].price,
            'filled': cumulative_qty
        }

    @staticmethod
    def weighted_average(nums, weights):
        """
        Calculates weighted average

        Args:
            nums (list[float]): List of values
            weights (list[float]): List of weights

        Returns:
            float: Weighted average
        """
        sum = 0
        weight_sum = 0

        assert len(nums) == len(weights), 'Number of weights and nums do not correspond'

        for i, num in enumerate(nums):
            weight = weights[i]
            sum += num * weight
            weight_sum += weight
        
        return sum / weight_sum