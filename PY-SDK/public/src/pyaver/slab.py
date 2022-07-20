from dataclasses import dataclass
from typing import Iterable, List, NamedTuple, Optional
from construct import ListContainer
from solana.publickey import PublicKey
from .layouts import SLAB_LAYOUT, NodeType, CALLBACK_INFO_LEN

class Callback(NamedTuple):
    user_market: PublicKey
    fee_tier: int

class SlabHeader(NamedTuple):
    account_tag: int
    bump_index: int
    free_list_len: int
    free_list_head: int
    callback_memory_offset: int
    callback_free_list_len: int
    callback_free_list_head: int
    callback_bump_index: int
    root_node: int
    leaf_count: int
    market_address: PublicKey


# Used as dummy value for SlabNode#next.
NONE_NEXT = -1


# UninitializedNode, FreeNode and LastFreeNode all maps to this class.
@dataclass(frozen=True)
class SlabNode:
    is_initialized: bool
    next: int

@dataclass(frozen=True)
class SlabLeafNode(SlabNode):
    key: int
    callback_info_pt: int
    base_quantity: int
    user_market: PublicKey
    fee_tier: int

@dataclass(frozen=True)
class SlabInnerNode(SlabNode):
    prefix_len: int
    key: int
    children: List[int]


class Slab:
    """
    Slab object

    A Slab is one side of the orderbook (bids or asks), which contains all of the open orders for side and outcome in a given market
    """
    def __init__(self, header: SlabHeader, nodes: List[SlabNode]): 
        self._header: SlabHeader = header
        self._nodes: List[SlabNode] = nodes

    @staticmethod
    def __build(nodes: ListContainer, buffer: bytes) -> List[SlabNode]:
        res: List[SlabNode] = []
        for construct_node in nodes:
            node_type = construct_node.tag
            node = construct_node.node
            if node_type == NodeType.UNINTIALIZED:
                res.append(SlabNode(is_initialized=False, next=-1))
            elif node_type == NodeType.LEAF_NODE:
                res.append(
                    SlabLeafNode(
                        key = int.from_bytes(node.key, "little"),
                        callback_info_pt = node.callback_info_pt,
                        base_quantity = node.base_quantity,
                        is_initialized = True,
                        next = NONE_NEXT,
                        user_market = PublicKey(buffer[node.callback_info_pt:node.callback_info_pt+CALLBACK_INFO_LEN-1]),
                        fee_tier = int.from_bytes(buffer[node.callback_info_pt+CALLBACK_INFO_LEN-1:node.callback_info_pt+CALLBACK_INFO_LEN], "little"),
                    )
                )
            elif node_type == NodeType.INNER_NODE:
                res.append(
                    SlabInnerNode(
                        prefix_len = node.prefix_len,
                        key = int.from_bytes(node.key, "little"),
                        children = node.children,
                        is_initialized = True,
                        next = NONE_NEXT,
                    )
                )
            elif node_type == NodeType.FREE_NODE:
                res.append(
                    SlabNode(
                        is_initialized=True,
                        next=node.next
                    )
                )
            elif node_type == NodeType.LAST_FREE_NODE:
                res.append(
                    SlabNode(
                        is_initialized=True,
                        next=NONE_NEXT
                    )
                )
            else:
                raise RuntimeError("Unrecognized node type" + node.tag)
        return res        

    @staticmethod
    def from_bytes(buffer: bytes):
        """
        Parses raw onchain data to Slab object

        Args:
            buffer (bytes): Raw bytes coming from onchain

        Returns:
            Slab: Slab object
        """
        parsed_slab = SLAB_LAYOUT.parse(buffer)
        header = parsed_slab.header
        nodes = parsed_slab.nodes
        return Slab(
            SlabHeader(
                account_tag=header.account_tag,
                bump_index=header.bump_index,
                free_list_len=header.free_list_len,
                free_list_head=header.free_list_head,
                callback_memory_offset=header.callback_memory_offset,
                callback_free_list_len=header.callback_free_list_len,
                callback_free_list_head=header.callback_free_list_head,
                callback_bump_index=header.callback_bump_index,
                root_node=header.root_node,
                leaf_count=header.leaf_count,
                market_address=PublicKey(header.market_address),
            ),
            Slab.__build(nodes, buffer),
        )

    def get(self, search_key: int) -> Optional[SlabLeafNode]:
        if self._header.leaf_count == 0:
            return None
        index: int = self._header.root_node
        while True:
            node: SlabNode = self._nodes[index]
            if isinstance(node, SlabLeafNode):  # pylint: disable=no-else-return
                return node if node.key == search_key else None
            elif isinstance(node, SlabInnerNode):
                if (node.key ^ search_key) >> (128 - node.prefix_len) != 0:
                    return None
                # Check if the n-th bit (start from the least significant, i.e. rightmost) of the key is set
                index = node.children[(search_key >> (128 - node.prefix_len - 1)) & 1]
            else:
                raise RuntimeError("Should not go here! Node type not recognize.")

    def __iter__(self) -> Iterable[SlabLeafNode]:
        return self.items(False)

    def items(self, descending=False) -> Iterable[SlabLeafNode]:
        """
        Depth first traversal of the Binary Tree of orders in the Slab

        Args:
            descending (bool, optional): Decides if the price should descending or not. Defaults to False.

        Raises:
            RuntimeError: Neither of leaf node or tree node!

        Returns:
            Iterable[SlabLeafNode]: SlabLeafNode object
        """
        if self._header.leaf_count == 0:
            return
        stack = [self._header.root_node]
        while stack:
            index = stack.pop()
            node: SlabNode = self._nodes[index]
            if isinstance(node, SlabLeafNode):
                yield node
            elif isinstance(node, SlabInnerNode):
                if descending:
                    stack.append(node.children[0])
                    stack.append(node.children[1])
                else:
                    stack.append(node.children[1])
                    stack.append(node.children[0])
            else:
                raise RuntimeError("Neither of leaf node or tree node!")