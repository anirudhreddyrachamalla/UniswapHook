package circuits

import (
	"github.com/brevis-network/brevis-sdk/sdk"
)

type AppCircuit struct{}

var _ sdk.AppCircuit = &AppCircuit{}

func (c *AppCircuit) Allocate() (maxReceipts, maxStorage, maxTransactions int) {
	// Our app is only ever going to use one storage data at a time so
	// we can simply limit the max number of data for storage to 1 and
	// 0 for all others
	return 32, 0, 0
}

func (c *AppCircuit) Define(api *sdk.CircuitAPI, in sdk.DataInput) error {
	//TODO: add assert checks similar to - https://github.com/brevis-network/brevis-sdk/blob/main/examples/tradingvolume/circuit.go
	receipts := sdk.NewDataStream(api, in.Receipts)
	ticks := sdk.Map(receipts, func(cur sdk.Receipt) sdk.Uint248 {
		value := api.ToInt248(cur.Fields[0].Value)
		return api.Int248.ABS(value)
	})

	mean := sdk.Mean(ticks)

	deviations := sdk.Map(ticks, func(tick sdk.Uint248) sdk.Uint248  {
		deviation := api.Uint248.Sub(tick,mean)
		return api.Uint248.Mul(deviation, deviation)
	})

	api.OutputUint(248, sdk.Mean(deviations))

	return nil
}