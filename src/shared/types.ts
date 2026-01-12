export type ResolveResponse =
  | { status: "direct"; address: string }
  | { status: "unclaimed" };

export type TipRequest = {
  channelId: string;
  amount: string; // human units, e.g. "1.25"
  message?: string;
};

export type TxPlan =
  | {
      kind: "DIRECT";
      to: string;
      token: string;
      amountRaw: string; // base units as string
    }
  | {
      kind: "ESCROW";
      escrow: string;
      token: string;
      channelId: string;
      channelIdHash: string; // bytes32 hex string
      amountRaw: string;
      message: string;
    };

export type InpageRequest =
  | { type: "TIPMNEE_CONNECT" }
  | { type: "TIPMNEE_SEND_TX"; chainId: number; plan: TxPlan };

export type InpageResponse =
  | { type: "TIPMNEE_CONNECTED"; address: string; chainId: number }
  | { type: "TIPMNEE_TX_SENT"; txHash: string }
  | { type: "TIPMNEE_ERROR"; error: string };
