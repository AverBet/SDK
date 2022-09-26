from enum import IntEnum
from sre_constants import CALL
from unicodedata import numeric
from construct import Switch, Bytes, Int8ul, Int16ul, Int32ul, Int64ul, Padding, Int8sl
from construct import Struct as cStruct

from solana._layouts.shared import PUBLIC_KEY_LAYOUT

KEY_LAYOUT = Bytes(16)

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