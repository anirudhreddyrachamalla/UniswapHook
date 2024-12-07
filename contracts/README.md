# LVR Hook

A sophisticated Uniswap v4 Hook implementation that manages LVR through a novel bidding mechanism and automated arbitrage execution.

## Overview

The LVR Hook ensures optimal pool efficiency by:
1. Monitoring pool volatility through Brevis Protocol
2. Managing arbitrage opportunities via a bidding system
3. Executing automated interventions when needed
4. Collecting and distributing fees based on volatility metrics

## Core Components

### 1. Volatility Management
- **Brevis Integration**: On-chain volatility (sigma) verification
- **Dynamic Fee Calculation**: `BASE_FEE * sigma / FEE_MULTIPLIER`
- **Minimum Bid Formula**: `(sigma² * poolLiquidity) / 800`

### 2. Bidding System

#### Bid Structure

#### Bidding Process Flow
1. **Block N**: Arbitragers submit bids
   - Must exceed minimum bid: `(sigma² * poolLiquidity) / 800`
   - Higher bids replace existing ones
   - Requires approvals for both:
     - USDC (bid amount)
     - Input token (swap amount)

2. **Block N+1**: Execution
   - Occurs before any user swaps
   - Transfers tokens from winning bidder
   - Executes swap via Universal Router
   - Collects USDC fee

### 3. LVR Protection Mechanism

#### Default Bidder
- Activates when no external bids exist
- Uses predefined swap parameters
- Bid amount: `(sigma² * poolLiquidity) / 800`
- Ensures minimum LVR maintenance

#### Execution Priority
1. External winning bid (if exists)
2. LVRBidder default swap (if no external bids)
3. User swaps

## Technical Implementation

### Key Functions

#### 1. Bid Submission
```solidity
function bidLVR(
    PoolKey calldata key,
    uint256 bidAmount,
    bytes[] calldata inputs,
    bool zeroForOne,
    uint256 amountIn
)
```

#### 2. Swap Execution
```solidity
function beforeSwap(
    address sender,
    PoolKey calldata key,
    IPoolManager.SwapParams calldata params,
    bytes calldata
)
```

### Security Features

1. **Recursion Prevention**
   - `pendingArbitrage` flag
   - Single execution per block
   - Atomic operations

2. **Token Safety**
   - Pre-approved transfers
   - Strict allowance checks
   - Revert on any failure

3. **Bid Validation**
   - Minimum threshold enforcement
   - Block number verification
   - Input validation

## Pending Implementations

### Funding Fee System
The `beforeRemoveLiquidity` hook will implement:

1. **Fee Calculation**
   - Time-weighted position value
   - Volatility exposure compensation
   - Proportional fee distribution

2. **Variables to Consider**
   - Position duration
   - Average sigma during holding period
   - Pool utilization metrics

3. **Distribution Logic**
   - Pro-rata fee sharing
   - Volatility-adjusted rewards
   - Minimum holding period incentives

## Events and Monitoring

### Key Events
```solidity
event SigmaUpdated(PoolId indexed poolId, uint256 sigma, uint64 blockNum);
```

### Monitoring Points
1. Volatility changes
2. Bid submissions and executions
3. Fee collections
4. LVRBidder interventions

## Integration Requirements

### Contract Dependencies
- Uniswap V4 Core
- Universal Router
- Brevis Protocol
- OpenZeppelin Contracts

### Token Requirements
- USDC for fee collection
- Pool tokens for swaps
- Necessary approvals for both

## Configuration

### Constructor Parameters
```solidity
constructor(
    IPoolManager _poolManager,
    address _brevisRequest,
    address _usdc,
    address _lvrBidder,
    bytes memory _defaultSwapCalldata,
    address _router
)
```

### Admin Functions
- `setVkHash`: Update Brevis verification key
- `setLVRBidder`: Update default bidder address
- `setDefaultSwapCalldata`: Update default swap parameters

## License
MIT License
