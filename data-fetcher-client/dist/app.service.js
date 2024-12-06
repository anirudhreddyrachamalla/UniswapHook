"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppService = void 0;
const common_1 = require("@nestjs/common");
const ethers_1 = require("ethers");
const brevis_sdk_typescript_1 = require("brevis-sdk-typescript");
require("dotenv/config");
let AppService = class AppService {
    constructor() {
        this.prover = new brevis_sdk_typescript_1.Prover('localhost:33247');
        this.brevis = new brevis_sdk_typescript_1.Brevis('appsdkv3.brevis.network:443');
        this.lastReadBlock = Number(process.env.START_BLOCK);
        this.provider = new ethers_1.ethers.JsonRpcProvider("https://1rpc.io/eth");
        const contractAddress = "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640";
        const contractABI = [
            "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"
        ];
        this.contract = new ethers_1.ethers.Contract(contractAddress, contractABI, this.provider);
        this.eventFetcher();
    }
    eventFetcher() {
        setInterval(async () => {
            console.log(`Iterating to fetch swap events with lastblock - ${this.lastReadBlock}`);
            let proofRequest = new brevis_sdk_typescript_1.ProofRequest();
            try {
                const currentBlock = await this.provider.getBlockNumber();
                const events = await this.contract.queryFilter(this.contract.filters.Swap(), this.lastReadBlock, currentBlock);
                if (events.length > 0) {
                    for (let i = 0; i < events.length; i++) {
                        const receipt = await this.provider.getTransactionReceipt(events[i].transactionHash);
                        if (receipt.logs.length > 0) {
                            receipt.logs.forEach((log, idx) => {
                                if (log.address == '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640' && log.topics[0] == '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67') {
                                    console.log(`Txn Hash: ${events[i].transactionHash}`);
                                    proofRequest.addReceipt(new brevis_sdk_typescript_1.ReceiptData({
                                        tx_hash: events[i].transactionHash,
                                        fields: [
                                            new brevis_sdk_typescript_1.Field({
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
                            case brevis_sdk_typescript_1.ErrCode.ERROR_INVALID_INPUT:
                                console.error('invalid receipt/storage/transaction input:', err.msg);
                                break;
                            case brevis_sdk_typescript_1.ErrCode.ERROR_INVALID_CUSTOM_INPUT:
                                console.error('invalid custom input:', err.msg);
                                break;
                            case brevis_sdk_typescript_1.ErrCode.ERROR_FAILED_TO_PROVE:
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
exports.AppService = AppService;
exports.AppService = AppService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], AppService);
;
//# sourceMappingURL=app.service.js.map