const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { parseVendorListPage, parseVendorShopPage } = require('./parse');
const { parseCookieHeader } = require('./cookie-utils');

const listHtml = fs.readFileSync(path.join(__dirname, '..', 'samples', 'vending-list-p1.html'), 'utf8');
const shopHtml = fs.readFileSync(path.join(__dirname, '..', 'samples', 'viewshop-1.html'), 'utf8');

console.log('--- Testing parseVendorListPage ---');
const { vendors, totalPages } = parseVendorListPage(listHtml);
console.log(JSON.stringify(vendors, null, 2));
console.log('totalPages:', totalPages);

assert.strictEqual(totalPages, 2, 'should detect 2 total pages from "across 2 page(s)"');
assert.strictEqual(vendors.length, 3, 'should find 3 vendor rows in the sample');
assert.deepStrictEqual(vendors[0], {
  vendorId: 1,
  vendorName: 'Kafra Shop',
  shopTitle: 'Random Stuff',
  map: 'prontera',
  x: 142,
  y: 194,
  gender: 'M',
});
assert.strictEqual(vendors[2].vendorId, 476);
assert.strictEqual(vendors[2].vendorName, 'Shadow Trader 8');
assert.strictEqual(vendors[2].shopTitle, 'Cards');

console.log('\n--- Testing parseVendorShopPage ---');
const { items } = parseVendorShopPage(shopHtml);
console.log(JSON.stringify(items, null, 2));

assert.strictEqual(items.length, 2, 'should find 2 item rows in the sample');
assert.deepStrictEqual(items[0], {
  itemId: 950,
  itemName: 'Heart of Mermaid',
  refine: null,
  slot: null,
  cards: [],
  price: 2000,
  amount: 604,
});
assert.deepStrictEqual(items[1], {
  itemId: 1117,
  itemName: 'Katana',
  refine: null,
  slot: '[4]',
  cards: [],
  price: 200000,
  amount: 1,
});

console.log('\nAll parser tests passed.');

console.log('\n--- Testing parseCookieHeader ---');
const cookies = parseCookieHeader('sid=abc123; theme=dark ; empty=; user_id=42', 'example.com');
console.log(JSON.stringify(cookies, null, 2));
assert.deepStrictEqual(cookies, [
  { name: 'sid', value: 'abc123', domain: 'example.com', path: '/' },
  { name: 'theme', value: 'dark', domain: 'example.com', path: '/' },
  { name: 'empty', value: '', domain: 'example.com', path: '/' },
  { name: 'user_id', value: '42', domain: 'example.com', path: '/' },
]);
assert.deepStrictEqual(parseCookieHeader('', 'example.com'), []);
assert.deepStrictEqual(parseCookieHeader('   ', 'example.com'), []);

console.log('All cookie-parsing tests passed.');
