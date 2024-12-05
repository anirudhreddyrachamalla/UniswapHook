import { credentials } from '@grpc/grpc-js';
import {
    GatewayClient,
    GetQueryStatusRequest,
    PrepareQueryRequest,
    PrepareQueryResponse,
    ErrMsg,
    QueryStatus,
    SubmitAppCircuitProofRequest,
    type GetQueryStatusResponse,
    type SubmitAppCircuitProofResponse,
    SendBatchQueriesRequest,
    Query,
} from '../proto/brevis/gateway';
import { LogExtractInfo, ReceiptInfo, StorageQueryInfo, TransactionInfo } from '../proto/brevis/types';
import { AppCircuitInfo, AppCircuitInfoWithProof } from '../proto/common/circuit_data';
import { type ProveResponse } from '../proto/sdk/prover';
import { type ReceiptData, type StorageData, type TransactionData } from './../proto/sdk/types';
import { type ProofRequest } from './request';
import { QueryKey, QueryOption } from '../proto/brevis/gateway';

export interface SubmitResponse {
    // the query key of the request. use this query key when calling BrevisRequest.sendRequest
    // note that brevisId is not the same as the proof_id you get from calling your prover service.
    // https://github.com/brevis-network/brevis-contracts/blob/3f4c704bc15771924ddf6d203292e227e58f597e/contracts/sdk/core/BrevisRequest.sol#L61-L67
    queryKey: QueryKey;

    // amount of the fee to pay to BrevisRequest, in wei
    fee: string;
}

export interface FinalResult {
    // query key returned by prepareQuery request
    queryKey: QueryKey;

    // the tx where the final proof is submitted on-chain and the app contract is called
    tx?: string;

    // whether the final proof submission tx succeeded
    success: boolean;
}

export class Brevis {
    private readonly client: GatewayClient;

    public constructor(url: string) {
        const cred = credentials.createSsl();
        this.client = new GatewayClient(url, cred);
    }

    public async submit(
        request: ProofRequest,
        proof: ProveResponse,
        srcChainId: number,
        dstChainId: number,
        option: QueryOption,
        apiKey: string,
        callbackAddress: string,
    ): Promise<SubmitResponse> {
        const res1 = await this._prepareQuery(
            request,
            proof.circuit_info,
            srcChainId,
            dstChainId,
            option,
            apiKey,
            callbackAddress,
        );
        if (res1.has_err) {
            throw new Error(`failed to submit ${res1.err.msg}`);
        }
        console.log('brevis query key', JSON.stringify(res1.query_key));
        const res2 = await this._submitProof(res1.query_key, dstChainId, proof.proof);
        if (res2.has_err) {
            throw new Error(`failed to submit ${res2.err.msg}`);
        }

        return {
            queryKey: res1.query_key,
            fee: res1.fee,
        };
    }

    public async prepareQuery(
        request: ProofRequest,
        circuitInfo: AppCircuitInfo,
        srcChainId: number,
        dstChainId: number,
        option: QueryOption,
        apiKey: string,
        callbackAddress: string,
    ): Promise<PrepareQueryResponse> {
        return this._prepareQuery(request, circuitInfo, srcChainId, dstChainId, option, apiKey, callbackAddress);
    }

    public async submitProof(queryKey: QueryKey, dstChainId: number, proof: string) {
        await this._submitProof(queryKey, dstChainId, proof);
    }

    // wait untill the final proof is submitted on-chain and the app contract is called
    public async wait(queryKey: QueryKey, dstChainId: number): Promise<FinalResult> {
        const interval = 10000;
        const count = 50;

        for (let i = 0; i < count; i++) {
            const res = await this.getQueryStatus(queryKey, dstChainId);
            switch (res.status) {
                case QueryStatus.QS_COMPLETE:
                    console.log(`request query: proofId ${queryKey.query_hash} nonce ${queryKey.nonce} success, tx ${res.tx_hash}`);
                    return { queryKey: queryKey, tx: res.tx_hash, success: true };
                case QueryStatus.QS_FAILED:
                    console.log(`request query: proofId ${queryKey.query_hash} nonce ${queryKey.nonce} failed`);
                    return { queryKey: queryKey, success: false };
                case QueryStatus.QS_TO_BE_PAID:
                    console.log(
                        `query: proofId ${queryKey.query_hash} nonce ${queryKey.nonce} waiting for payment. call BrevisRequest.sendRequest to initiate the payment`,
                    );
                    break;
                default:
                    console.log(`query: proofId ${queryKey.query_hash} nonce ${queryKey.nonce} waiting for final tx`);
            }
            await new Promise(resolve => setTimeout(resolve, interval));
        }
        console.log(`query: proofId ${queryKey.query_hash} nonce ${queryKey.nonce}  timed out after ${interval * count} seconds`);
        return { queryKey: queryKey, success: false };
    }

