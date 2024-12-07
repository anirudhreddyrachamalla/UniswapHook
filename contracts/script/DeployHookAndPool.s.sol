// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {PoolSwapTest} from "v4-core/src/test/PoolSwapTest.sol";
import {PoolModifyLiquidityTest} from "v4-core/src/test/PoolModifyLiquidityTest.sol";
import {PoolDonateTest} from "v4-core/src/test/PoolDonateTest.sol";
import {PoolTakeTest} from "v4-core/src/test/PoolTakeTest.sol";
import {PoolClaimsTest} from "v4-core/src/test/PoolClaimsTest.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {HookMiner} from "../test/HookMiner.sol";
import {LVRHook} from "../src/LVRHook.sol";
import { UniversalRouter } from "@uniswap/universal-router/contracts/UniversalRouter.sol";
import "forge-std/console.sol";

contract DeployHookAndPool is Script {
    PoolManager manager =
        PoolManager(0xCa6DBBe730e31fDaACaA096821199EEED5AD84aE);
    PoolSwapTest swapRouter =
        PoolSwapTest(0xEc9537B6D66c14E872365AB0EAE50dF7b254D4Fc);
    address payable router = payable(0x4D73A4411CA1c660035e4AECC8270E5DdDEC8C17);
    UniversalRouter universalRouter = UniversalRouter(router);
    PoolModifyLiquidityTest modifyLiquidityRouter =
        PoolModifyLiquidityTest(0x1f03f235e371202e49194F63C7096F5697848822);
    address brevisRequest = 0xa082F86d9d1660C29cf3f962A31d7D20E367154F;
    address lvrBidder;

    Currency token0;
    Currency token1;

    PoolKey key;

    function setUp() public {
        vm.startBroadcast();
        lvrBidder = msg.sender;
        MockERC20 tokenA = new MockERC20("USDC", "USDC", 18);
        MockERC20 tokenB = new MockERC20("UNI", "UNI", 18);

        if (address(tokenA) > address(tokenB)) {
            (token0, token1) = (
                Currency.wrap(address(tokenB)),
                Currency.wrap(address(tokenA))
            );
        } else {
            (token0, token1) = (
                Currency.wrap(address(tokenA)),
                Currency.wrap(address(tokenB))
            );
        }

        tokenA.approve(address(modifyLiquidityRouter), type(uint256).max);
        tokenB.approve(address(modifyLiquidityRouter), type(uint256).max);
        tokenA.approve(address(swapRouter), type(uint256).max);
        tokenB.approve(address(swapRouter), type(uint256).max);

        tokenA.mint(msg.sender, 100 * 10 ** 18);
        tokenB.mint(msg.sender, 100 * 10 ** 18);

        // Mine for hook address
        vm.stopBroadcast();

        uint160 flags = uint160( Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG);

        address CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
        (address hookAddress, bytes32 salt) = HookMiner.find(
            CREATE2_DEPLOYER,
            flags,
            type(LVRHook).creationCode,
            abi.encode(address(manager), brevisRequest, address(tokenA), lvrBidder, address(router))
        );
        console.log("hookAddress: ", hookAddress);
        console.logBytes32(salt);
        vm.startBroadcast();
        LVRHook hook = new LVRHook{salt: salt}(address(manager), brevisRequest, address(tokenA), lvrBidder, address(router));
        require(address(hook) == hookAddress, "hook address mismatch");
        console.log("hook deployed at: ", address(hook));

        key = PoolKey({
            currency0: token0,
            currency1: token1,
            fee: 3000,
            tickSpacing: 120,
            hooks: hook
        });

        // the second argument here is SQRT_PRICE_1_1
        manager.initialize(key, 79228162514264337593543950336);
        vm.stopBroadcast();
    }

    function run() public {
        vm.startBroadcast();
        modifyLiquidityRouter.modifyLiquidity(
            key,
            IPoolManager.ModifyLiquidityParams({
                tickLower: -120,
                tickUpper: 120,
                liquidityDelta: 10e18,
                salt: 0
            }),
            new bytes(0)
        );
        vm.stopBroadcast();
    }
}