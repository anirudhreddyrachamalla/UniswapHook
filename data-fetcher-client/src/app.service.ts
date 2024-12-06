import { Injectable } from '@nestjs/common';
import {ethers} from 'ethers';
import { Prover,Brevis,ProofRequest, ReceiptData, Field, ErrCode } from 'brevis-sdk-typescript';
import "dotenv/config"

@Injectable()
export class AppService {
  private prover;
  private brevis;
  private provider;
  private contract
  private lastReadBlock
  constructor() {
      this.prover = new Prover('localhost:33247');
      this.brevis = new Brevis('appsdkv3.brevis.network:443');
      this.lastReadBlock = Number(process.env.START_BLOCK);
      this.provider = new ethers.JsonRpcProvider("https://1rpc.io/eth");
      const contractAddress = "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640";
      const contractABI = [
          "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"
      ];
      this.contract = new ethers.Contract(contractAddress, contractABI, this.provider);
      this.eventFetcher();
  }
  
  eventFetcher() {
      setInterval(async () => {
          console.log(`Iterating to fetch swap events with lastblock - ${this.lastReadBlock}`);
          let proofRequest = new ProofRequest();
          try {
              const currentBlock = await this.provider.getBlockNumber();
              const events = await this.contract.queryFilter(this.contract.filters.Swap(), this.lastReadBlock, currentBlock);
              if (events.length > 0) {

                  for(let i = 0;i< events.length;i++) {
                      const receipt = await this.provider.getTransactionReceipt(events[i].transactionHash);
                      if (receipt.logs.length > 0) {
                          receipt.logs.forEach((log, idx) => {
                              if (log.address == '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640' && log.topics[0] == '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67') {
                                console.log(`Txn Hash: ${events[i].transactionHash}`)
                                  proofRequest.addReceipt(new ReceiptData({
                                      tx_hash: events[i].transactionHash,
                                      fields: [
                                          new Field({
                                              log_pos: idx,
                                              is_topic: false,
                                              field_index: 4,
                                          })
                                      ],
                                  }));
                              }
                          });
                      }
                  }
                  console.log(`Sending prove request`);
                const proofRes = await this.prover.prove(proofRequest);
                if (proofRes.has_err) {
                    const err = proofRes.err;
                    switch (err.code) {
                        case ErrCode.ERROR_INVALID_INPUT:
                            console.error('invalid receipt/storage/transaction input:', err.msg);
                            break;
                        case ErrCode.ERROR_INVALID_CUSTOM_INPUT:
                            console.error('invalid custom input:', err.msg);
                            break;
                        case ErrCode.ERROR_FAILED_TO_PROVE:
                            console.error('failed to prove:', err.msg);
                            break;
                    }
                    return;
                }
                console.log('proof', proofRes.proof);
                try {
                    const brevisRes = await this.brevis.submit(proofRequest, proofRes, 1, 11155111, 0, "", "0xCBa0CF440e383E6C6cc4484904449BAe9dB312F9");
                    console.log('brevis res', brevisRes);
                    await this.brevis.wait(brevisRes.queryKey, 11155111);
                }
                catch (err) {
                    console.error(err);
                }
              }
              else {
                  console.log("No Swap events found in the last block.");
              }
              
              this.lastReadBlock = currentBlock;
          }
          catch (error) {
              console.error("Error fetching events:", error);
          }
      }, 10000);
  }
};
