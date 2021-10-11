# Theta / TFUEL Stake Rewards Viewer
This tool will use the official Theta Explorer API to build your stake rewards report. All API interaction happens client-side, and the only server that your wallet address is communicated to is the Theta Explorer API.

Historical price data is pulled from the thetascan.io API, however the wallet address is not sent there.

Note: Depending on the number of individual rewards you have recieved, this process may take quite a long time. It will also use a lot of bandwidth, as each response from the Theta Explorer API can be around 25mb of JSON, of which there could be hundreds of responses.

This is due to the extremely inefficient way that the API groups outputs on transactions. Each stake reward payout is batched with hundreds of addresses besides yours, and they are all included in the API response.