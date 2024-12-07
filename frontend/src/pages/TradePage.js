import React from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Settings } from 'lucide-react';
import { TradeTabs } from '../components/trade/TradeTabs';
import { TradeForm } from '../components/trade/TradeForm';

export default function TradePage() {
  return (
    <div className="max-w-[480px] mx-auto">
      <Card className="bg-gray-900 border-gray-800">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <TradeTabs />
            <Button variant="ghost" size="icon" className="text-gray-400">
              <Settings className="h-5 w-5" />
            </Button>
          </div>
          
          <TradeForm />
        </div>
      </Card>
    </div>
  );
}

