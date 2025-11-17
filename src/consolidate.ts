import * as Cardano from "@emurgo/cardano-serialization-lib-nodejs";
import * as MessageSigning from "@emurgo/cardano-message-signing-nodejs";
import { mnemonicToEntropy, validateMnemonic } from "bip39";
import axios from "axios";
import path from "path";
import fs from "fs";
import { HttpsProxyAgent } from "https-proxy-agent";

type NetworkOption = "mainnet" | "preprod" | "preview" | "testnet";
type SignatureFormat = "raw" | "cose";

const HARDENED_OFFSET = 0x80000000;

interface ConsolidateInput {
  mnemonic: string;
  recipientAddress: string;
  accountIndex: number;
  addressIndex: number;
  stakeIndex: number;
  network: NetworkOption;
  signatureFormat: SignatureFormat;
}

interface ConsolidateResult {
  payerAddress: string;
  message: string;
  signatureHex: string;
  publicKeyHex: string;
  networkId: number;
  signatureFormat: SignatureFormat;
}

function mnemonicToRootKey(mnemonic: string): Cardano.Bip32PrivateKey {
  const entropyHex = mnemonicToEntropy(mnemonic);
  const entropyBytes = Buffer.from(entropyHex, "hex");
  return Cardano.Bip32PrivateKey.from_bip39_entropy(entropyBytes, Buffer.from(""));
}

function deriveAccountKey(rootKey: Cardano.Bip32PrivateKey, accountIndex: number): Cardano.Bip32PrivateKey {
  return rootKey
    .derive(HARDENED_OFFSET + 1852)
    .derive(HARDENED_OFFSET + 1815)
    .derive(HARDENED_OFFSET + accountIndex);
}

function derivePaymentKey(accountKey: Cardano.Bip32PrivateKey, addressIndex: number): Cardano.PrivateKey {
  return accountKey.derive(0).derive(addressIndex).to_raw_key();
}

function deriveStakeKey(accountKey: Cardano.Bip32PrivateKey, stakeIndex: number): Cardano.PrivateKey {
  return accountKey.derive(2).derive(stakeIndex).to_raw_key();
}

function getNetworkInfo(network: NetworkOption): Cardano.NetworkInfo {
  switch (network) {
    case "mainnet":
      return Cardano.NetworkInfo.mainnet();
    case "preprod":
    case "preview":
    case "testnet":
      return Cardano.NetworkInfo.testnet();
    default:
      throw new Error(`Unsupported network ${network}`);
  }
}

function buildPayerAddress(
  paymentKey: Cardano.PrivateKey,
  stakeKey: Cardano.PrivateKey,
  networkInfo: Cardano.NetworkInfo,
): string {
  const paymentPubKey = paymentKey.to_public();
  const stakePubKey = stakeKey.to_public();
  const baseAddress = Cardano.BaseAddress.new(
    networkInfo.network_id(),
    Cardano.StakeCredential.from_keyhash(paymentPubKey.hash()),
    Cardano.StakeCredential.from_keyhash(stakePubKey.hash()),
  );
  return baseAddress.to_address().to_bech32();
}

function signMessage(paymentKey: Cardano.PrivateKey, messageBytes: Uint8Array): Cardano.Ed25519Signature {
  return paymentKey.sign(messageBytes);
}

function signMessageRaw(paymentKey: Cardano.PrivateKey, message: string): string {
  const signature = paymentKey.sign(Buffer.from(message, "utf8"));
  return Buffer.from(signature.to_bytes()).toString("hex");
}

