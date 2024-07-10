#!/usr/bin/env bash

set -e

minted_name=$(yq e ".minted_name" metadata.yml)
name=$(yq e ".name" metadata.yml)
description=$(yq e ".description" metadata.yml)
ticker=$(yq e ".ticker" metadata.yml)
url=$(yq e ".url" metadata.yml)
logo=$(yq e ".logo" metadata.yml)
decimals=$(yq e ".decimals" metadata.yml)
policy=$(yq e ".policy" metadata.yml)

if [ ! -f "sign.skey" ]; then
  cardano-cli address key-gen \
    --verification-key-file sign.vkey \
    --signing-key-file sign.skey
fi

subject="$policy$(echo -n "$minted_name" | xxd -ps)"

token-metadata-creator entry \
  --init "$subject" \
  --name "$name" \
  --description "$description" \
  --ticker "$ticker" \
  --url "$url" \
  --logo "$logo" \
  --decimals "$decimals"

if [[ " $* " == *" --edit "* ]]; then
  echo "Press enter to continue..."
  read -r
fi

token-metadata-creator entry \
  "$subject" -a sign.skey

token-metadata-creator entry \
  "$subject" --finalize
