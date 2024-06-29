# mint-chocolate-chip

`mint-chocolate-chip` is a simple one-time mint, any-time burn script
for creating tokens on the Cardano blockchain. This package allows you
to mint any token once, and then burn any amount of it at any time. Each
minting operation generates a unique policy ID, ensuring the uniqueness
of each token batch. You can use this tool to mint various types of
tokens.

## Installation

To install the package, use npm:

``` bash
npm install
```

## Usage

### Minting Tokens

To mint tokens, run the following command:

``` bash
npm run mint <address> <token_name> <amount>
```

#### Example:

``` bash
npm run mint addr_test1qzhvmeq0d4hpfsakgx6y9fg0c060qt2lgkvd8suz6p7qrv5h4ygl4jl2rg5zn0cfgv7la58hgn9xwqu3eflc28yqd7nq2ck7fk demo 1000
```

This will output CBOR for 3 transactions that can be signed and
submitted. It will also output a reference that needs to be saved for
burning. Each time you call this command, it will mint a new token with
a new reference.

### Burning Tokens

To burn tokens, run the following command:

``` bash
npm run burn <address> <reference> <amount>
```

#### Example:

``` bash
npm run burn addr_test1qzhvmeq0d4hpfsakgx6y9fg0c060qt2lgkvd8suz6p7qrv5h4ygl4jl2rg5zn0cfgv7la58hgn9xwqu3eflc28yqd7nq2ck7fk 3dcebf74fe00edc5d7795a02891f6d32b3f235fc7990b05b9c08e293dcadc622 1000
```

Pass in the reference and how much you want to burn. This will output
CBOR that you can sign and submit.

## Detailed Instructions

### Step-by-Step Minting

1.  **Run Mint Command**: Use the `npm run mint` command with the
    appropriate arguments.
      - `<address>`: The Cardano address where the tokens will be sent.
      - `<token_name>`: The name of the token you want to mint.
      - `<amount>`: The amount of tokens you want to mint.
2.  **Output**: The script will generate CBOR for 3 transactions.
      - **Save the Reference**: Ensure you save the reference output by
        the script. This is crucial for future burning operations.
3.  **Sign and Submit Transactions**: Use a Cardano wallet or tool to
    sign and submit the generated CBOR transactions.

### Step-by-Step Burning

1.  **Run Burn Command**: Use the `npm run burn` command with the
    appropriate arguments.
    
      - `<address>`: The Cardano address associated with the tokens.
      - `<reference>`: The reference output from the minting operation.
      - `<amount>`: The amount of tokens you want to burn.

2.  **Output**: The script will generate CBOR for the burn transaction.

3.  **Sign and Submit Transactions**: Use a Cardano wallet or tool to
    sign and submit the generated CBOR transaction.

## Notes

  - **One-Time Minting**: Each minting operation is a one-time event.
    Once you have minted tokens, you cannot mint more with the same
    policy.
  - **Any-Time Burning**: Tokens can be burned at any time, as long as
    you have the reference from the minting operation.
  - **Unique Policy IDs**: Each minting operation generates a new policy
    ID, ensuring the uniqueness of each token batch.

## Support

If you encounter any issues or have questions, feel free to reach out
for support.

Happy minting and burning\!
