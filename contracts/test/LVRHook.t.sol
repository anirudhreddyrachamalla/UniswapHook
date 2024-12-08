// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";

import { Commands } from "@uniswap/universal-router/contracts/libraries/Commands.sol";
import { Actions } from "v4-periphery/src/libraries/Actions.sol";
import { IV4Router } from "v4-periphery/src/interfaces/IV4Router.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {PoolSwapTest} from "v4-core/src/test/PoolSwapTest.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

import {PoolManager} from "v4-core/src/PoolManager.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";

import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";

import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {SqrtPriceMath} from "v4-core/src/libraries/SqrtPriceMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {EasyPosm} from "./utils/EasyPosm.sol";
// import { Permit2 } from "@uniswap/universal-router/lib/permit2/src/Permit2.sol";


import "forge-std/console.sol";
import {LVRHook} from "../src/LVRHook.sol";

contract TestPointsHook is Test, Deployers {
    using EasyPosm for IPoolManager;
    using CurrencyLibrary for Currency;

    MockERC20 token1;
    MockERC20 token2;

    Currency token1Currency;
    Currency token2Currency;

    LVRHook hook;
    address brevisRequest;
    address user1;
    address user2;


    function setUp() public {
        // Step 1 + 2
        // Deploy PoolManager and Router contracts
        deployFreshManagerAndRouters();
        //permit2 = new Permit2();
        brevisRequest = 0xa082F86d9d1660C29cf3f962A31d7D20E367154F;
        user1 = 0x143328D5d7C84515b3c8b3f8891471ff872C0015;
        user2 = 0xCB4bB082e3457A24a8cB14a1cD8FA1F7643eb500;


        // Deploy our TOKEN contract
        token1 = new MockERC20("USDC Token", "USDC", 18);
        token1Currency = Currency.wrap(address(token1));

        token2 = new MockERC20("Universal Token", "Universal", 18);
        token2Currency = Currency.wrap(address(token2));

        // Mint a bunch of TOKEN to ourselves and to address(1)
        token1.mint(user1, 1000 ether);
        token2.mint(user1, 1000 ether);

        token1.mint(user2, 1000 ether);
        token2.mint(user2, 1000 ether);

        token1.mint(address(this), 1000 ether);
        token2.mint(address(this), 1000 ether);

        // Deploy hook to an address that has the proper flags set
        uint160 flags = uint160(
            Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
        );
        deployCodeTo(
            "LVRHook.sol",
            abi.encode(manager, 0xa082F86d9d1660C29cf3f962A31d7D20E367154F, address(token1),0x818484227ABF04550c6c242B6119B7c94d2E72b3,address(swapRouter)),
            address(flags)
        );

        // Deploy our hook
        hook = LVRHook(address(flags));
        hook.setVkHash(0x1c14b8cedba508fe0223adce253b1ee20a1709a710c260c2ee4f72445ee0149a);

        // Approve our TOKEN for spending on the swap router and modify liquidity router
        // These variables are coming from the `Deployers` contract
        token1.approve(address(swapRouter), type(uint256).max);
        token1.approve(address(modifyLiquidityRouter), type(uint256).max);
        token2.approve(address(modifyLiquidityRouter), type(uint256).max);
        
        


        // Initialize a pool
        (key, ) = initPool(
            token1Currency, // Currency 0 = ETH
            token2Currency, // Currency 1 = TOKEN
            hook, // Hook Contract
            3000, // Swap Fees
            SQRT_PRICE_1_1 // Initial Sqrt(P) value = 1
        );
    }

    function bidLVR() public {
        bytes[] memory inputs = new bytes[](1);
        bytes[] memory params = new bytes[](3);
        bytes memory commands = abi.encodePacked(uint8(Commands.V4_SWAP));

        bytes memory hookData = abi.encode(user1);


        // First parameter: swap configuration
        params[0] = abi.encode(
            IV4Router.ExactInputSingleParams({
                poolKey: key,
                zeroForOne: true,            // true if we're swapping token0 for token1
                amountIn: 1 ether,          // amount of tokens we're swapping
                amountOutMinimum: 0, // minimum amount we expect to receive
                hookData: hookData            // no hook data needed
            })
        );

        // Second parameter: specify input tokens for the swap
        // encode SETTLE_ALL parameters
        params[1] = abi.encode(key.currency0, 1 ether);

        // Third parameter: specify output tokens from the swap
        params[2] = abi.encode(key.currency1, 0);
        bytes memory actions = abi.encodePacked(
        uint8(Actions.SWAP_EXACT_IN_SINGLE),
        uint8(Actions.SETTLE_ALL),
        uint8(Actions.TAKE_ALL)
        );

        inputs[0] = abi.encode(actions, params);
        hook.bidLVR(key, 1 ether, inputs, true, 2 ether);
    }

    function modifyLiquidity(bool isIncreaseLiquidity) public {
        bytes memory hookData = abi.encode(address(this));
        uint160 sqrtPriceAtTickLower = TickMath.getSqrtPriceAtTick(-60);
        uint160 sqrtPriceAtTickUpper = TickMath.getSqrtPriceAtTick(60);

        uint256 token1ToAdd = 10 ether;
        uint128 liquidityDelta = LiquidityAmounts.getLiquidityForAmount0(
            sqrtPriceAtTickLower,
            SQRT_PRICE_1_1,
            token1ToAdd
        );
        uint256 token2ToAdd = LiquidityAmounts.getAmount1ForLiquidity(
            sqrtPriceAtTickUpper,
            SQRT_PRICE_1_1,
            liquidityDelta
        );

        int liquidityDeltaInt;
        if(isIncreaseLiquidity){
            liquidityDeltaInt = int(uint(liquidityDelta));
        } else {
            liquidityDeltaInt = -1 * int(uint(liquidityDelta));
        }

        modifyLiquidityRouter.modifyLiquidity(
            key,
            IPoolManager.ModifyLiquidityParams({
                tickLower: -60,
                tickUpper: 60,
                liquidityDelta: liquidityDeltaInt,
                salt: bytes32(0)
            }),
            hookData
        );
    }

    function swapToken() public {
        bytes memory hookData = abi.encode(user2);
        swapRouter.swap(
            key,
            IPoolManager.SwapParams({
                zeroForOne: true,
                amountSpecified: -0.1 ether, // Exact input for output swap
                sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            PoolSwapTest.TestSettings({
                takeClaims: false,
                settleUsingBurn: false
            }),
            hookData
        );
    }


    function test_LVRGain() public {
        modifyLiquidity(true);
        vm.startPrank(user1);
        token1.approve(address(hook), type(uint256).max);
        bidLVR();
        vm.stopPrank();
        vm.roll(block.number + 1);
        vm.startPrank(user2);
        swapToken();
        vm.stopPrank();
        //modifyLiquidity(false);
        
        // uint256 pointsBalanceOriginal = hook.balanceOf(address(this));

        // // Set user address in hook data
        // bytes memory hookData = abi.encode(address(this));

        // uint160 sqrtPriceAtTickLower = TickMath.getSqrtPriceAtTick(-60);
        // uint160 sqrtPriceAtTickUpper = TickMath.getSqrtPriceAtTick(60);

        // uint256 ethToAdd = 0.1 ether;
        // uint128 liquidityDelta = LiquidityAmounts.getLiquidityForAmount0(
        //     sqrtPriceAtTickLower,
        //     SQRT_PRICE_1_1,
        //     ethToAdd
        // );
        // uint256 tokenToAdd = LiquidityAmounts.getAmount1ForLiquidity(
        //     sqrtPriceAtTickLower,
        //     SQRT_PRICE_1_1,
        //     liquidityDelta
        // );

        // modifyLiquidityRouter.modifyLiquidity{value: ethToAdd}(
        //     key,
        //     IPoolManager.ModifyLiquidityParams({
        //         tickLower: -60,
        //         tickUpper: 60,
        //         liquidityDelta: int256(uint256(liquidityDelta)),
        //         salt: bytes32(0)
        //     }),
        //     hookData
        // );
        // uint256 pointsBalanceAfterAddLiquidity = hook.balanceOf(address(this));

        // assertApproxEqAbs(
        //     pointsBalanceAfterAddLiquidity - pointsBalanceOriginal,
        //     0.1 ether,
        //     0.001 ether // error margin for precision loss
        // );

        // // Now we swap
        // // We will swap 0.001 ether for tokens
        // // We should get 20% of 0.001 * 10**18 points
        // // = 2 * 10**14
        // swapRouter.swap{value: 0.001 ether}(
        //     key,
        //     IPoolManager.SwapParams({
        //         zeroForOne: true,
        //         amountSpecified: -0.001 ether, // Exact input for output swap
        //         sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        //     }),
        //     PoolSwapTest.TestSettings({
        //         takeClaims: false,
        //         settleUsingBurn: false
        //     }),
        //     hookData
        // );
        // uint256 pointsBalanceAfterSwap = hook.balanceOf(address(this));
        // assertEq(
        //     pointsBalanceAfterSwap - pointsBalanceAfterAddLiquidity,
        //     2 * 10 ** 14
        // );
    }
}