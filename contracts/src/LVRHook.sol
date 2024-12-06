// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseHook} from "v4-periphery/src/base/hooks/BaseHook.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/src/types/BeforeSwapDelta.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {BrevisAppZkOnly} from "./BrevisAppZkOnly.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import { UniversalRouter } from "@uniswap/universal-router/contracts/UniversalRouter.sol";
import { Currency } from "v4-core/src/types/Currency.sol";

contract LVRHook is BaseHook, Ownable, BrevisAppZkOnly {
    using PoolIdLibrary for PoolKey;

    // Brevis verification
    bytes32 public vkHash;
    event SigmaUpdated(PoolId indexed poolId, uint256 sigma, uint64 blockNum);

    // Volatility metric
    mapping(PoolId => uint256) public sigma;
    
    // Locked liquidity tracking
    struct LiquidityPosition {
        uint256 amount;
        uint256 timestamp;
    }
    
    mapping(PoolId => mapping(address => LiquidityPosition)) public liquidityPositions;
    
    // Simplified arbitrage bid structure
    struct ArbitrageBid {
        address bidder;
        uint256 bidAmount;
        PoolKey poolKey;
        bytes[] inputs;
        bool zeroForOne;
        uint256 amountIn;
    }
    
    // Single bid per pool per block
    mapping(PoolId => mapping(uint256 => ArbitrageBid)) public currentBids;
    mapping(PoolId => bool) public pendingArbitrage;
    
    // USDC token address for fee collection
    IERC20 public immutable USDC;
    
    // Fee collection and distribution
    mapping(PoolId => uint256) public collectedFees;
    mapping(PoolId => bool) public feesPending;
    
    // Constants
    uint256 public constant BASE_FEE = 1e15; // 0.1% base fee
    uint256 public constant FEE_MULTIPLIER = 1e18;

    // LVR Bidder address and default swap data
    address public lvrBidder;
    bytes public defaultSwapCalldata;
    
    // Add router
    UniversalRouter public immutable router;
    
    constructor(
        IPoolManager _poolManager,
        address _brevisRequest,
        address _usdc,
        address _lvrBidder,
        bytes memory _defaultSwapCalldata,
        address _router
    ) BaseHook(_poolManager) Ownable(msg.sender) BrevisAppZkOnly(_brevisRequest) {
        USDC = IERC20(_usdc);
        lvrBidder = _lvrBidder;
        defaultSwapCalldata = _defaultSwapCalldata;
        router = UniversalRouter(_router);
    }

    function setVkHash(bytes32 _vkHash) external onlyOwner {
        vkHash = _vkHash;
    }

    function handleProofResult(bytes32 _vkHash, bytes calldata _circuitOutput) internal override {
        require(vkHash == _vkHash, "LVRHook: invalid vk");
        
        (PoolId poolId, uint256 sigmaValue, uint64 blockNum) = decodeOutput(_circuitOutput);
        
        // Update sigma value for the pool
        sigma[poolId] = sigmaValue;
        
        emit SigmaUpdated(poolId, sigmaValue, blockNum);
    }

    function decodeOutput(bytes calldata o) internal pure returns (PoolId, uint256, uint64) {
        uint64 blockNum = uint64(bytes8(o[0:8]));
        PoolId poolId = PoolId.wrap(bytes32(o[8:40]));
        uint256 sigmaValue = uint256(bytes32(o[40:72]));
        return (poolId, sigmaValue, blockNum);
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: true,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function calculateArbitrageFee(PoolId poolId) public view returns (uint256) {
        uint256 poolSigma = sigma[poolId];
        return (BASE_FEE * poolSigma) / FEE_MULTIPLIER;
    }

    function beforeSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        bytes calldata
    ) external override returns (bytes4, BeforeSwapDelta, uint24) {
        PoolId poolId = key.toId();
        
        // Only execute arbitrage if it's from the previous block
        if (!pendingArbitrage[poolId]) {
            uint256 previousBlock = block.number - 1;
            ArbitrageBid storage bid = currentBids[poolId][previousBlock];
            
            // If no external bid exists, create LVR bidder bid
            if (bid.bidder == address(0)) {
                uint256 minBid = calculateMinimumBid(poolId, 1e18);
                currentBids[poolId][previousBlock] = ArbitrageBid({
                    bidder: lvrBidder,
                    bidAmount: minBid,
                    poolKey: key,
                    inputs: abi.decode(defaultSwapCalldata, (bytes[])),
                    zeroForOne: true, // Set default direction
                    amountIn: 0 // Set default amount
                });
                bid = currentBids[poolId][previousBlock];
            }

            // Mark as pending to prevent recursion
            pendingArbitrage[poolId] = true;
            
            // Transfer tokens from bidder to hook for swap
            IERC20 swapToken = IERC20(
                bid.zeroForOne ? 
                Currency.unwrap(bid.poolKey.currency0) : 
                Currency.unwrap(bid.poolKey.currency1)
            );
            
            require(
                swapToken.transferFrom(bid.bidder, address(this), bid.amountIn),
                "Swap token transfer failed"
            );
            
            // Approve router to spend tokens
            swapToken.approve(address(router), bid.amountIn);
            
            // Execute the swap
            bytes memory commands = abi.encodePacked(uint8(0x10)); // V4_SWAP command
            router.execute(commands, bid.inputs, block.timestamp);
            
            // Collect USDC fee
            require(
                USDC.transferFrom(bid.bidder, address(this), bid.bidAmount),
                "Fee collection failed"
            );
        }
        
        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function beforeAddLiquidity(
        address sender,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        bytes calldata
    ) external override returns (bytes4) {
        PoolId poolId = key.toId();
        
        uint256 liquidityAmount = params.liquidityDelta > 0 ? uint256(uint128(int128(params.liquidityDelta))) : 0;
        
        // Just record the liquidity amount and timestamp
        liquidityPositions[poolId][sender] = LiquidityPosition({
            amount: liquidityAmount,
            timestamp: block.timestamp
        });
        
        return BaseHook.beforeAddLiquidity.selector;
    }

    function beforeRemoveLiquidity(
        address sender,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata params,
        bytes calldata
    ) external override returns (bytes4) {
        return BaseHook.beforeRemoveLiquidity.selector;
    }

    function afterSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata,
        BalanceDelta,
        bytes calldata
    ) external override returns (bytes4, int128) {
        PoolId poolId = key.toId();
        feesPending[poolId] = true;
        return (BaseHook.afterSwap.selector, 0);
    }

    // Calculate minimum bid amount based on sigma and pool liquidity
    function calculateMinimumBid(PoolId poolId, uint256 poolLiquidity) public view returns (uint256) {
        uint256 poolSigma = sigma[poolId];
        return (poolSigma * poolSigma * poolLiquidity) / 800;
    }

    function bidLVR(
        PoolKey calldata key,
        uint256 bidAmount,
        bytes[] calldata inputs,
        bool zeroForOne,
        uint256 amountIn
    ) external {
        require(bidAmount > 0, "Bid amount must be greater than 0");
        require(inputs.length > 0, "Swap inputs required");
        
        PoolId poolId = key.toId();
        uint256 currentBlock = block.number;
        ArbitrageBid storage currentBid = currentBids[poolId][currentBlock];
        
        // Calculate minimum bid
        uint256 minBid = calculateMinimumBid(poolId, 1e18); // TODO: Get actual pool liquidity
        require(bidAmount >= minBid, "Bid too low");
        
        // Only accept if bid is higher than current bid
        require(
            currentBid.bidder == address(0) || bidAmount > currentBid.bidAmount,
            "Higher bid exists"
        );
        
        // Take USDC approval for bid amount
        require(
            USDC.allowance(msg.sender, address(this)) >= bidAmount,
            "Insufficient USDC allowance"
        );
        
        // Take approval for swap token
        IERC20 swapToken = IERC20(zeroForOne ? Currency.unwrap(key.currency0) : Currency.unwrap(key.currency1));
        require(
            swapToken.allowance(msg.sender, address(this)) >= amountIn,
            "Insufficient swap token allowance"
        );
        
        // Update current bid
        currentBids[poolId][currentBlock] = ArbitrageBid({
            bidder: msg.sender,
            bidAmount: bidAmount,
            poolKey: key,
            inputs: inputs,
            zeroForOne: zeroForOne,
            amountIn: amountIn
        });
    }

    // Admin functions to update LVR bidder settings
    function setLVRBidder(address _lvrBidder) external onlyOwner {
        lvrBidder = _lvrBidder;
    }

    function setDefaultSwapCalldata(bytes calldata _defaultSwapCalldata) external onlyOwner {
        defaultSwapCalldata = _defaultSwapCalldata;
    }
}
