# mint-chocolate-chip

`mint-chocolate-chip` is a simple one-time mint, any-time burn script
for creating tokens on the Cardano blockchain. This package allows you
to mint any token once, and then burn any amount of it at any time. Each
minting operation generates a unique policy ID, ensuring the uniqueness
of each token batch. You can use this tool to mint various types of
tokens.

## Credits

This project is a fork of
[SundaeSwap-finance/mint-chocolate-chip](https://github.com/SundaeSwap-finance/mint-chocolate-chip)
and builds upon the work of
[MynthAI/token-minter](https://github.com/MynthAI/token-minter).

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

## Generating Metadata for Cardano Token Registry

To generate metadata for your token to be included in the [Cardano Token
Registry](https://github.com/cardano-foundation/cardano-token-registry),
follow these steps:

### Step-by-Step Setup Instructions

1.  **Download and Extract `token-metadata-creator`**:
      - Download `token-metadata-creator.tar.gz` from the
        [offchain-metadata-tools
        releases](https://github.com/input-output-hk/offchain-metadata-tools/releases).
    
      - Extract the downloaded tarball:
        
        ``` bash
        tar -xvzf token-metadata-creator.tar.gz
        ```
    
      - Add the extracted `token-metadata-creator` to your PATH. You can
        do this by adding the following line to your `~/.bashrc` or
        `~/.zshrc` file:
        
        ``` bash
        export PATH=$PATH:/path/to/extracted/token-metadata-creator
        ```
    
      - Reload your shell configuration:
        
        ``` bash
        source ~/.bashrc
        # or
        source ~/.zshrc
        ```
2.  **Install `cardano-cli`**:
      - Follow the instructions in the [official Cardano
        documentation](https://docs.cardano.org/getting-started/installing-the-cardano-node)
        to install `cardano-cli`.
3.  **Install `yq`**:
      - Install `yq`, a lightweight and portable command-line YAML
        processor:
        
        ``` bash
        # On macOS using Homebrew
        brew install yq
        
        # On Ubuntu using Snap
        sudo snap install yq
        ```

### Step-by-Step Metadata Generation

1.  **Prepare Metadata File**: Create a `metadata.yml` file with the
    following details:
    
    ``` yaml
    minted_name: My Example Token
    name: My Example Token
    description: This is a demo token
    ticker: DEMO
    url: https://www.mynth.ai/
    logo: logo.png
    decimals: 6
    policy: 82038d92eb9da4d45dd594171332fd13ed58232a5430f836b4db7a14
    ```
    
      - **minted\_name**: The name of the token as minted on the
        blockchain.
      - **name**: The name of the token for display purposes.
      - **description**: A brief description of the token.
      - **ticker**: The ticker symbol for the token.
      - **url**: The website URL associated with the token.
      - **logo**: The file name of the token’s logo (ensure the file is
        available in the specified directory).
      - **decimals**: The number of decimal places for the token.
      - **policy**: The policy ID under which the token was minted.

2.  **Generate Metadata**: Run the following command to generate the
    metadata:
    
    ``` bash
    bash metadata.sh
    ```

3.  **Save the Signing Key**: The command will generate a `sign.vkey`
    file. It is crucial to save this key securely as it will be required
    for updating the metadata in the future.

4.  **Submit Metadata**: After running the command, a JSON file starting
    with your specified policy ID will be generated. Submit this JSON
    file as a Pull Request (PR) to the [Cardano Token
    Registry](https://github.com/cardano-foundation/cardano-token-registry).

By following these steps, you can generate and submit the necessary
metadata to have your token recognized and included in the Cardano Token
Registry.

## License

This project is licensed under the GNU Lesser General Public License
(LGPL). By using or contributing to this project, you agree to the terms
and conditions of LGPL.

## Support

If you encounter any issues or have questions, feel free to reach out
for support.

Happy minting and burning\!
