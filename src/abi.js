export const ESCROW_ABI = [
    {
        "inputs": [
            { "internalType": "address", "name": "tokenAddress", "type": "address" },
            { "internalType": "address", "name": "verifierAddress", "type": "address" }
        ],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    { "inputs": [], "name": "ECDSAInvalidSignature", "type": "error" },
    { "inputs": [{ "internalType": "uint256", "name": "length", "type": "uint256" }], "name": "ECDSAInvalidSignatureLength", "type": "error" },
    { "inputs": [{ "internalType": "bytes32", "name": "s", "type": "bytes32" }], "name": "ECDSAInvalidSignatureS", "type": "error" },
    { "inputs": [], "name": "InvalidShortString", "type": "error" },
    { "inputs": [{ "internalType": "address", "name": "token", "type": "address" }], "name": "SafeERC20FailedOperation", "type": "error" },
    { "inputs": [{ "internalType": "string", "name": "str", "type": "string" }], "name": "StringTooLong", "type": "error" },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "bytes32", "name": "channelIdHash", "type": "bytes32" },
            { "indexed": true, "internalType": "address", "name": "payoutAddress", "type": "address" }
        ],
        "name": "Claimed",
        "type": "event"
    },
    { "anonymous": false, "inputs": [], "name": "EIP712DomainChanged", "type": "event" },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "bytes32", "name": "channelIdHash", "type": "bytes32" },
            { "indexed": true, "internalType": "address", "name": "from", "type": "address" },
            { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
            { "indexed": false, "internalType": "string", "name": "message", "type": "string" }
        ],
        "name": "Tipped",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "address", "name": "oldVerifier", "type": "address" },
            { "indexed": true, "internalType": "address", "name": "newVerifier", "type": "address" }
        ],
        "name": "VerifierUpdated",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "bytes32", "name": "channelIdHash", "type": "bytes32" },
            { "indexed": true, "internalType": "address", "name": "payoutAddress", "type": "address" },
            { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "Withdrawn",
        "type": "event"
    },
    { "inputs": [], "name": "CLAIM_TYPEHASH", "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }], "name": "balanceOf", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "string", "name": "channelId", "type": "string" }], "name": "channelHash", "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }], "stateMutability": "pure", "type": "function" },
    {
        "inputs": [
            { "internalType": "bytes32", "name": "channelIdHash", "type": "bytes32" },
            { "internalType": "address", "name": "payoutAddress", "type": "address" },
            { "internalType": "uint256", "name": "expiry", "type": "uint256" },
            { "internalType": "bytes32", "name": "nonce", "type": "bytes32" },
            { "internalType": "bytes", "name": "sig", "type": "bytes" }
        ],
        "name": "claim",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "eip712Domain",
        "outputs": [
            { "internalType": "bytes1", "name": "fields", "type": "bytes1" },
            { "internalType": "string", "name": "name", "type": "string" },
            { "internalType": "string", "name": "version", "type": "string" },
            { "internalType": "uint256", "name": "chainId", "type": "uint256" },
            { "internalType": "address", "name": "verifyingContract", "type": "address" },
            { "internalType": "bytes32", "name": "salt", "type": "bytes32" },
            { "internalType": "uint256[]", "name": "extensions", "type": "uint256[]" }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    { "inputs": [], "name": "owner", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }], "name": "payoutOf", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "newVerifier", "type": "address" }], "name": "setVerifier", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    {
        "inputs": [
            { "internalType": "bytes32", "name": "channelIdHash", "type": "bytes32" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" },
            { "internalType": "string", "name": "message", "type": "string" }
        ],
        "name": "tip",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    { "inputs": [], "name": "token", "outputs": [{ "internalType": "contract IERC20", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }], "name": "usedNonce", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "verifier", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "bytes32", "name": "channelIdHash", "type": "bytes32" }], "name": "withdraw", "outputs": [], "stateMutability": "nonpayable", "type": "function" }
];

export const ERC20_ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) public view returns (uint256)"
];
