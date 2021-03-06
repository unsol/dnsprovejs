# dnsprove.js 

## Functionalities

- Fetches DNS information of given domain name and type
- Validates DNS reponses and constructs proofs
- Submits the proofs into DNSSEC(Domain Name System Security Extensions) Oracle smart contract
- Works from both browser and from node.js

## Installing

```
npm install '@ensdomains/dnsprovejs' --save
```

## Usage

```js
var provider  = web3.currentProvider;
var DnsProve  = require('dnsprove');
var dnsprove  = new DnsProve(provider);
if(!dnsResult.found) throw('DNS entry not found');

var dnsResult = await dnsprove.lookup('TXT', '_ens.matoken.xyz');
var oracle    = await dnsprove.getOracle('0x123...');
var proofs = dnsResult.proofs;


if(dnsResult.found){
  for(i = 0; i < proofs.length; i++){
    var proof = proofs[i];
    if(!await oracle.knownProof(proof)){
      await oracle.submitProof(proof, proofs[i-1], {from:address})
    }
  }
}else{
  let lastProof = proofs[proofs.lengh -1]
  // The record no longer exists.
  if(dnsResult.nsec && (await oracle.knownProof(lastProof))){
    await oracle.deleteProof(lastProof, proofs[proofs.lengh -2], {from:address})
  }
}
```

Or you can submit all in one transaction.

```js
  let dnsResult = await dnsprove.lookup('TXT', '_ens.matoken.xyz', address);
  let oracle    = await dnsprove.getOracle(address);
  await oracle.submitAll(dnsResult, {from:nonOwner});
```

## API

### `DnsProve`

- `lookup(type, name)` takes DNS record type and name. It returns `DnsResult` object.
- `getOracle(address)` returns DNSSEC oracle(`Oracle`) object.

### `DnsResult`

- `found` is a proparty containing `true` if the given DNS record is found.
- `nsec` is a proparty containing `true` if the given DNS record type is either `NSEC` or `NSEC3`
- `results` is an array of DNS records.
- `proofs` is an array of proofs which can be submitted to `Oracle` contract.
- `lastProof` is a hex representation of the last resource record data (aka rrdata)

### `Oracle`

`Oracle` is a wrapper object of `DNSSEC.sol` Oracle smart contract.

- `knownProof(proof)` returns true if the given proof already exists in `Oracle`.
- `submit(dnsresult, params)` sends all unproven proofs into DNSSEC Oracle as one transaction in a batch.
- `submitProof(proof, prevProof, params)` submits a proof to Oracle contract. If `prevProof` is `null`, the oracle contract uses hard-coded root anchor proof to validate the validity of the proof given. `params` is used to pass any params to be sent to transaction, such as `{from:address}`.

## Testing

```
  npm run test
```

### Running demo

```
# The test page extracts contract info from build/contracts/*.json 
truffle migrate --network development
# compile example/main.js into example/dist/bundle.js
npm run example
cd example
python -m SimpleHTTPServer 
open http://localhost:8000
```

## TODO

- Raise an error message when proofs are not valid.
- Raise an error message when failed to submit proof to oracle
- Add unit tests
