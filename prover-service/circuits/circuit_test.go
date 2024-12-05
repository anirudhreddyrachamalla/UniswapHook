package circuits

import (
	"testing"

	"github.com/brevis-network/brevis-sdk/sdk"
	"github.com/brevis-network/brevis-sdk/test"
	"github.com/ethereum/go-ethereum/common"
)

func TestCircuit(t *testing.T) {
	rpc := "https://1rpc.io/eth"
	localDir := "/Users/anirudhreddy/Desktop/UniswapHook/prover-service/circuitOut"
	app, err := sdk.NewBrevisApp(1, rpc, localDir)
	check(err)

	txHash := common.HexToHash(
		"0x15428b451171874a80b9a2496d69fed6c2ca040a0a95b4704e60429ab70f956c")

	app.AddReceipt(sdk.ReceiptData{
		TxHash: txHash,
		Fields: []sdk.LogFieldData{
			{
				IsTopic:    false,
				LogPos:     2,
				FieldIndex: 4,
			},
		},
	})

	appCircuit := &AppCircuit{}
	appCircuitAssignment := &AppCircuit{}

	circuitInput, err := app.BuildCircuitInput(appCircuit)
	check(err)

	///////////////////////////////////////////////////////////////////////////////
	// Testing
	///////////////////////////////////////////////////////////////////////////////

	test.ProverSucceeded(t, appCircuit, appCircuitAssignment, circuitInput)
}

func check(err error) {
	if err != nil {
		panic(err)
	}
}