function signMessageCose(paymentKey: Cardano.PrivateKey, payerAddress: string, message: string): string {
  const protectedHeaderMap = MessageSigning.HeaderMap.new();
  protectedHeaderMap.set_algorithm_id(MessageSigning.Label.from_algorithm_id(MessageSigning.AlgorithmId.EdDSA));
  const addressBytes = Cardano.Address.from_bech32(payerAddress).to_bytes();
  protectedHeaderMap.set_key_id(addressBytes);
  protectedHeaderMap.set_header(
    MessageSigning.Label.new_text("address"),
    MessageSigning.CBORValue.new_bytes(addressBytes),
  );
  const protectedHeaders = MessageSigning.ProtectedHeaderMap.new(protectedHeaderMap);
  const unprotectedHeaders = MessageSigning.HeaderMap.new();
  unprotectedHeaders.set_header(
    MessageSigning.Label.new_text("hashed"),
    MessageSigning.CBORValue.new_special(MessageSigning.CBORSpecial.new_bool(false)),
  );

  const headers = MessageSigning.Headers.new(protectedHeaders, unprotectedHeaders);
  const payload = Buffer.from(message, "utf8");
  const builder = MessageSigning.COSESign1Builder.new(headers, payload, false);

  const toSign = builder.make_data_to_sign();
  const signature = signMessage(paymentKey, toSign.to_bytes());
  const coseSign1 = builder.build(signature.to_bytes());

  return Buffer.from(coseSign1.to_bytes()).toString("hex");
}

export function consolidate(input: ConsolidateInput): ConsolidateResult {
  const accountKey = deriveAccountKey(mnemonicToRootKey(input.mnemonic), input.accountIndex);
  const paymentKey = derivePaymentKey(accountKey, input.addressIndex);
  const stakeKey = deriveStakeKey(accountKey, input.stakeIndex);
  const networkInfo = getNetworkInfo(input.network);

  const payerAddress = buildPayerAddress(paymentKey, stakeKey, networkInfo);
  const message = `Assign accumulated Scavenger rights to: ${input.recipientAddress}`;
  const signatureHex =
    input.signatureFormat === "cose"
      ? signMessageCose(paymentKey, payerAddress, message)
      : signMessageRaw(paymentKey, message);
  const publicKeyHex = paymentKey.to_public().to_hex();

  return {
    payerAddress,
    message,
    signatureHex,
    publicKeyHex,
    networkId: networkInfo.network_id(),
    signatureFormat: input.signatureFormat,
  };
}

async function postConsolidateRequest(donor: string, recipient: string, signature: string) {
  // curl -L -X POST "https://scavenger.prod.gd.midnighttge.io/donate_to/ <recipient_address>/<donor_address>/<signature>" -d "{}"
  // use proxy 127.0.0.1:7890
  const proxyAgent = new HttpsProxyAgent("http://127.0.0.1:7890");
  const response = await axios.post(
    `https://scavenger.prod.gd.midnighttge.io/donate_to/${recipient}/${donor}/${signature}`,
    {},
    {
      headers: {
        "Content-Type": "application/json",
      },
      httpsAgent: proxyAgent,
    },
  );
  return response;
}

async function main() {
  try {
    const jsonFile = process.argv[2];
    const receipient = process.argv[3];

    const absJsonFile = jsonFile.startsWith("/") || jsonFile.startsWith("~") ? jsonFile : path.join(process.cwd(), jsonFile);
    const mnemonics = JSON.parse(fs.readFileSync(absJsonFile, "utf8")) as string[];
    for (const mnemonic of mnemonics) {
      const params = {
        mnemonic,
        recipientAddress: receipient,
        network: "mainnet",
        accountIndex: 0,
        addressIndex: 0,
        stakeIndex: 0,
        signatureFormat: "cose",
      } as ConsolidateInput;
      const result = consolidate(params);
      const response = await postConsolidateRequest(result.payerAddress, receipient, result.signatureHex);
      if (response.status !== 200) {
        console.error("Failed to consolidate Cardano signature flow.");
        console.error(response.data);
      } else {
        console.log("Cardano consolidation result:");
        console.log(JSON.stringify(response.data, null, 2));
      }

      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds
    }
  } catch (error) {
    console.error("Failed to consolidate Cardano signature flow: ", error);
  }
}

main();
