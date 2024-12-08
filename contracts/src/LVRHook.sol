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
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";


contract LVRHook is BaseHook, Ownable, BrevisAppZkOnly {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    // Brevis verification
    uint public constant PRECISION = 100_000_000;
    bytes32 public vkHash;
    event SigmaUpdated(PoolId indexed poolId, uint256 sigma);
    event LVRReward(PoolId poolId, address user, int liquidityDelta, uint updatedLiquidity, uint256 lvrRewardRate, uint256 lvrReward );
    event LVRBidPlaced(address user, uint bidAmount);
    event LVRDebug(string);//ani-todo- only added for  debugging remove this
     

    // Volatility metric
    mapping(PoolId => uint256) public sigma;
    
    // Locked liquidity tracking
    struct LiquidityPosition {
        uint256 amount;
        uint256 lvrFundingRate;
    }
    
    mapping(PoolId => mapping(address => LiquidityPosition)) public liquidityPositions;
    mapping(PoolId => uint256) public totalLiquidity;
    mapping(PoolId => uint256) public lvrRewardRate;
    
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
    
    // Constants
    uint256 public constant BASE_FEE = 1e15; // 0.1% base fee
    uint256 public constant FEE_MULTIPLIER = 1e18;

    // LVR Bidder address and default swap data
    address public lvrBidder;
    bytes public defaultSwapCalldata;
    
    // Add router
    UniversalRouter public immutable router;
    
    constructor(
        address _poolManager,
        address _brevisRequest,
        address _usdc,
        address _lvrBidder,
        address _router
    ) BaseHook(IPoolManager(_poolManager)) Ownable(msg.sender) BrevisAppZkOnly(_brevisRequest) {
        USDC = IERC20(_usdc);
        lvrBidder = _lvrBidder;
        router = UniversalRouter(payable(_router));
    }

    function setVkHash(bytes32 _vkHash) external onlyOwner {
        vkHash = _vkHash;
    }

    function handleProofResult(bytes32 _vkHash, bytes calldata _circuitOutput) internal override {
        require(vkHash == _vkHash, "LVRHook: invalid vk");
        
        (PoolId poolId, uint256 sigmaValue) = decodeOutput(_circuitOutput);
        
        // Update sigma value for the pool
        sigma[poolId] = sigmaValue;
        
        emit SigmaUpdated(poolId, sigmaValue);
    }

    function decodeOutput(bytes calldata o) internal pure returns (PoolId, uint256) {
        PoolId poolId = PoolId.wrap(bytes32(o[8:32]));
        uint256 sigmaValue = uint256(bytes32(o[0:64]));
        return (poolId, sigmaValue);
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: true,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: true,
            beforeSwap: true,
            afterSwap: false,
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
        emit LVRDebug("1");
        if (!pendingArbitrage[poolId]) {
            uint256 previousBlock = block.number - 1;
            ArbitrageBid storage bid = currentBids[poolId][previousBlock];
            emit LVRDebug("2");
            
            // If no external bid exists, create LVR bidder bid
            if (bid.bidder == address(0)) {
                uint256 minBid = calculateMinimumBid(poolId, poolManager.getLiquidity(poolId));
                emit LVRDebug("3");
                currentBids[poolId][previousBlock] = ArbitrageBid({
                    bidder: lvrBidder,
                    bidAmount: minBid,
                    poolKey: key,
                    //ani-todo: add defaultswapcalldata
                    inputs: abi.decode(defaultSwapCalldata, (bytes[])),
                    zeroForOne: true, // Set default direction
                    amountIn: 0 // Set default amount
                });
                emit LVRDebug("3");
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
            emit LVRDebug("4");
            
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
            emit LVRDebug("5");

            lvrRewardRate[poolId] = lvrRewardRate[poolId] + ((bid.bidAmount)*(PRECISION))/totalLiquidity[poolId];
        }
        
        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta delta,
        BalanceDelta,
        bytes calldata hookData
    ) external override returns (bytes4, BalanceDelta) {
        PoolId poolId = key.toId();
        address user = abi.decode(hookData, (address));
        LiquidityPosition memory liqPos = liquidityPositions[poolId][user];
        uint reward;
        if(liqPos.amount != 0){
            uint currAmt = liqPos.amount;
            reward = ((lvrRewardRate[poolId] - liqPos.lvrFundingRate)*currAmt)/(PRECISION);
            require(
                USDC.transfer(user,reward),
                "LVR reward failed"
            );

        }
        liqPos.amount -= uint256(int256(delta.amount0()));
        totalLiquidity[poolId] -= uint256(int256(delta.amount0()));
        liqPos.lvrFundingRate = lvrRewardRate[poolId];
        liquidityPositions[poolId][user] = liqPos;
        emit LVRReward(poolId,user,delta.amount0(),liqPos.amount,liqPos.lvrFundingRate, reward);
        return(this.afterRemoveLiquidity.selector, delta );
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata key,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta delta,
        BalanceDelta,
        bytes calldata hookData
    ) external override onlyPoolManager returns (bytes4, BalanceDelta) {
        /**
         * fetch users current points
         * distribute rewards on current points
         * update user's position
         */
        PoolId poolId = key.toId();
        address user = abi.decode(hookData, (address));
        LiquidityPosition memory liqPos = liquidityPositions[poolId][user];
        uint reward;
        if(liqPos.amount != 0){
            uint currAmt = liqPos.amount;
            reward = ((lvrRewardRate[poolId] - liqPos.lvrFundingRate)*currAmt)/(PRECISION);
            require(
                USDC.transfer(user,reward),
                "LVR reward failed"
            );
        }
        liqPos.amount += uint256(int256(-delta.amount0()));
        liqPos.lvrFundingRate = lvrRewardRate[poolId];
        liquidityPositions[poolId][user] = liqPos;
        totalLiquidity[poolId] += uint256(int256(-delta.amount0()));
        emit LVRReward(poolId,user,delta.amount0(),liqPos.amount,liqPos.lvrFundingRate, reward);
        return (this.afterAddLiquidity.selector, delta);
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
        //ani-todo: revert this below change back
        uint256 minBid = calculateMinimumBid(poolId, poolManager.getLiquidity(poolId));
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
        emit LVRBidPlaced(msg.sender, bidAmount);
    }

    // Admin functions to update LVR bidder settings
    function setLVRBidder(address _lvrBidder) external onlyOwner {
        lvrBidder = _lvrBidder;
    }

    function setDefaultSwapCalldata(bytes calldata _defaultSwapCalldata) external onlyOwner {
        defaultSwapCalldata = _defaultSwapCalldata;
    }

    function lvrRate(PoolId poolId) public returns(uint256) {
        return (lvrRewardRate[poolId]*86400*365*100)/(PRECISION*totalLiquidity[poolId]*10);
    }
}