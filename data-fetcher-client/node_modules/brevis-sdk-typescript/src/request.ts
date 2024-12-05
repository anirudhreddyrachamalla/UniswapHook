import { ethers } from 'ethers';
import { ProveRequest } from '../proto/sdk/prover';
import {
    CustomInput as CustomInputPb,
    Field,
    IndexedReceipt,
    IndexedStorage,
    IndexedTransaction,
    type ReceiptData,
    type StorageData,
    type TransactionData,
} from '../proto/sdk/types';
import { CustomInput } from './circuit-types';

export class ProofRequest {
    private readonly receipts: IndexedReceipt[] = [];
    private readonly storages: IndexedStorage[] = [];
    private readonly transactions: IndexedTransaction[] = [];
    private customInput?: CustomInputPb;

    public getReceipts(): IndexedReceipt[] {
        return this.receipts;
    }

    public getStorages(): IndexedStorage[] {
        return this.storages;
    }

    public getTransactions(): IndexedTransaction[] {
        return this.transactions;
    }

    public addReceipt(data: ReceiptData, index?: number): void {
        validateReceipt(data);
        this.receipts.push(new IndexedReceipt({ index, data }));
    }

    public addStorage(data: StorageData, index?: number): void {
        validateStorage(data);
        this.storages.push(new IndexedStorage({ index, data }));
    }

    public addTransaction(data: TransactionData, index?: number): void {
        validateTransaction(data);
        this.transactions.push(new IndexedTransaction({ index, data }));
    }

    public setCustomInput(data: CustomInput): void {
        this.customInput = new CustomInputPb({
            json_bytes: JSON.stringify(data),
        });
    }

    public build(): ProveRequest {
        if (this.customInput === undefined) {
            this.customInput = new CustomInputPb({ json_bytes: '{}' });
        }
        const req = new ProveRequest({
            receipts: this.receipts,
            storages: this.storages,
            transactions: this.transactions,
            custom_input: this.customInput,
        });
        return req;
    }
}

function validateReceipt(d: ReceiptData) {
    if (d.block_num < 0) err('receipt.block_num', d.block_num);
    if (!validLen(d.tx_hash)) err('transaction.tx_hash', d.tx_hash);
    d.fields.forEach((field, i) => {
        validateReceiptField(field, i);
    });
}

function validateReceiptField(d: Field, i: number) {
    const field = `receipt.field[${i}]`;
    if (d.log_pos < 0) err(field + '.log_pos', d.log_pos);
    if (d.field_index < 0) err(field + '.field_index', d.field_index);
}

function validateStorage(d: StorageData) {
    if (d.block_num < 0) err('storage.block_num', d.block_num);
    if (!ethers.isAddress(d.address)) err('storage.address', d.address);
    if (!validLen(d.slot)) err('storage.slot', d.slot);
}

function validateTransaction(d: TransactionData) {
    if (!validLen(d.hash)) err('transaction.hash', d.hash);
}

function validLen(d: string): boolean {
    if (!ethers.isBytesLike(d)) {
        d = ethers.toBeHex(d);
    }
    const len = ethers.dataLength(d);
    return len > 0 && len <= 32;
}

function err(fieldName: string, value: any) {
    throw new Error(`invalid ${fieldName} ${value}`);
}
