#!/usr/bin/env node
import { createFakeKonnect } from "./index.js";

const [command = "fake", ...rest] = process.argv.slice(2);

if (command !== "fake") {
  console.error(`Usage: tnpay-konnect fake [--port <n>] [--api-key <key>]`);
  process.exit(1);
}

const portIndex = rest.indexOf("--port");
const keyIndex = rest.indexOf("--api-key");
const port = portIndex === -1 ? 7320 : Number(rest[portIndex + 1]);
const apiKey = keyIndex === -1 ? "fake-api-key" : rest[keyIndex + 1];

async function main() {
  const fake = await createFakeKonnect(
    apiKey === undefined ? { port } : { port, apiKey },
  );

  console.log(`Fake Konnect listening.
  baseUrl:  ${fake.baseUrl}
  api key:  ${fake.apiKey}
  wallet:   any non-empty string

Point the client at it:
  new Konnect({ apiKey: "${fake.apiKey}", walletId: "demo", baseUrl: "${fake.baseUrl}" })

Open a payment's payUrl in a browser to pay or fail it.`);

  const stop = () => fake.close().then(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
