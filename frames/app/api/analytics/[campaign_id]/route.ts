import {
  USDC_CONTRACT_ADDRESS,
  usdcABI,
} from "@/app/frames/txdata/contracts_abi/usdc";
import { QueryResultRow, sql } from "@vercel/postgres";
import Moralis from "moralis";

import { http, createPublicClient } from "viem";
import { baseSepolia } from "viem/chains";

Moralis.start({
  apiKey: process.env.MORALIS_API_KEY,
}).catch(console.error);

// user conversion per affiliate
export async function GET(
  request: Request,
  { params }: { params: { campaign_id: string } }
) {
  const { rows: rowsFrames } =
    await sql`SELECT * from FRAME_INTERACTIONS where campaign_id=${params.campaign_id}`;

  const { rows: rowsTransactions } =
    await sql`SELECT * from TRANSACTION_EVENT where campaign_id=${params.campaign_id}`;

  const uniqueRowsTransactions = rowsTransactions.reduce(
    (acc: QueryResultRow[], obj) => {
      if (acc.filter((r) => r.customer_fid === obj.customer_fid).length === 0) {
        acc.push(obj);
      }
      return acc;
    },
    [] as QueryResultRow[]
  );

  const networths = [];
  const customerFids = [];
  let customersAlsoBought = new Set<string>();
  const { rows: rowsUniqueCustomerTransactions } =
    await sql`SELECT DISTINCT customer_fid from TRANSACTION_EVENT where campaign_id=${params.campaign_id}`;
  const { rows: rowsUniqueCustomerInteractions } =
    await sql`SELECT DISTINCT customer_fid from FRAME_INTERACTIONS where campaign_id=${params.campaign_id}`;

  const userConversion =
    rowsUniqueCustomerTransactions.length /
    rowsUniqueCustomerInteractions.length;

  for (var row of uniqueRowsTransactions) {
    customerFids.push(row.customer_fid);
    const { rows: rowsCustomersAlsoBought } =
      await sql`SELECT DISTINCT campaign_id from TRANSACTION_EVENT where customer_fid=${row.customer_fid} and campaign_id!=${params.campaign_id}`;

    rowsCustomersAlsoBought.forEach((row) =>
      customersAlsoBought.add(row.campaign_id)
    );

    console.log(rowsCustomersAlsoBought);
    const uniqueAddresses = Array.from(
      new Set(JSON.parse(row.customer_addresses_json) as string[])
    );
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });

    const zero = BigInt(0).valueOf();
    const networthAcc = [zero];
    for (var address of uniqueAddresses) {
      if (address) {
        const data = await publicClient.readContract({
          address: USDC_CONTRACT_ADDRESS,
          abi: usdcABI,
          functionName: "balanceOf",
          args: [address as `0x${string}`],
        });
        networthAcc.push(
          // await Moralis.EvmApi.wallets
          //   .getWalletNetWorth({
          //     excludeSpam: true,
          //     excludeUnverifiedContracts: true,
          //     address,
          //   })
          //   .then((result) => parseInt(result.raw.total_networth_usd))
          (data / BigInt(1000000)).valueOf()
        );
      }
    }

    networths.push(
      networthAcc.reduce(
        (accumulator, currentValue) => accumulator + currentValue,
        zero
      )
    );
  }

  return Response.json(
    {
      campaign_id: params.campaign_id,
      networths: networths.map((n) => n.toString()),
      customerFidsBelow10000: customerFids.filter((fid) => fid <= 10000).length,
      customersAlsoBought: Array.from(customersAlsoBought),
      userConversion,
    },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
}
