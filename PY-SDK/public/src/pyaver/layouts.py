from enum import IntEnum
from construct import Switch, Bytes, Int8ul, Int32ul, Int64ul, Padding, Int64sl
from construct import Struct as cStruct

### This file is used to parse AAOB Orderbooks

PUBLIC_KEY_LAYOUT = Bytes(32)

KEY_LAYOUT = Bytes(16)

STRING_LAYOUT = cStruct(
    "string_length" / Int8ul,
    Padding(3),
    "content" / Bytes(lambda this: this.string_length)
)

STRING_VECTOR_LAYOUT = cStruct(
    "vec_length" / Int8ul,
    Padding(3),
    "strings" / STRING_LAYOUT[lambda this: this.vec_length]
)

OUTCOME_AOB_INSTANCE_LAYOUT = cStruct(
    "orderbook" / PUBLIC_KEY_LAYOUT,
    "event_queue" / PUBLIC_KEY_LAYOUT,
    "bids" / PUBLIC_KEY_LAYOUT,
    "asks" / PUBLIC_KEY_LAYOUT,
)


SLAB_HEADER_LAYOUT = cStruct(
    "account_tag" / Int8ul,
    "bump_index" / Int64ul,
    "free_list_len" / Int64ul,
    "free_list_head" / Int32ul,

    "callback_memory_offset" / Int64ul,
    "callback_free_list_len" / Int64ul,
    "callback_free_list_head" / Int64ul,
    "callback_bump_index" / Int64ul,

    "root_node" / Int32ul,
    "leaf_count" / Int64ul,
    "market_address" / PUBLIC_KEY_LAYOUT,
    Padding(7)
)


class NodeType(IntEnum):
    UNINTIALIZED = 0
    INNER_NODE = 1
    LEAF_NODE = 2
    FREE_NODE = 3
    LAST_FREE_NODE = 4

# Node size = 32 (+ tag size = 8) => SLOT_SIZE = 40


UNINTIALIZED_LAYOUT = cStruct(
    Padding(32)
)

INNER_NODE_LAYOUT = cStruct(
    "key" / KEY_LAYOUT,                # 16
    "prefix_len" / Int64ul,         # 8
    "children" / Int32ul[2],           # 8
)

LEAF_NODE_LAYOUT = cStruct(
    "key" / KEY_LAYOUT,                 # 16
    "callback_info_pt" / Int64ul,       # 8
    "base_quantity" / Int64ul,          # 8
)

FREE_NODE_LAYOUT = cStruct(
    "next" / Int32ul,                   # 4
    Padding(28)                            # -> 32
)

LAST_FREE_NODE_LAYOUT = cStruct(
    Padding(32)
)

SLAB_NODE_LAYOUT = cStruct(
    "tag" / Int64ul,
    "node"
    / Switch(
        lambda this: this.tag,
        {
            NodeType.UNINTIALIZED: UNINTIALIZED_LAYOUT,
            NodeType.INNER_NODE: INNER_NODE_LAYOUT,
            NodeType.LEAF_NODE: LEAF_NODE_LAYOUT,
            NodeType.FREE_NODE: FREE_NODE_LAYOUT,
            NodeType.LAST_FREE_NODE: LAST_FREE_NODE_LAYOUT,
        },
    ),
)

CALLBACK_INFO_LAYOUT = cStruct(
    "user_market" / PUBLIC_KEY_LAYOUT,
    "fee_tier" / Int8ul,
)
CALLBACK_INFO_LEN = 33

SLOT_SIZE = 40
SLAB_HEADER_SIZE = 97
PADDED_LEN = SLAB_HEADER_SIZE + 7

SLAB_LAYOUT = cStruct(
    "header" / SLAB_HEADER_LAYOUT,
    "nodes" / SLAB_NODE_LAYOUT[lambda this: this.header.bump_index],
)


USER_MARKET_OUTCOME_POSITION_LAYOUT = cStruct(
    "free" / Int64ul,
    "locked" / Int64ul,
)

USER_MARKET_ORDER_LAYOUT = cStruct(
    "order_id" / KEY_LAYOUT,
    "outcome_id" / Int8ul,
    "base_qty" / Int64ul,
)

CLOCK_STRUCT = cStruct(
    "slot" / Int64ul,
    "epoch_start_timestamp" / Int64sl,
    "epoch" / Int64ul,
    "leader_schedule_epoch" / Int64ul,
    "unix_timestamp" / Int64sl,
)

def USER_MARKET_STATE_LEN(number_of_outcomes: int, max_number_of_orders: int):
    return 8 + 32*4 + 3*1 +2*4 + 6*8 + 4+(number_of_outcomes * 2*8) + 4+(max_number_of_orders * (16+1+8))

####
#Event Queue

class EventType(IntEnum):
    FILL = 0
    OUT = 1

STRING_LAYOUT = cStruct(
    "string_length" / Int8ul,
    Padding(3),
    "content" / Bytes(lambda this: this.string_length)
)

EVENT_QUEUE_HEADER_LAYOUT = cStruct(
    "account_tag" / Int8ul,
    "head" / Int64ul,
    "count" / Int64ul,
    "event_size" / Int64ul,
    "seq_num" / Int64ul,
)
EVENT_QUEUE_HEADER_LEN = 33

CALLBACK_INFO_LAYOUT = cStruct(
    "user_market" / PUBLIC_KEY_LAYOUT,
    "fee_tier" / Int8ul,
)
CALLBACK_INFO_LEN = 33

ORDER_SUMMARY_SIZE = 41

REGISTER_SIZE = ORDER_SUMMARY_SIZE + 1

EVENT_SLOT_SIZE = 1 + 33 + 2*CALLBACK_INFO_LEN

FILL_LAYOUT = cStruct(
    "taker_side" / Int8ul,
    "maker_order_id" / KEY_LAYOUT,
    "quote_size" / Int64ul,
    "base_size" / Int64ul,
    "maker_callback_info" / CALLBACK_INFO_LAYOUT,
    "taker_callback_info" / CALLBACK_INFO_LAYOUT,
)

OUT_LAYOUT = cStruct(
    "side" / Int8ul,
    "order_id" / KEY_LAYOUT,
    "base_size" / Int64ul,
    "delete" / Int8ul,
    "callback_info" / CALLBACK_INFO_LAYOUT,
    # Padding(EVENT_SLOT_SIZE-59)
)

EVENT_LAYOUT = cStruct(
    "tag" / Int8ul,
    "node"
    / Switch(
        lambda this: this.tag,
        {
            EventType.FILL: FILL_LAYOUT,
            EventType.OUT: OUT_LAYOUT,
        },
    ),
)
