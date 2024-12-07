package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"math/big"

	"github.com/anirudhreddyrachamalla/prover-service/circuits"
	"github.com/brevis-network/brevis-sdk/sdk"
	"github.com/brevis-network/brevis-sdk/sdk/proto/gwproto"
	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
)

var port = flag.Uint("port", 33247, "the port to start the service at")

func main() {
	//flag.Parse()

	// proverService, err := prover.NewService(&circuits.AppCircuit{}, prover.ServiceConfig{
	// 	SetupDir: "/Users/anirudhreddy/Desktop/UniswapHook/prover-service/circuitOut",
	// 	SrsDir:   "/Users/anirudhreddy/Desktop/UniswapHook/prover-service/",
	// 	RpcURL:   "https://1rpc.io/eth",
	// 	ChainId:  1,
	// })
	// if err != nil {
	// 	fmt.Println(err)
	// 	os.Exit(1)
	// }
	// proverService.Serve("", *port)

	client, err := ethclient.Dial("https://1rpc.io/eth")
	if err != nil {
		log.Fatalf("Failed to connect to Ethereum node: %v", err)
	}

	// Listen to Swap events
	listenSwapEvents(client)
}

const (
	contractAddress = "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640"
	swapEventABI    = `event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)`
)

func listenSwapEvents(client *ethclient.Client) {
	// Parse the event ABI
	// eventAbi, err := abi.JSON(strings.NewReader(fmt.Sprintf(`[%s]`, swapEventABI)))
	// if err != nil {
	// 	log.Fatalf("Failed to parse event ABI: %v", err)
	// }

	// Get the event's signature hash
	appCircuit := &circuits.AppCircuit{}
	
	swapEventSig := "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67"

	// Create a filter query
	query := ethereum.FilterQuery{
		FromBlock: big.NewInt(21348491),
		ToBlock:   big.NewInt(21348493),
		Addresses: []common.Address{
			common.HexToAddress(contractAddress),
		},
		Topics: [][]common.Hash{
			{common.HexToHash(swapEventSig)},
		},
	}

	//compiledCircuit, pk, vk, _,_ := sdk.Compile(appCircuit, "/Users/anirudhreddy/Desktop/UniswapHook/prover-service/circuitCompiledOut", "/Users/anirudhreddy/Desktop/UniswapHook/prover-service")

	// Poll for events every 10 seconds
	for {
		app,_ := sdk.NewBrevisApp(1, "https://1rpc.io/eth", "/Users/anirudhreddy/Desktop/UniswapHook/prover-service/output")
		log.Println("Polling for new events...")
		logs, err := client.FilterLogs(context.Background(), query)
		if err != nil {
			log.Fatalf("Failed to filter logs: %v", err)
		}

		for _, vLog := range logs {
			// Get the transaction receipt
			receipt, err := client.TransactionReceipt(context.Background(), vLog.TxHash)
			if err != nil {
				log.Printf("Failed to fetch receipt for TxHash %s: %v", vLog.TxHash.Hex(), err)
				continue
			}
	
			// Print receipt details
			// fmt.Printf("Transaction Receipt for TxHash %s:\n", vLog.TxHash.Hex())
			// fmt.Printf("  BlockNumber: %d\n", receipt.BlockNumber.Uint64())
			// fmt.Printf("  GasUsed: %d\n", receipt.GasUsed)
			// fmt.Printf("  Status: %d\n", receipt.Status)
	
			// Process logs in the receipt if needed
			for idx, log := range receipt.Logs {
				// fmt.Printf("  Log Address: %s\n", log.Address.Hex())
				//fmt.Printf("  Log Topics: %v\n", log.Topics[0])
				//fmt.Printf("  Hash: %v\n", common.HexToHash(swapEventSig))

				if(log.Address.Hex() == "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640" && log.Topics[0]==common.HexToHash(swapEventSig)){
					fmt.Printf("idx: %v, txnHash: %v", idx, vLog.TxHash)
					app.AddReceipt(sdk.ReceiptData{
						TxHash: vLog.TxHash,
						Fields: []sdk.LogFieldData{
							{
								IsTopic:    false,
								LogPos:     uint(idx),
								FieldIndex: 4,
							},
						},
					})
				}
			}
		}

		fmt.Printf("building circuit")
		circuitInput, err := app.BuildCircuitInput(appCircuit)
		compiledCircuit, pk, vk, _, err := sdk.ReadSetupFrom(appCircuit,"/Users/anirudhreddy/Desktop/UniswapHook/prover-service/circuitCompiledOut")
		fmt.Printf("generate witness")
		witness, publicWitness, err := sdk.NewFullWitness(&circuits.AppCircuit{}, circuitInput)
		fmt.Printf("generate proof")
		proof, err := sdk.Prove(compiledCircuit, pk, witness)
		fmt.Printf("verify locally")
		sdk.Verify(vk, publicWitness, proof)
		app.PrepareRequest(
			vk, witness, 1, 11155111, common.HexToAddress("0x818484227ABF04550c6c242B6119B7c94d2E72b3"), common.HexToAddress("0x9cC4a49667928Cba39BBb9d271BAC6736B122516"), 0, gwproto.QueryOption_ZK_MODE.Enum(), "")
		
		fmt.Printf("submit to brevis network")
		err = app.SubmitProof(proof)
		if (err == nil) {
			fmt.Printf("succesfully submitted proof to brevis network")
		} else{
			fmt.Printf("error while submitting proof: %v", err)
		}


		// Wait 10 seconds before polling again
		//time.Sleep(10 * time.Second)
	}
}