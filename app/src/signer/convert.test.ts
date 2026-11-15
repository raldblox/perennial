import { bytesToHex } from "viem";
import { describe, expect, it } from "vitest";
import { MsgConvertCoinCodec } from "./convert";

describe("MsgConvertCoin encoding", () => {
  it("writes the three fields in protobuf wire format", () => {
    const bytes = MsgConvertCoinCodec.encode({ coin: { denom: "d", amount: "5" }, receiver: "0xab", sender: "qor1x" }).finish();
    // field 1 (coin, 6 bytes: denom "d", amount "5"), field 2 "0xab", field 3 "qor1x"
    expect(bytesToHex(bytes)).toBe("0x0a060a0164120135" + "1204" + "30786162" + "1a05" + "716f723178");
  });

  it("encodes lengths above 127 as varints", () => {
    const long = "x".repeat(200);
    const bytes = MsgConvertCoinCodec.encode({ coin: { denom: "d", amount: "1" }, receiver: long, sender: "s" }).finish();
    // tag 0x12, then 200 as a varint: 0xc8 0x01
    expect(bytesToHex(bytes.slice(8, 11))).toBe("0x12c801");
  });
});
