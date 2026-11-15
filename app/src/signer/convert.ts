/**
 * A codec for `/cosmos.evm.erc20.v1.MsgConvertCoin`, which the QoreChain SDK's
 * registry does not include:
 *   message MsgConvertCoin { Coin coin = 1; string receiver = 2; string sender = 3; }
 *   message Coin { string denom = 1; string amount = 2; }
 * It turns a bank coin such as `erc20:0x9714…` into the ERC-20 balance of
 * `receiver`, which is what a contract can see.
 */
export const CONVERT_COIN_TYPE_URL = "/cosmos.evm.erc20.v1.MsgConvertCoin";

export interface MsgConvertCoin {
  coin: { denom: string; amount: string };
  receiver: string;
  sender: string;
}

class Writer {
  private readonly bytes: number[] = [];

  private varint(value: number): void {
    let n = value;
    while (n > 0x7f) {
      this.bytes.push((n & 0x7f) | 0x80);
      n >>>= 7;
    }
    this.bytes.push(n);
  }

  string(field: number, value: string): this {
    if (value === "") return this;
    return this.message(field, new TextEncoder().encode(value));
  }

  message(field: number, data: Uint8Array): this {
    this.varint((field << 3) | 2);
    this.varint(data.length);
    for (const b of data) this.bytes.push(b);
    return this;
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

export const MsgConvertCoinCodec = {
  encode(msg: MsgConvertCoin): Writer {
    const coin = new Writer().string(1, msg.coin.denom).string(2, msg.coin.amount).finish();
    return new Writer().message(1, coin).string(2, msg.receiver).string(3, msg.sender);
  },
  decode(): MsgConvertCoin {
    throw new Error("MsgConvertCoin is only ever encoded here");
  },
  fromPartial(msg: MsgConvertCoin): MsgConvertCoin {
    return msg;
  },
};
