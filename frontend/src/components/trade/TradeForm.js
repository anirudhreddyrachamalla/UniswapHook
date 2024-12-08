import React, { useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { useAccount, useConnect } from 'wagmi';
import { parseUnits, AbiCoder, BrowserProvider, Contract } from "ethers";

export function TradeForm() {

  const HOOK_CONTRACT_ADDRESS = "0xf32988a6b16e401d90b04ec6b61a7422ff530580";
  const USDC_CONTRACT_ADDRESS = "0x497e9e733a57a09063c432bcb19cace7a047fa2e";
  const UNI_CONTRACT_ADDRESS = "0x909d68d8a57ab8f62b6391e117a77b215ab21dfc";
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
    UNI: 1,
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
        currency0: USDC_CONTRACT_ADDRESS,  // USDC < UNI (alphabetically by address)
        currency1: UNI_CONTRACT_ADDRESS,
        fee: POOL_FEE,
        tickSpacing: 120,
        hooks: HOOK_CONTRACT_ADDRESS
      };

      const bidAmount = parseUnits(String(bid), 18); // USDC has 18 decimals
      const amountIn = parseUnits(String(sellAmount), 18);
      const minAmountOut = parseUnits(String(buyAmount), 18); // UNI has 18 decimals

      // Encode Universal Router command
      const commands = new Uint8Array([0x10]); // V4_SWAP command
      console.log("address", address);

      // Encode actions for V4Router
      const actions = new Uint8Array([
        0x00, // SWAP_EXACT_IN_SINGLE
        0x01, // SETTLE_ALL
        0x02  // TAKE_ALL
      ]);

      const abiCoder = new AbiCoder();
      const hookData = abiCoder.encode(
        ["address"],
        [address]
      );
      // Prepare parameters for each action
      const params = [
        abiCoder.encode(
          ["tuple(address currency0, address currency1, uint24 fee)", "bool", "uint256", "uint256", "uint160", "bytes"],
          [
            [USDC_CONTRACT_ADDRESS, UNI_CONTRACT_ADDRESS, POOL_FEE],
            true, // zeroForOne is true because we're swapping currency0 (USDC) for currency1 (UNI)
            amountIn,
            minAmountOut,
            0, // sqrtPriceLimitX96
            hookData
          ]
        ),
        abiCoder.encode(
          ["address", "uint256"],
          [USDC_CONTRACT_ADDRESS, amountIn]
        ),
        abiCoder.encode(
          ["address", "uint256"],
          [UNI_CONTRACT_ADDRESS, minAmountOut]
        )
      ];

      // Combine actions and params into inputs
      const inputs = [abiCoder.encode(
        ["bytes", "bytes[]"],
        [actions, params]
      )];

      try {
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();

        // First approve USDC spending
        const totalAmount = bidAmount + amountIn;
        const usdcContract = new Contract(
          USDC_CONTRACT_ADDRESS,
          ["function approve(address spender, uint256 amount) public returns (bool)"],
          signer
        );

        console.log("Approving USDC...");
        const approvalTx = await usdcContract.approve(HOOK_CONTRACT_ADDRESS, totalAmount);
        await approvalTx.wait();
        console.log("USDC approved successfully!");

        // Call bidLVR
        const hookContract = new Contract(HOOK_CONTRACT_ADDRESS, ABI, signer);
        console.log("Submitting bid...");
        const tx = await hookContract.bidLVR(
          key,
          bidAmount,
          inputs,
          true, // zeroForOne is true as we're swapping currency0 (USDC) for currency1 (UNI)
          amountIn
        );
        
        const receipt = await tx.wait();
        console.log("Bid submitted successfully:", receipt);
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
