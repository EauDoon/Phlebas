// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

interface IERC20Settlement {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IERC1271 {
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4);
}

/// @notice Testnet CLOB settlement. Non-upgradeable. No oracle. No seizure.
contract Settlement {
    bytes32 public constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address maker,uint8 side,address baseAsset,address quoteAsset,uint128 baseAmount,uint128 limitPriceTicks,uint8 timeInForce,uint64 nonce,uint64 accountEpoch,uint64 expiry,uint256 salt,address recipient,uint16 maximumFeeBps,uint8 allowedVenues)"
    );
    bytes4 internal constant ERC1271_MAGIC = 0x1626ba7e;
    uint16 public constant MAKER_FEE_BPS = 5;
    uint16 public constant TAKER_FEE_BPS = 15;
    uint16 public constant MAX_FEE_BPS = 30;
    uint16 public constant VENUE_CLOB = 1;
    uint8 public constant TIF_GTC = 0;
    uint8 public constant TIF_IOC = 1;
    uint8 public constant TIF_FOK = 2;
    uint256 public constant QUOTE_COST_DIVISOR = 10_000;
    uint256 internal constant FEE_BPS_DIVISOR = 10_000;
    uint256 internal constant SECP256K1_HALF_ORDER = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    struct Order {
        address maker;
        uint8 side;
        address baseAsset;
        address quoteAsset;
        uint128 baseAmount;
        uint128 limitPriceTicks;
        uint8 timeInForce;
        uint64 nonce;
        uint64 accountEpoch;
        uint64 expiry;
        uint256 salt;
        address recipient;
        uint16 maximumFeeBps;
        uint8 allowedVenues;
    }

    address public immutable zec;
    address public immutable usdc;
    address public immutable usdt;
    address public immutable feeRecipient;
    address public immutable pauser;
    address public immutable governor;
    bool public paused;
    bool private locked;
    bytes32 public immutable domainSeparator;

    mapping(address => uint64) public epoch;
    mapping(address => mapping(uint256 => uint256)) public nonceBitmap;
    mapping(bytes32 => uint128) public filled;

    error Paused();
    error NotPauser();
    error NotGovernor();
    error Expired();
    error Pair();
    error Signature();
    error Epoch();
    error Canceled();
    error Venue();
    error Side();
    error Price();
    error Fill();
    error Fee();
    error Transfer();
    error Locked();
    error InvalidConfiguration();
    error TimeInForce();
    error SelfTrade();

    event PauseSet(bool paused);
    event NonceCanceled(address indexed maker, uint64 indexed nonce);
    event EpochIncremented(address indexed maker, uint64 epoch);
    event OrdersSettled(
        bytes32 indexed makerHash,
        bytes32 indexed takerHash,
        address indexed quoteAsset,
        uint128 baseAmount,
        uint256 buyerDebited,
        uint256 sellerCredited,
        uint256 feeRecipientCredited
    );

    modifier lock() {
        if (locked) revert Locked();
        locked = true;
        _;
        locked = false;
    }

    constructor(
        address zec_,
        address usdc_,
        address usdt_,
        address feeRecipient_,
        address pauser_,
        address governor_
    ) {
        if (
            zec_ == address(0) || usdc_ == address(0) || usdt_ == address(0) || feeRecipient_ == address(0)
                || pauser_ == address(0) || governor_ == address(0) || zec_ == usdc_ || zec_ == usdt_
                || usdc_ == usdt_ || zec_.code.length == 0 || usdc_.code.length == 0 || usdt_.code.length == 0
        ) revert InvalidConfiguration();
        zec = zec_;
        usdc = usdc_;
        usdt = usdt_;
        feeRecipient = feeRecipient_;
        pauser = pauser_;
        governor = governor_;
        domainSeparator = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("PhlebasSettlement")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function pause() external {
        if (msg.sender != pauser) revert NotPauser();
        paused = true;
        emit PauseSet(true);
    }

    function unpause() external {
        if (msg.sender != governor) revert NotGovernor();
        paused = false;
        emit PauseSet(false);
    }

    function cancelNonce(uint64 nonce) external {
        nonceBitmap[msg.sender][nonce >> 8] |= uint256(1) << (uint256(nonce) & 255);
        emit NonceCanceled(msg.sender, nonce);
    }

    function incrementEpoch() external {
        epoch[msg.sender] += 1;
        emit EpochIncremented(msg.sender, epoch[msg.sender]);
    }

    function nonceCanceled(address maker, uint64 nonce) public view returns (bool) {
        return (nonceBitmap[maker][nonce >> 8] & (uint256(1) << (uint256(nonce) & 255))) != 0;
    }

    function hashOrder(Order calldata order) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                order.maker,
                order.side,
                order.baseAsset,
                order.quoteAsset,
                order.baseAmount,
                order.limitPriceTicks,
                order.timeInForce,
                order.nonce,
                order.accountEpoch,
                order.expiry,
                order.salt,
                order.recipient,
                order.maximumFeeBps,
                order.allowedVenues
            )
        );
    }

    function digest(Order calldata order) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, hashOrder(order)));
    }

    function quoteDown(uint256 size, uint256 ticks) public pure returns (uint256) {
        return (size * ticks) / QUOTE_COST_DIVISOR;
    }

    function quoteUp(uint256 size, uint256 ticks) public pure returns (uint256) {
        if (size == 0 || ticks == 0) return 0;
        return ((size * ticks - 1) / QUOTE_COST_DIVISOR) + 1;
    }

    function settle(
        Order calldata makerOrder,
        bytes calldata makerSignature,
        Order calldata takerOrder,
        bytes calldata takerSignature,
        uint128 baseFillAmount
    ) external lock {
        if (paused) revert Paused();
        if (makerOrder.side == takerOrder.side) revert Side();
        if (makerOrder.maker == takerOrder.maker) revert SelfTrade();
        if (makerOrder.baseAsset != zec || takerOrder.baseAsset != zec) revert Pair();
        if (makerOrder.quoteAsset != takerOrder.quoteAsset) revert Pair();
        _assertQuote(makerOrder.quoteAsset);
        _assertLiveOrder(makerOrder, makerSignature);
        _assertLiveOrder(takerOrder, takerSignature);
        if (baseFillAmount == 0) revert Fill();

        bytes32 makerHash = hashOrder(makerOrder);
        bytes32 takerHash = hashOrder(takerOrder);
        if (makerOrder.timeInForce != TIF_GTC) revert TimeInForce();
        if (filled[makerHash] + baseFillAmount > makerOrder.baseAmount) revert Fill();
        if (filled[takerHash] + baseFillAmount > takerOrder.baseAmount) revert Fill();
        if (takerOrder.timeInForce == TIF_FOK && baseFillAmount != takerOrder.baseAmount) revert Fill();

        uint8 buySide = makerOrder.side == 0 ? 0 : 1;
        if (buySide == 0) {
            if (makerOrder.limitPriceTicks < takerOrder.limitPriceTicks) revert Price();
        } else {
            if (takerOrder.limitPriceTicks < makerOrder.limitPriceTicks) revert Price();
        }

        uint256 execTicks = makerOrder.limitPriceTicks;
        uint256 buyerPays = quoteUp(baseFillAmount, execTicks);
        uint256 sellerReceives = quoteDown(baseFillAmount, execTicks);
        if (buyerPays == 0 || sellerReceives == 0) revert Fill();

        uint16 makerFeeBps = MAKER_FEE_BPS;
        uint16 takerFeeBps = TAKER_FEE_BPS;
        if (makerFeeBps > makerOrder.maximumFeeBps || takerFeeBps > takerOrder.maximumFeeBps) revert Fee();
        uint256 makerFee = (sellerReceives * makerFeeBps) / FEE_BPS_DIVISOR;
        uint256 takerFee = (buyerPays * takerFeeBps) / FEE_BPS_DIVISOR;

        address buyer = makerOrder.side == 0 ? makerOrder.maker : takerOrder.maker;
        address seller = makerOrder.side == 1 ? makerOrder.maker : takerOrder.maker;
        address buyerRecipient = makerOrder.side == 0 ? makerOrder.recipient : takerOrder.recipient;
        address sellerRecipient = makerOrder.side == 1 ? makerOrder.recipient : takerOrder.recipient;
        uint256 buyerFee = makerOrder.side == 0 ? makerFee : takerFee;
        uint256 sellerFee = makerOrder.side == 1 ? makerFee : takerFee;

        filled[makerHash] += baseFillAmount;
        filled[takerHash] =
            takerOrder.timeInForce == TIF_GTC ? filled[takerHash] + baseFillAmount : takerOrder.baseAmount;

        if (!_transfer(zec, seller, buyerRecipient, baseFillAmount)) revert Transfer();
        if (!_transfer(makerOrder.quoteAsset, buyer, sellerRecipient, sellerReceives - sellerFee)) revert Transfer();
        if (buyerFee + sellerFee > 0) {
            if (!_transfer(
                    makerOrder.quoteAsset, buyer, feeRecipient, buyerFee + sellerFee + (buyerPays - sellerReceives)
                )) {
                revert Transfer();
            }
        } else if (buyerPays > sellerReceives) {
            if (!_transfer(makerOrder.quoteAsset, buyer, feeRecipient, buyerPays - sellerReceives)) revert Transfer();
        }
        emit OrdersSettled(
            makerHash,
            takerHash,
            makerOrder.quoteAsset,
            baseFillAmount,
            buyerPays + buyerFee,
            sellerReceives - sellerFee,
            buyerFee + sellerFee + (buyerPays - sellerReceives)
        );
    }

    function _assertQuote(address quote) internal view {
        if (quote != usdc && quote != usdt) revert Pair();
    }

    function _assertLiveOrder(Order calldata order, bytes calldata signature) internal view {
        if (order.expiry != 0 && order.expiry < block.timestamp) revert Expired();
        if (order.accountEpoch != epoch[order.maker]) revert Epoch();
        if (nonceCanceled(order.maker, order.nonce)) revert Canceled();
        if (order.maximumFeeBps > MAX_FEE_BPS) revert Fee();
        if (order.allowedVenues & VENUE_CLOB == 0) revert Venue();
        if (order.side > 1) revert Side();
        if (order.timeInForce > TIF_FOK) revert TimeInForce();
        if (order.recipient == address(0) || order.maker == address(0)) revert Signature();
        bytes32 hashed = digest(order);
        if (!_validSignature(order.maker, hashed, signature)) revert Signature();
    }

    function _validSignature(address maker, bytes32 hashed, bytes calldata signature) internal view returns (bool) {
        if (maker.code.length > 0) {
            return IERC1271(maker).isValidSignature(hashed, signature) == ERC1271_MAGIC;
        }
        if (signature.length != 65) return false;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return false;
        if (r == bytes32(0) || uint256(s) == 0 || uint256(s) > SECP256K1_HALF_ORDER) return false;
        return ecrecover(hashed, v, r, s) == maker;
    }

    function _transfer(address token, address from, address to, uint256 amount) internal returns (bool) {
        if (amount == 0) return true;
        (bool success, bytes memory result) =
            token.call(abi.encodeCall(IERC20Settlement.transferFrom, (from, to, amount)));
        return success && (result.length == 0 || (result.length == 32 && abi.decode(result, (bool))));
    }
}
