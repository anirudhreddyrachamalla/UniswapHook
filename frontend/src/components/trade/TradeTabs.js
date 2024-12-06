import React from 'react';
import { TabGroup, TabList, Tab } from '@headlessui/react';

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function TradeTabs() {
  const tabs = ['Swap', 'Limit', 'Send', 'Buy'];

  return (
    <TabGroup>
      <TabList className="flex justify-center space-x-6 rounded-lg bg-gray-900 p-2 shadow-md">
        {tabs.map((tab) => (
          <Tab
            key={tab}
            className={({ selected }) =>
              classNames(
                'w-1/4 rounded-lg px-4 py-2 text-sm font-semibold tracking-wide',
                'focus:outline-none focus:ring-4 ring-offset-2 ring-offset-gray-900 ring-purple-500',
                selected
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white transition-colors duration-200'
              )
            }
          >
            {tab}
          </Tab>
        ))}
      </TabList>
    </TabGroup>
  );
}
