#!/usr/bin/env node
import { createFakeFlouci } from "./index";

const [command = "fake", ...rest] = process.argv.slice(2);

if (command !== "fake") {
  console.error(`Usage: tnpay-flouci fake [--port <n>]`);
  process.exit(1);
}

const portIndex = rest.indexOf("--port");
const port = portIndex === -1 ? 7321 : Number(rest[portIndex + 1]);

async function main() {
  const fake = await createFakeFlouci({ port });

  console.log(`Fake Flouci listening.
  baseUrl:     ${fake.baseUrl}
  public key:  ${fake.publicKey}
  private key: ${fake.privateKey}

Point the client at it:
  new Flouci({ publicKey: "${fake.publicKey}", privateKey: "${fake.privateKey}", baseUrl: "${fake.baseUrl}" })

Open a payment's payUrl in a browser to pay or fail it.`);

  const stop = () => fake.close().then(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
