import React from 'react';
import { Button } from './Button';
import { ChevronDown } from 'lucide-react';

function getTokenEmoji(symbol) {
  switch (symbol.toUpperCase()) {
    case 'ETH':
      return '🔷';
    case 'WBTC':
      return '₿';
    default:
      return '🪙';
  }
}

export function TokenSelector({ token, onSelect, balance, label }) {
  return (
    <div className="flex flex-col space-y-1">
      {label && <span className="text-sm text-gray-400">{label}</span>}
      <Button
        variant="ghost"
        onClick={onSelect}
        className="flex items-center justify-between w-full h-14 px-4 bg-gray-900 hover:bg-gray-800 text-left"
      >
        <div className="flex items-center">
          {token ? (
            <>
              <span className="text-2xl mr-2">{getTokenEmoji(token.symbol)}</span>
              <span className="ml-2 text-lg font-medium text-white">{token.symbol}</span>
            </>
          ) : (
            <span className="text-purple-300">Select token</span>
          )}
        </div>
        <div className="flex items-center text-gray-400">
          {balance && <span className="mr-2 text-white">{balance}</span>}
          <ChevronDown className="h-5 w-5" />
        </div>
      </Button>
    </div>
  );
}

