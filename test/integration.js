const nock = require('nock');
const fs = require('fs');
const packet = require('dns-packet');
const DnsProve = require('../lib/dnsprover');
const namehash = require('eth-ens-namehash');
const sha3 = require('web3').utils.sha3;
const dns = require('@ensdomains/dnssec-oracle/lib/dns.js');
const DNSSEC = artifacts.require('@ensdomains/dnssec-oracle/DNSSECImpl.sol');
const DummyAlgorithm = artifacts.require(
  '@ensdomains/dnssec-oracle/DummyAlgorithm.sol'
);
const DummyDigest = artifacts.require(
  '@ensdomains/dnssec-oracle/DummyDigest.sol'
);
const ENSRegistry = artifacts.require(
  '@ensdomains/ens/ENSRegistry.sol'
);
const DNSRegistrar = artifacts.require(
  '@ensdomains/dnsregistrar/DNSRegistrar.sol'
);
const tld = 'xyz';
const gas = '1000000';
function hexEncodeName(name) {
  return '0x' + packet.name.encode(name).toString('hex');
}

let buffer = new Buffer([]);
  
function rrsigdata(typeCoverd, signersName, override){
  let obj = {
    "typeCovered": typeCoverd,
    "algorithm": 253,
    "labels": 1,
    "originalTTL": 3600,
    "expiration": 2528174800,
    "inception": 1526834834,
    "keyTag": 1277,
    "signersName": signersName,
    "signature": buffer
  }
  return Object.assign(obj, override);
}

let dnskeydata = {
  "flags": 256,
  "algorithm": 253,
  "key": buffer
}

let dnskeydata2 = {
  "flags": 257,
  "algorithm": 253,
  "key": buffer
}

let dsdata = {
  "keyTag": 1277,
  "algorithm": 253,
  "digestType": 253,
  "digest": buffer
}