    private async _prepareQuery(
        request: ProofRequest,
        circuitInfo: AppCircuitInfo,
        srcChainId: number,
        dstChainId: number,
        option: QueryOption,
        apiKey: string,
        callbackAddress: string,
    ): Promise<PrepareQueryResponse> {
        if (apiKey.length > 0) {
            return this._prepareQueryForBrevisPartnerFlow(
                request,
                circuitInfo,
                srcChainId,
                dstChainId,
                option,
                apiKey,
                callbackAddress,
            );
        }
        const req = new PrepareQueryRequest({
            chain_id: srcChainId,
            target_chain_id: dstChainId,
            receipt_infos: request.getReceipts().map(r => this.buildReceiptInfo(r.data)),
            storage_query_infos: request.getStorages().map(s => this.buildStorageInfo(s.data)),
            transaction_infos: request.getTransactions().map(t => this.buildTransactionInfo(t.data)),
            option: option,
            app_circuit_info: circuitInfo,
        });
        const res = await this.client.PrepareQuery(req);
        return res;
    }

    private async _prepareQueryForBrevisPartnerFlow(
        request: ProofRequest,
        circuitInfo: AppCircuitInfo,
        srcChainId: number,
        dstChainId: number,
        option: QueryOption,
        apiKey: string,
        callbackAddress: string,
    ): Promise<PrepareQueryResponse> {
        if (callbackAddress.length == 0) {
            return new PrepareQueryResponse({
                err: new ErrMsg({
                    msg: 'brevis partner flow needs callback address',
                }),
            });
        }

        const req = new SendBatchQueriesRequest({
            chain_id: srcChainId,
            target_chain_id: dstChainId,
            queries: [
                new Query({
                    receipt_infos: request.getReceipts().map(r => this.buildReceiptInfo(r.data)),
                    storage_query_infos: request.getStorages().map(s => this.buildStorageInfo(s.data)),
                    transaction_infos: request.getTransactions().map(t => this.buildTransactionInfo(t.data)),
                    app_circuit_info: new AppCircuitInfoWithProof({
                        output_commitment: circuitInfo.output_commitment,
                        vk_hash: circuitInfo.vk_hash,
                        input_commitments: circuitInfo.input_commitments,
                        toggles: circuitInfo.toggles,
                        output: circuitInfo.output,
                        callback_addr: callbackAddress,
                        input_commitments_root: circuitInfo.input_commitments_root,
                        witness: circuitInfo.witness,
                        max_receipts: circuitInfo.max_receipts,
                        max_storage: circuitInfo.max_storage,
                        max_tx: circuitInfo.max_tx,
                        max_num_data_points: circuitInfo.max_num_data_points,
                    }),
                }),
            ],
            option: option,
            api_key: apiKey,
        });

        const res = await this.client.SendBatchQueries(req);
        if (res.has_err) {
            return new PrepareQueryResponse({
                err: new ErrMsg({
                    msg: `failed to prepare query for brevis partner flow: ${res.err.msg} `,
                }),
            });
        }
        if (res.query_keys.length == 0) {
            return new PrepareQueryResponse({
                err: new ErrMsg({
                    msg: `empty query info for brevis partner flow: ${res.err.msg} `,
                }),
            });
        }

        return new PrepareQueryResponse({
            query_key: res.query_keys[0],
            fee: res.fee,
        });
    }

    private async _submitProof(
        query_key: QueryKey,
        dstChainId: number,
        proof: string,
    ): Promise<SubmitAppCircuitProofResponse> {
        const req = new SubmitAppCircuitProofRequest({
            query_key: query_key,
            target_chain_id: dstChainId,
            proof,
        });
        const res = await this.client.SubmitAppCircuitProof(req);
        if (res.has_err) {
            throw new Error(`error while submitting proof to brevis: ${res.err.msg}`);
        }
        return res;
    }

    private async getQueryStatus(queryKey: QueryKey, dstChainId: number): Promise<GetQueryStatusResponse> {
        const req = new GetQueryStatusRequest({ query_key: queryKey, target_chain_id: dstChainId });
        const res = await this.client.GetQueryStatus(req);
        if (res.has_err) {
            throw new Error(`error while waiting for final result: ${res.err.msg}`);
        }
        return res;
    }

    private buildReceiptInfo(data: ReceiptData): ReceiptInfo {
        return new ReceiptInfo({
            blk_num: data.block_num,
            transaction_hash: data.tx_hash,
            log_extract_infos: data.fields.map(f => {
                return new LogExtractInfo({
                    contract_address: f.contract,
                    log_pos: f.log_pos,
                    log_topic0: f.event_id,
                    value_from_topic: f.is_topic,
                    value_index: f.field_index,
                    value: f.value,
                });
            }),
        });
    }

    private buildStorageInfo(data: StorageData): StorageQueryInfo {
        return new StorageQueryInfo({
            account: data.address,
            storage_keys: [data.slot],
            blk_num: data.block_num,
        });
    }

    private buildTransactionInfo(data: TransactionData): TransactionInfo {
        return new TransactionInfo({ transaction_hash: data.hash });
    }
}
