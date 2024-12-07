import React, { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { BrowserProvider, Contract, formatUnits } from 'ethers';

const HOOK_CONTRACT_ADDRESS = "0xYourHookContractAddressHere"; // Replace with your contract address
const HOOK_CONTRACT_ABI = [
  {
    "inputs": [{ "name": "poolId", "type": "bytes25" }],
    "name": "lvrRate",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

export function PositionCard({ tokenPair, fee, position, fees, apr, poolId }) {
  const [earnings, setEarnings] = useState("Fetching...");

  useEffect(() => {
    async function fetchEarnings() {
      if (!poolId) return;

      try {
        // Connect to Ethereum provider
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contract = new Contract(HOOK_CONTRACT_ADDRESS, HOOK_CONTRACT_ABI, signer);

        // Call the `lvrRate` function
        const earningsValue = await contract.lvrRate(poolId);

        // Convert to human-readable format (assuming 18 decimals)
        const formattedEarnings = formatUnits(earningsValue, 18);
        setEarnings(`${formattedEarnings} LVR`);
      } catch (error) {
        console.error("Error fetching LVR Hook Earnings:", error);
        setEarnings("Error");
      }
    }

    fetchEarnings();
  }, [poolId]);

  return (
    <Card className="bg-gray-900 border-gray-800">
      <div className="p-4">
        {/* Token Pair Section */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-4 mb-4">
          <div className="text-lg font-medium text-white">{tokenPair}</div>
          <div>
            <div className="text-sm text-gray-400">Full Range</div>
            <div className="text-sm text-gray-400">Fee: {fee}</div>
          </div>
        </div>

        {/* Position Details */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-6">
          <div className="text-center">
            <div className="text-lg font-medium text-white">{position}</div>
            <div className="text-sm text-gray-400">Position</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-medium text-white">{fees}</div>
            <div className="text-sm text-gray-400">Fees</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-medium text-white">{apr}</div>
            <div className="text-sm text-gray-400">APR</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-medium text-white">{earnings}</div>
            <div className="text-sm text-gray-400">LVR Hook Earnings</div>
          </div>
        </div>
      </div>
    </Card>
  );
}
