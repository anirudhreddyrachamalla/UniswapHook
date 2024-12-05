package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/anirudhreddyrachamalla/prover-service/circuits"
	"github.com/brevis-network/brevis-sdk/sdk/prover"
)

var port = flag.Uint("port", 33247, "the port to start the service at")

func main() {
	flag.Parse()

	proverService, err := prover.NewService(&circuits.AppCircuit{}, prover.ServiceConfig{
		SetupDir: "/Users/anirudhreddy/Desktop/UniswapHook/prover-service/circuitOut",
		SrsDir:   "/Users/anirudhreddy/Desktop/UniswapHook/prover-service/",
		RpcURL:   "https://1rpc.io/eth",
		ChainId:  1,
	})
	if err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
	proverService.Serve("", *port)
}