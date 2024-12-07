import React from 'react';
import { Button } from './Button';
import { Wallet, Power } from 'lucide-react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';

export function ConnectWalletButton() {
  const { disconnect } = useDisconnect();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();

  return (
    <div className="flex items-center space-x-2">
      {/* Connect Wallet Button */}
      <Button
        variant="outline"
        className="flex items-center justify-center border border-purple-500 text-purple-500 hover:bg-purple-500 hover:text-white rounded-lg px-4 py-2 text-sm font-medium transition duration-200"
        onClick={() => connect({ connector: connectors[0] })}
      >
        <Wallet className="mr-2 h-5 w-5" />
        {isConnected && address
          ? `${address.substring(0, 6)}...${address.slice(-4)}`
          : "Connect Wallet"}
      </Button>

      {/* Disconnect Button */}
      {isConnected && (
        <Button
          variant="ghost"
          className="flex items-center justify-center p-2 rounded-full bg-gray-800 hover:bg-red-600 transition duration-200"
          onClick={() => disconnect()}
          aria-label="Disconnect Wallet"
        >
          <Power className="h-5 w-5 text-gray-400 hover:text-white" />
        </Button>
      )}
    </div>
  );
}
