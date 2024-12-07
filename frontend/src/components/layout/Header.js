import React from 'react';
import { Logo } from '../ui/Logo';
import { NavLink } from '../ui/NavLink';
import { SearchInput } from '../ui/SearchInput';
import { ConnectWalletButton } from '../ui/ConnectWalletButton';

export function Header() {
  return (
    <header className="border-b border-gray-800">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center space-x-6">
            <Logo />
            <nav className="hidden md:flex items-center space-x-4">
              <NavLink to="/trade" isActive>Trade</NavLink>
              <NavLink to="/pool">Pool</NavLink>
            </nav>
          </div>
          
          <div className="flex items-center space-x-4">
            <SearchInput />
            <ConnectWalletButton />
          </div>
        </div>
      </div>
    </header>
  );
}

