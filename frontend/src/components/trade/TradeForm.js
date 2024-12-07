import React, { useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { useAccount, useConnect } from 'wagmi';
import { parseUnits, AbiCoder, BrowserProvider, Contract } from "ethers";

export function TradeForm() {

  const HOOK_CONTRACT_ADDRESS = "0xYourContractAddress";
  const USDC_CONTRACT_ADDRESS = "0xUSDCContractAddress";
  const BUY_TOKEN_ADDRESS = "0xSellToken";
  const POOL_FEE = 3000;

  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const [sellAmount, setSellAmount] = useState('');
  const [buyAmount, setBuyAmount] = useState('');
  const [isArbitrage, setIsArbitrage] = useState(false);
  const [bid, setBid] = useState('');
  const [sellToken, setSellToken] = useState('USDC');
  const [buyToken, setBuyToken] = useState('UNI');

  // Hardcoded prices
  const prices = {
    ETH: 4000,
    wBTC: 100000,
    USDC: 1,
    USDT: 1,
    UNI: 15,
  };

  // Calculate buy amount based on sell amount and prices
  const handleSellAmountChange = (e) => {
    const value = e.target.value;
    setSellAmount(value);
  
    if (!value || isNaN(value)) {
      setBuyAmount(''); // Reset the buy amount if input is invalid
      return;
    }
  
    const sellAmount = parseFloat(value);
    const calculatedBuyAmount =
      (prices[sellToken] && prices[buyToken])
        ? (sellAmount * prices[sellToken]) / prices[buyToken]
        : 0;
  
    setBuyAmount(calculatedBuyAmount.toFixed(2)); // Ensure `calculatedBuyAmount` is a number before calling toFixed
  };  

  const ABI = [
    // Minimal ABI for bidLVR function
    {
      inputs: [
        {
          components: [
            { internalType: "address", name: "currency0", type: "address" },
            { internalType: "address", name: "currency1", type: "address" },
            { internalType: "uint24", name: "fee", type: "uint24" },
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

  const handleSwap = async () => {
    if (isArbitrage) {
      const key = {
        currency0: USDC_CONTRACT_ADDRESS, // Address of the sell token
        currency1: BUY_TOKEN_ADDRESS, // Address of the buy token
        fee: POOL_FEE, // Pool fee
      };
      const bidAmount = parseUnits(String(bid), 6); // Assuming USDC with 6 decimals
      const amountIn = parseUnits(String(sellAmount), 6); // Sell token same as bid token
      const minAmountOut = parseUnits(String(buyAmount), 18); // Minimum buy token amount
      const totalAmount = bidAmount.add(amountIn);
  
      // Encode actions and parameters
      const abiCoder = new AbiCoder();
      const actions = abiCoder.encode(
        ["uint8[]"],
        [[0 /* SWAP_EXACT_IN_SINGLE */, 1 /* SETTLE_ALL */, 2 /* TAKE_ALL */]]
      );
      const params = [
        abiCoder.encode(
          [
            "tuple(address currency0, address currency1, uint24 fee)",
            "bool",
            "uint256",
            "uint256",
            "uint160",
            "bytes",
          ],
          [key, true, amountIn, minAmountOut, 0, "0x"]
        ),
        abiCoder.encode(["address", "uint256"], [USDC_CONTRACT_ADDRESS, amountIn]),
        abiCoder.encode(["address", "uint256"], [BUY_TOKEN_ADDRESS, minAmountOut]),
      ];
      const inputs = [abiCoder.encode(["bytes", "bytes[]"], [actions, params])];
  
      try {
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();

        const usdcContract = new Contract(
          USDC_CONTRACT_ADDRESS,
          ["function approve(address spender, uint256 amount) public returns (bool)"],
          signer
        );
        const approvalTx = await usdcContract.approve(HOOK_CONTRACT_ADDRESS, totalAmount);
        await approvalTx.wait();
        console.log("USDC approved successfully!");

        const contract = new Contract(HOOK_CONTRACT_ADDRESS, ABI, signer);
        const tx = await contract.bidLVR(key, bidAmount, inputs, true, amountIn);
        const receipt = await tx.wait();
        console.log("Transaction confirmed:", receipt);
      } catch (error) {
        console.error("Error in handleSwap:", error);
      }
    } else {
      console.log("Normal Swap Logic");
    }
  };  

  return (
    <div className="space-y-3 p-6 bg-gray-900 rounded-xl shadow-md text-white">
      {/* Sell Section */}
      <div className="space-y-1">
        <label className="text-gray-400 text-sm font-medium">Sell</label>
        <div className="flex items-center space-x-2">
          {/* Token Dropdown */}
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
          {/* Amount Input */}
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
          {/* Token Dropdown */}
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
          {/* Amount Input */}
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
