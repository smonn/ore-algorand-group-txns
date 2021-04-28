# ORE + Algorand Atomic Transactions example

## Prerequisites

1. [ORE Developer account][ore]
1. Algod server and token (e.g. [PureStake][purestake])
1. An ORE account name and PIN
1. Ideally auto-sign should be enabled to skip the PIN?

## How to run

1. Copy `.env.example` to `.env` and fill out the missing variables.
1. `yarn install` or `npm install`
1. `yarn start <from_account> <from_pin> <to_account> <to_pin>` or `npm start -- <from_account> <from_pin> <to_account> <to_pin>`

[ore]: https://oreid.io/developer/
[purestake]: https://developer.purestake.io/home
