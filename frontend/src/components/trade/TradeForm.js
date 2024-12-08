import React, { useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { useAccount, useConnect } from 'wagmi';
import { parseUnits, AbiCoder, BrowserProvider, Contract } from "ethers";

export function TradeForm() {

  const HOOK_CONTRACT_ADDRESS = "0xf32988a6b16e401d90b04ec6b61a7422ff530580";
  const USDC_CONTRACT_ADDRESS = "0x497e9e733a57a09063c432bcb19cace7a047fa2e";
  const UNI_CONTRACT_ADDRESS = "0x909d68d8a57ab8f62b6391e117a77b215ab21dfc";
  const UNIVERSAL_ROUTER_ADDRESS = "0x4D73A4411CA1c660035e4AECC8270E5DdDEC8C17";
  const POOL_FEE = 3000;

  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const [sellAmount, setSellAmount] = useState('');
  const [buyAmount, setBuyAmount] = useState('');
  const [isArbitrage, setIsArbitrage] = useState(false);
  const [bid, setBid] = useState('');
  const [sellToken, setSellToken] = useState('USDC');
  const [buyToken, setBuyToken] = useState('UNI');

  const prices = {
    ETH: 4000,
    wBTC: 100000,
    USDC: 1,
    USDT: 1,
    UNI: 1,
  };

  const handleSellAmountChange = (e) => {
    const value = e.target.value;
    setSellAmount(value);

    if (!value || isNaN(value)) {
      setBuyAmount('');
      return;
    }

    const sellAmt = parseFloat(value);
    const calculatedBuyAmount =
      (prices[sellToken] && prices[buyToken])
        ? (sellAmt * prices[sellToken]) / prices[buyToken]
        : 0;

    setBuyAmount(calculatedBuyAmount ? calculatedBuyAmount.toFixed(2) : '0');
  };

  const ABI = [
    {
      inputs: [
        {
          components: [
            { internalType: "address", name: "currency0", type: "address" },
            { internalType: "address", name: "currency1", type: "address" },
            { internalType: "uint24", name: "fee", type: "uint24" },
            { internalType: "int24", name: "tickSpacing", type: "int24" },
            { internalType: "address", name: "hooks", type: "address" },
          ],
          internalType: "struct PoolKey",
          name: "key",
          type: "tuple",
        },
        { internalType: "uint256", name: "bidAmount", type: "uint256" },
        { internalType: "bytes[]", name: "inputs", type: "bytes[]" },
        { internalType: "bool", name: "zeroForOne", type: "bool" },
        { internalType: "uint256", name: "amountIn", type: "uint256" },
      ],
      name: "bidLVR",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
  ];

  const UNIVERSAL_ROUTER_ABI = [
    {
      "inputs": [
        { "internalType": "bytes", "name": "commands", "type": "bytes" },
        { "internalType": "bytes[]", "name": "inputs", "type": "bytes[]" },
        { "internalType": "uint256", "name": "deadline", "type": "uint256" }
      ],
      "name": "execute",
      "outputs": [],
      "stateMutability": "payable",
      "type": "function"
    }
  ];

  // Helper: Determine zeroForOne based on token addresses
  const zeroForOne = USDC_CONTRACT_ADDRESS.toLowerCase() < UNI_CONTRACT_ADDRESS.toLowerCase();

  // Helper: Build PoolKey object
  const buildPoolKey = () => ({
    currency0: zeroForOne ? USDC_CONTRACT_ADDRESS : UNI_CONTRACT_ADDRESS,
    currency1: zeroForOne ? UNI_CONTRACT_ADDRESS : USDC_CONTRACT_ADDRESS,
    fee: POOL_FEE,
    tickSpacing: 120,
    hooks: HOOK_CONTRACT_ADDRESS
  });

  // Helper: Encode Swap Parameters for Arbitrage scenario
  const buildArbitrageParams = (amountIn, minAmountOut, hookData) => {
    const abiCoder = new AbiCoder();
    const actions = new Uint8Array([0x00, 0x01, 0x02]); // Example actions
    const params = [
      abiCoder.encode(
        [
          "tuple(address,address,uint24,int24,address)", 
          "bool", "uint256", "uint256", "uint160", "bytes"
        ],
        [
          [USDC_CONTRACT_ADDRESS, UNI_CONTRACT_ADDRESS, POOL_FEE, 120, HOOK_CONTRACT_ADDRESS],
          zeroForOne,
          amountIn,
          minAmountOut,
          0,
          hookData
        ]
      ),
      abiCoder.encode(["address", "uint256"], [USDC_CONTRACT_ADDRESS, amountIn]),
      abiCoder.encode(["address", "uint256"], [UNI_CONTRACT_ADDRESS, minAmountOut])
    ];

    const inputs = [abiCoder.encode(["bytes", "bytes[]"], [actions, params])];
    return inputs;
  };

  // Helper: Approve tokens
  const approveToken = async (signer, tokenAddress, spender, amount) => {
    const tokenContract = new Contract(
      tokenAddress,
      ["function approve(address spender, uint256 amount) public returns (bool)"],
      signer
    );
    console.log(`Approving ${tokenAddress}...`);
    const approvalTx = await tokenContract.approve(spender, amount);
    await approvalTx.wait();
    console.log(`${tokenAddress} approved successfully!`);
  };

  const handleSwap = async () => {
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const abiCoder = new AbiCoder();
    const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now
    const amountIn = parseUnits(String(sellAmount), 18);
    const minAmountOut = parseUnits("0", 18);
    const hookData = abiCoder.encode(["address"], [address]);

    // Check minimum bid if arbitrage
    if (isArbitrage && parseFloat(bid) < 1.5) {
      console.error("Current minimum bid is 1.5");
      return; 
    }

    if (isArbitrage) {
      const key = buildPoolKey();
      const bidAmount = parseUnits(String(bid), 18);
      const inputs = buildArbitrageParams(amountIn, minAmountOut, hookData);
      const totalAmount = bidAmount + amountIn; // Use BigNumber addition

      try {
        await approveToken(signer, USDC_CONTRACT_ADDRESS, HOOK_CONTRACT_ADDRESS, totalAmount);

        const hookContract = new Contract(HOOK_CONTRACT_ADDRESS, ABI, signer);
        console.log("Submitting bid...");
        const tx = await hookContract.bidLVR(key, bidAmount, inputs, zeroForOne, amountIn);
        const receipt = await tx.wait();
        console.log("Bid submitted successfully:", receipt);
      } catch (error) {
        console.error("Error in handleSwap:", error);
      }

    } else {
      // Normal Swap Logic
      const commands = new Uint8Array([0x10]); // Example command
      const actions = new Uint8Array([0x00, 0x01, 0x02]); 
      const params = [
        abiCoder.encode(
          [
            "tuple(address,address,uint24,int24,address)", 
            "bool", "uint256", "uint256", "uint160", "bytes"
          ],
          [
            [USDC_CONTRACT_ADDRESS, UNI_CONTRACT_ADDRESS, POOL_FEE, 120, HOOK_CONTRACT_ADDRESS],
            zeroForOne,
            amountIn,
            minAmountOut,
            0,
            hookData
          ]
        ),
        abiCoder.encode(["address", "uint256"], [USDC_CONTRACT_ADDRESS, amountIn]),
        abiCoder.encode(["address", "uint256"], [UNI_CONTRACT_ADDRESS, minAmountOut])
      ];

      const inputs = [abiCoder.encode(["bytes", "bytes[]"], [actions, params])];
      const universalRouter = new Contract(UNIVERSAL_ROUTER_ADDRESS, UNIVERSAL_ROUTER_ABI, signer);

      try {
        await approveToken(signer, USDC_CONTRACT_ADDRESS, HOOK_CONTRACT_ADDRESS, amountIn);
        const tx = await universalRouter.execute(commands, inputs, deadline, { value: 0 });
        const receipt = await tx.wait();
        console.log("Simple swap executed successfully:", receipt);
      } catch (error) {
        console.error("Error executing simple swap:", error);
      }
    }
  };

  return (
    <div className="space-y-3 p-6 bg-gray-900 rounded-xl shadow-md text-white">
      {/* Sell Section */}
      <div className="space-y-1">
        <label className="text-gray-400 text-sm font-medium">Sell</label>
        <div className="flex items-center space-x-2">
          <div className="relative w-1/3">
            <select
              value={sellToken}
              onChange={(e) => setSellToken(e.target.value)}
              className="w-full bg-gray-800 text-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none"
            >
              {['ETH', 'wBTC', 'USDC', 'USDT', 'UNI'].map((token) => (
                <option key={token} value={token}>
                  {token}
                </option>
              ))}
            </select>
            <ArrowDown className="absolute right-3 top-2/4 transform -translate-y-2/4 text-gray-400 pointer-events-none" />
          </div>
          <input
            type="number"
            placeholder="Amount"
            value={sellAmount}
            onChange={handleSellAmountChange}
            className="w-2/3 bg-gray-800 text-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      {/* Arrow Divider */}
      <div className="flex justify-center">
        <button className="rounded-full bg-gray-800 p-3 shadow-md">
          <ArrowDown className="h-5 w-5 text-gray-300" />
        </button>
      </div>

      {/* Buy Section */}
      <div className="space-y-1">
        <label className="text-gray-400 text-sm font-medium">Buy</label>
        <div className="flex items-center space-x-2">
          <div className="relative w-1/3">
            <select
              value={buyToken}
              onChange={(e) => setBuyToken(e.target.value)}
              className="w-full bg-gray-800 text-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none"
            >
              {['ETH', 'wBTC', 'USDC', 'USDT', 'UNI'].map((token) => (
                <option key={token} value={token}>
                  {token}
                </option>
              ))}
            </select>
            <ArrowDown className="absolute right-3 top-2/4 transform -translate-y-2/4 text-gray-400 pointer-events-none" />
          </div>
          <input
            type="number"
            placeholder="Amount"
            value={buyAmount}
            readOnly
            className="w-2/3 bg-gray-800 text-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      {/* Arbitrage Checkbox */}
      <div className="flex items-center justify-end space-x-2">
        <label className="text-gray-400 text-sm font-medium">Arbitrage Swap</label>
        <input
          type="checkbox"
          checked={isArbitrage}
          onChange={(e) => setIsArbitrage(e.target.checked)}
          className="w-5 h-5 text-purple-500 focus:ring-purple-500 bg-gray-800 border-gray-600 rounded"
        />
      </div>

      {/* Bid Input (Visible if Arbitrage Swap is Checked) */}
      {isArbitrage && (
        <div className="space-y-1">
          <label className="text-gray-400 text-sm font-medium">Bid (in sell tokens)</label>
          <input
            type="number"
            placeholder="Enter bid"
            value={bid}
            onChange={(e) => setBid(e.target.value)}
            className="w-full bg-gray-800 text-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          {bid && parseFloat(bid) < 1.5 && (
            <p className="text-red-500 text-sm">
              Current minimum bid is 1.5
            </p>
          )}
        </div>
      )}

      {/* Conditional Wallet Button */}
      {!isConnected ? (
        <button
          onClick={() => connect({ connector: connectors[0] })}
          className="w-full bg-purple-500 hover:bg-purple-600 text-white font-semibold py-3 rounded-lg shadow-lg transition duration-200"
        >
          Connect Wallet
        </button>
      ) : (
        <button
          onClick={handleSwap}
          className="w-full bg-purple-500 hover:bg-purple-600 text-white font-semibold py-3 rounded-lg shadow-lg transition duration-200"
        >
          {isArbitrage ? "Arbitrage Bid" : "Swap"}
        </button>
      )}
    </div>
  );
}