contract('DNSSEC', function(accounts) {
  const owner = accounts[0];
  const nonOwner = accounts[1];
  const provider = web3.currentProvider;
  let address, ens, dummyAlgorithm, dummyDigest, registrar, dnssec;

  beforeEach(async function() {
    ens = await ENSRegistry.new();
    dummyAlgorithm = await DummyAlgorithm.new();
    dummyDigest = await DummyDigest.new();
    let anchors = dns.anchors;
    anchors.push(dns.dummyAnchor);
    dnssec = await DNSSEC.new(dns.encodeAnchors(anchors));
    address = dnssec.address;

    assert.equal(await dnssec.anchors.call(), dns.encodeAnchors(anchors));
    registrar = await DNSRegistrar.new(
      dnssec.address,
      ens.address,
      hexEncodeName(tld),
      namehash.hash(tld)
    );

    assert.equal(await registrar.oracle.call(), dnssec.address);
    assert.equal(await registrar.ens.call(), ens.address);
    assert.equal(await registrar.rootDomain.call(), hexEncodeName(tld));
    assert.equal(await registrar.rootNode.call(), namehash.hash(tld));

    await ens.setSubnodeOwner(0, sha3(tld), registrar.address);
    assert.equal(await ens.owner.call(namehash.hash(tld)), registrar.address);

    await dnssec.setAlgorithm(253, dummyAlgorithm.address);
    await dnssec.setAlgorithm(254, dummyAlgorithm.address);
    await dnssec.setDigest(253, dummyDigest.address);

    assert.equal(await dnssec.algorithms.call(253), dummyAlgorithm.address);
    assert.equal(await dnssec.algorithms.call(254), dummyAlgorithm.address);
    assert.equal(await dnssec.digests.call(253), dummyDigest.address);
  });

  afterEach(async function(){
    nock.cleanAll()
  })

  describe('submit', async function(){
    beforeEach(async function() {
      let text = Buffer.from(`a=${owner}`, 'ascii');
      nock('https://dns.google.com')
                  .get('/experimental?ct=application/dns-udpwireformat&dns=AAEBAAABAAAAAAABBF9lbnMHbWF0b2tlbgN4eXoAABAAAQAAKRAAAACAAAAA')
                  .once()
                  .reply(200, packet.encode({
                    questions: [ { name: '_ens.matoken.xyz', type: 'TXT', class: 'IN' } ],
                    answers: [
                      { name: '_ens.matoken.xyz', type: 'TXT', class: 'IN',  data: text },
                      { name: '_ens.matoken.xyz', type: 'RRSIG',class: 'IN', data: rrsigdata('TXT', 'matoken.xyz', {labels:3}) }
                    ]
                  }));
  
      nock('https://dns.google.com')
                  .get('/experimental?ct=application/dns-udpwireformat&dns=AAEBAAABAAAAAAABBF9lbnMHbWF0b2tlbgN4eXoAABAAAQAAKRAAAACAAAAA')
                  .twice()
                  .reply(200, packet.encode({
                    questions: [ { name: '_ens.matoken.xyz', type: 'TXT', class: 'IN' } ],
                    answers: [ ],
                    authorities:[
                      {
                         name:"_ans.matoken.xyz",
                         type:"NSEC",
                         ttl:3600,
                         class:"IN",
                         flush:false,
                         data:{
                            nextDomain:"_fns.matoken.xyz",
                            rrtypes:["TXT"]
                         }
                      },
                      { name: '_ans.matoken.xyz', type: 'RRSIG',  class: 'IN', data: rrsigdata('NSEC', 'matoken.xyz', { labels:2, keyTag:5647 }) }
                   ]
                  }));

      nock('https://dns.google.com')
                  .get('/experimental?ct=application/dns-udpwireformat&dns=AAEBAAABAAAAAAABBF9lbnMHbWF0b2tlbgN4eXoAABAAAQAAKRAAAACAAAAA==')
                  .reply(200, packet.encode({
                    questions: [ { name: '_ens.matoken.xyz', type: 'TXT', class: 'IN' } ],
                    answers: [
                      { name: '_ens.matoken.xyz', type: 'TXT', class: 'IN',  data: text },
                      { name: '_ens.matoken.xyz', type: 'RRSIG',class: 'IN', data: rrsigdata('TXT', 'matoken.xyz', {labels:3}) }
                    ]
                  }));
  
      nock('https://dns.google.com')
                  .get('/experimental?ct=application/dns-udpwireformat&dns=AAEBAAABAAAAAAABB21hdG9rZW4DeHl6AAAwAAEAACkQAAAAgAAAAA==')
                  .times(2)
                  .reply(200, packet.encode({
                    questions: [ { name: 'matoken.xyz', type: 'DNSKEY', class: 'IN' } ],
                    answers: [
                      { name: 'matoken.xyz', type: 'DNSKEY', class: 'IN', data: dnskeydata },
                      { name: 'matoken.xyz', type: 'RRSIG',  class: 'IN', data: rrsigdata('DNSKEY', 'matoken.xyz', { labels: 2}) }
                    ]
                  }));
  
      nock('https://dns.google.com')
                  .get('/experimental?ct=application/dns-udpwireformat&dns=AAEBAAABAAAAAAABB21hdG9rZW4DeHl6AAArAAEAACkQAAAAgAAAAA==')
                  .times(2)
                  .reply(200, packet.encode({
                    questions: [ { name: 'matoken.xyz', type: 'DS', class: 'IN' } ],
                    answers: [
                      { name: 'matoken.xyz', type: 'DS', class: 'IN', data: dsdata },
                      { name: 'matoken.xyz', type: 'RRSIG',  class: 'IN', data: rrsigdata('DS', 'xyz', { labels:2 }) }
                    ]
                  }));
  
      nock('https://dns.google.com')
                  .get('/experimental?ct=application/dns-udpwireformat&dns=AAEBAAABAAAAAAABA3h5egAAMAABAAApEAAAAIAAAAA=')
                  .times(2)
                  .reply(200, packet.encode({
                    questions: [ { name: 'xyz', type: 'DNSKEY', class: 'IN' } ],
                    answers: [
                      { name: 'xyz', type: 'DNSKEY', class: 'IN', data: dnskeydata },
                      { name: 'xyz', type: 'DNSKEY', class: 'IN', data: dnskeydata2 },
                      { name: 'xyz', type: 'RRSIG',  class: 'IN', data: rrsigdata('DNSKEY', 'xyz') }
                    ]
                  }));
  
      nock('https://dns.google.com')
                  .get('/experimental?ct=application/dns-udpwireformat&dns=AAEBAAABAAAAAAABA3h5egAAKwABAAApEAAAAIAAAAA=')
                  .times(2)
                  .reply(200, packet.encode({
                    questions: [ { name: 'xyz', type: 'DS', class: 'IN' } ],
                    answers: [
                      { name: 'xyz', type: 'RRSIG',  class: 'IN', data: rrsigdata('DS', '.') },
                      { name: 'xyz', type: 'DS', class: 'IN', data: dsdata }
                    ]
                  }));
  
      nock('https://dns.google.com')
                  .get('/experimental?ct=application/dns-udpwireformat&dns=AAEBAAABAAAAAAABAAAwAAEAACkQAAAAgAAAAA==')
                  .times(2)
                  .reply(200, packet.encode({
                    questions: [ { name: '.', type: 'DNSKEY', class: 'IN' } ],
                    answers: [
                      { name: '.', type: 'DNSKEY', class: 'IN', data: dnskeydata },
                      { name: '.', type: 'DNSKEY', class: 'IN', data: {flags: 257, algorithm: 253, key: new Buffer([17, 17])} },
                      { name: '.', type: 'RRSIG',  class: 'IN', data: rrsigdata('DNSKEY', '.', { labels:0, keyTag:5647 }) }
                    ]
                  }));
    });
  
    it.only('submitProof submit a proof', async function() {
      // Step 1. Look up dns entry
      const dnsprove = new DnsProve(provider);
      const dnsResult = await dnsprove.lookup('TXT', '_ens.matoken.xyz');
      const oracle = await dnsprove.getOracle(address);
      // Step 2. Checks that the result is found and is valid.
      assert.equal(dnsResult.found, true);
      assert.equal(
        dnsResult.results[5].rrs[0].data.toString().split('=')[1],
        owner
      );
      assert.equal(dnsResult.proofs.length, 6);
      assert.equal(dnsResult.proofs[0].name, '.');
      // Step 3. Submit each proof to DNSSEC oracle
      let proofs = dnsResult.proofs;
      for (let i = 0; i < proofs.length; i++) {
        var proof = proofs[i];
        let rrdata;
        let result = await oracle.knownProof(proof);
        assert.equal(parseInt(result), 0);
        await oracle.submitProof(proof, proofs[i - 1], { from: owner, gas:gas });
        result = await oracle.knownProof(proof);
        assert.notEqual(parseInt(result), 0);
      }
      // Step 4. Use the last rrdata as a proof to claim the ownership
      var proof = '0x' + proofs[proofs.length - 1].rrdata.toString('hex');
      let name = hexEncodeName('matoken.xyz');
      let tx = await registrar.claim(name, proof, { from: owner, gas:gas });
      assert.equal(parseInt(tx.receipt.status), 1);
      // Step 5. Confirm that the domain is owned by thw DNS record owner.
      let result = await ens.owner.call(namehash.hash('matoken.xyz'));
      assert.equal(result, owner);
      console.log(1)
      const dnsResult2 = await dnsprove.lookup('TXT', '_ens.matoken.xyz');
      console.log(2)
      assert.equal(dnsResult2.found, false);
      assert.equal(dnsResult2.nsec, true);
      let nsecproofs = dnsResult2.proofs
      let lastProof = nsecproofs[nsecproofs.length -1];
      await oracle.deleteProof('TXT', '_ens.matoken.xyz', lastProof, nsecproofs[nsecproofs.length -2], {from:owner, gas:gas})
      console.log(3)
      result = await oracle.knownProof(lastProof);
      console.log(4)
      assert.equal(parseInt(result), 0);
    });
  
    it('submitAll submits all proofs at once', async function() {
      const dnsprove = new DnsProve(provider);
      let result = await dnsprove.lookup('TXT', '_ens.matoken.xyz', address);
      let oracle = await dnsprove.getOracle(address);
      assert.equal((await oracle.getProven(result)), 0);
      await oracle.submitProof(result.proofs[0], null, { from: nonOwner, gas:gas });
      assert.equal((await oracle.getProven(result)), 1);
      await oracle.submitAll(result, { from: nonOwner, gas:gas });
      assert.equal((await oracle.getProven(result)), result.proofs.length);
    });  
  })

  describe('update', async function(){
    this.beforeEach(async function(){
      let text = Buffer.from(`a=${owner}`, 'ascii');
  
      nock('https://dns.google.com')
                  .get('/experimental?ct=application/dns-udpwireformat&dns=AAEBAAABAAAAAAABAWIAABAAAQAAKRAAAACAAAAA')
                  .once()
                  .reply(200, packet.encode({
                    questions: [ { name: 'b', type: 'TXT', class: 'IN' } ],
                    answers: [
                      { name: 'b', type: 'TXT', class: 'IN',  data: Buffer.from(`foo`, 'ascii') },
                      { name: 'b', type: 'RRSIG',class: 'IN',ttl: 3600, data: rrsigdata('TXT', '.', {labels:1, keyTag:5647}) }
                    ]
                  }));
  
      nock('https://dns.google.com')
                  .get('/experimental?ct=application/dns-udpwireformat&dns=AAEBAAABAAAAAAABAWIAABAAAQAAKRAAAACAAAAA')
                  .twice()
                  .reply(200, packet.encode({
                    questions: [ { name: 'b', type: 'TXT', class: 'IN' } ],
                    answers: [
                      { name: 'b', type: 'TXT', class: 'IN',  data: Buffer.from(`bar`, 'ascii') },
                      { name: 'b', type: 'RRSIG',class: 'IN',ttl: 3600, data: rrsigdata('TXT', '.', {labels:1, keyTag:5647}) }
                    ]
                  }));


      nock('https://dns.google.com')
                .get('/experimental?ct=application/dns-udpwireformat&dns=AAEBAAABAAAAAAABAAAwAAEAACkQAAAAgAAAAA==')
                .times(2)
                .reply(200, packet.encode({
                  questions: [ { name: '.', type: 'DNSKEY', class: 'IN' } ],
                  answers: [
                    { name: '.', type: 'DNSKEY', class: 'IN', data: {flags: 0x0101, algorithm: 253, key: Buffer.from("1111", "HEX")} },
                    { name: '.', type: 'DNSKEY', class: 'IN', data: {flags: 0, algorithm: 253, key: Buffer.from("1111", "HEX")} },
                    { name: '.', type: 'DNSKEY', class: 'IN', data: {flags: 0, algorithm: 253, key: Buffer.from("1112", "HEX")} },
                    { name: '.', type: 'RRSIG',  class: 'IN', data: rrsigdata('DNSKEY', '.', { labels:0, keyTag:5647 }) }
                  ]
                }));
    })

    it('updates .b', async function(){
      // Step 1. Look up dns entry
      const dnsprove = new DnsProve(provider);
      const dnsResult = await dnsprove.lookup('TXT', 'b');
      const oracle = await dnsprove.getOracle(address);
      // Step 2. Checks that the result is found and is valid.
      assert.equal(dnsResult.found, true);
      assert.equal(dnsResult.results[1].rrs[0].data.toString(), 'foo');
      let proofs = dnsResult.proofs
      await oracle.submitAll(dnsResult, { from: owner, gas:gas });
      let result = await oracle.knownProof(dnsResult.proofs[1]);
      assert.equal(result, oracle.toProve(dnsResult.proofs[1]));

      const dnsResult2 = await dnsprove.lookup('TXT', 'b');
      assert.equal(dnsResult2.found, true);
      assert.equal(dnsResult2.results[1].rrs[0].data.toString(), 'bar');
      await oracle.submitAll(dnsResult2, { from: owner, gas:gas });
      let result2 = await oracle.knownProof(dnsResult2.proofs[1]);
      assert.equal(result2, oracle.toProve(dnsResult2.proofs[1]));
    })
  })

  describe('delete', async function(){
    this.beforeEach(async function(){
      let text = Buffer.from(`a=${owner}`, 'ascii');
  
      nock('https://dns.google.com')
                  .get('/experimental?ct=application/dns-udpwireformat&dns=AAEBAAABAAAAAAABAWIAABAAAQAAKRAAAACAAAAA')
                  .once()
                  .reply(200, packet.encode({
                    questions: [ { name: 'b', type: 'TXT', class: 'IN' } ],
                    answers: [
                      { name: 'b', type: 'TXT', class: 'IN',  data: Buffer.from(`a=${owner}`, 'ascii') },
                      { name: 'b', type: 'RRSIG',class: 'IN',ttl: 3600, data: rrsigdata('TXT', '.', {labels:1, keyTag:5647}) }
                    ]
                  }));
  
      nock('https://dns.google.com')
                  .get('/experimental?ct=application/dns-udpwireformat&dns=AAEBAAABAAAAAAABAWIAABAAAQAAKRAAAACAAAAA')
                  .twice()
                  .reply(200, packet.encode({
                    questions: [ { name: 'b', type: 'TXT', class: 'IN' } ],
                    answers: [ ],
                    authorities:[
                      {
                         name:"a",
                         type:"NSEC",
                         ttl:3600,
                         class:"IN",
                         flush:false,
                         data:{
                            nextDomain:"d",
                            rrtypes:[
                              "NS",
                              "SOA",
                              // TODO: When these are enabled, the test fails. Find out why.
                              // "RRSIG",
                              // "NSEC",
                              "TXT"
                            ]
                         }
                      },
                      { name: 'a', type: 'RRSIG',  class: 'IN', data: rrsigdata('NSEC', '.', { labels:1, keyTag:5647 }) }
                   ]
                  }));


      nock('https://dns.google.com')
                .get('/experimental?ct=application/dns-udpwireformat&dns=AAEBAAABAAAAAAABAAAwAAEAACkQAAAAgAAAAA==')
                .times(2)
                .reply(200, packet.encode({
                  questions: [ { name: '.', type: 'DNSKEY', class: 'IN' } ],
                  answers: [
                    { name: '.', type: 'DNSKEY', class: 'IN', data: {flags: 0x0101, algorithm: 253, key: Buffer.from("1111", "HEX")} },
                    { name: '.', type: 'DNSKEY', class: 'IN', data: {flags: 0, algorithm: 253, key: Buffer.from("1111", "HEX")} },
                    { name: '.', type: 'DNSKEY', class: 'IN', data: {flags: 0, algorithm: 253, key: Buffer.from("1112", "HEX")} },
                    { name: '.', type: 'RRSIG',  class: 'IN', data: rrsigdata('DNSKEY', '.', { labels:0, keyTag:5647 }) }
                  ]
                }));
    })

    it('deletes .b', async function(){
      // Step 1. Look up dns entry
      const dnsprove = new DnsProve(provider);
      const dnsResult = await dnsprove.lookup('TXT', 'b');
      const oracle = await dnsprove.getOracle(address);
      // Step 2. Checks that the result is found and is valid.
      assert.equal(dnsResult.found, true);
      assert.equal(dnsResult.results[1].rrs[0].data.toString().split('=')[1], owner);
      let proofs = dnsResult.proofs
      // adding proofs;
      await oracle.submitAll(dnsResult, { from: owner, gas:gas });
      let result = await oracle.knownProof(dnsResult.proofs[1]);
      assert.notEqual(parseInt(result), 0);
      const dnsResult2 = await dnsprove.lookup('TXT', 'b');
      assert.equal(dnsResult2.found, false);
      assert.equal(dnsResult2.nsec, true);
      let nsecproofs = dnsResult2.proofs
      await oracle.deleteProof('TXT', 'b', nsecproofs[1], nsecproofs[0], {from:owner, gas:gas})
      result = await oracle.knownProof(dnsResult.proofs[1]);
      assert.equal(parseInt(result), 0);
    })
  })

  it('returns found and nsec as false if the DNS entry does not exist', async function() {
    nock('https://dns.google.com')
      .get('/experimental?ct=application/dns-udpwireformat&dns=AAEBAAABAAAAAAABBF9lbnMRbm9uZXhpc3Rpbmdkb21haW4DY29tAAAQAAEAACkQAAAAgAAAAA==')
      .times(2)
      .reply(200, packet.encode({
        questions: [ { name: '_ens.nonexistingdomain.com', type: 'TXT', class: 'IN' } ],
        answers: []
      }));

    const dnsprove = new DnsProve(provider);
    let dnsResult = await dnsprove.lookup('TXT', '_ens.nonexistingdomain.com');
    assert.equal(dnsResult.found, false);
    assert.equal(dnsResult.nsec, false);
  });
});

