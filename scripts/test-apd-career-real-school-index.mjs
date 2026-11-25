/** Review exact downloaded public snapshot. No network or publication. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createSchoolCatalog} from './apd-career-school-catalog.mjs';
import {loadReviewedSchoolCatalog} from './apd-career-school-loader.mjs';
import {CAREER_SCHOOL_MANIFEST} from './apd-career-school-manifest.mjs';
const bytes=readFileSync(process.argv[2] || CAREER_SCHOOL_MANIFEST.path);
const digest=createHash('sha256').update(bytes).digest('hex');
assert.equal(digest,'49111bf8b0c37b4e983a2b05eefb6492c6804e78e29cfb8c497cc9aeaddf76c5','Unreviewed index bytes');
const snapshot=JSON.parse(bytes.toString('utf8'));
assert.equal(snapshot.sha256,'36a3809e7173611030cdcd4bbd2d606eedcc7d366479ba3c4075c1523beeef7e');
assert.equal(snapshot.schools.length,18697);
assert.equal(snapshot.counts.ambiguous_keys,1152);
const catalog=createSchoolCatalog(snapshot);
const counts=new Map();
for(const r of snapshot.schools){
 assert.equal(catalog.exact(r.schoolKey).name,r.name);
 assert.match(r.classification,/^[0-5]$/);
 counts.set(r.classification,(counts.get(r.classification)||0)+1);
}
assert.deepEqual(Object.fromEntries(counts),{'0':12649,'1':3453,'2':1534,'3':354,'4':161,'5':546});
assert.equal(catalog.exact('9999MS9999'),null);
const results=catalog.search('avellaneda','Avellaneda');
assert.ok(results.length>0&&results.length<=20);
assert.ok(results.every(r=>r.district.toLowerCase()==='avellaneda'));
const manifest=CAREER_SCHOOL_MANIFEST;
assert.equal(manifest.path,'data/career-schools-'+digest.slice(0,16)+'.json');
assert.deepEqual(readFileSync(manifest.path),bytes,'Committed index differs from the official rebuild');
const loaded=await loadReviewedSchoolCatalog({manifest,origin:'https://alertasapd.com.ar',fetcher:async()=>new Response(bytes)});
assert.deepEqual(loaded.search('avellaneda','Avellaneda'),results);
console.log('APD_REAL_SCHOOL_CATALOG_PASS',JSON.stringify({schools:snapshot.schools.length,ambiguous:snapshot.counts.ambiguous_keys,exactLookups:snapshot.schools.length,districtSearch:results.length}));
