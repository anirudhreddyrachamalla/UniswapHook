import React from 'react';
import { Input } from './Input';
import { Search } from 'lucide-react';

export function SearchInput() {
  return (
    <div className="relative hidden md:block">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      <Input
        placeholder="Search tokens"
        className="w-64 pl-9 bg-gray-900 border-gray-800 text-white placeholder:text-white/50 focus:ring-purple-500"
      />
    </div>
  );
}

