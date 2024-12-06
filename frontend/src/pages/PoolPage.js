import React from 'react';
import { Button } from '../components/ui/Button';
import { PositionCard } from '../components/pool/PositionCard';

export default function PoolPage() {
  return (
    <div className="max-w-[640px] mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium text-white">Your Position</h1>
        <div className="flex space-x-2">
          <Button variant="default" size="sm">
            + New
          </Button>
          <Button variant="ghost" size="sm">
            Filter
          </Button>
        </div>
      </div>

      {/* Position Card */}
      <PositionCard
        tokenPair="ETH / WBTC"
        fee="0.3%"
        position="0.005 ETH / 0 WBTC"
        fees="$5.23"
        apr="12.5%"
        earnings="$2.10"
      />
    </div>
  );
}