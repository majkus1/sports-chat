import test from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

setupEnv();
const { approxForeign, plnEn } = await import('@/lib/billing/approxPrice');
const { pricingMetaDescription } = await import('@/lib/billing/planTexts');
const { landingContent } = await import('@/lib/landing/content').catch(() => ({}));

test('orientacyjna cena: 19 zł ≈ €4.50 / $5, 49 i 99 zł zaokrąglone', () => {
	assert.equal(approxForeign(19), '≈ €4.50 / $5');
	assert.equal(approxForeign(49), '≈ €11.50 / $13.50');
	assert.equal(approxForeign(99), '≈ €23 / $27');
	assert.equal(approxForeign('19'), '≈ €4.50 / $5');
	assert.equal(approxForeign('2,71'), approxForeign(2.71));
});

test('zero i bzdury bez dopisku', () => {
	assert.equal(approxForeign(0), '');
	assert.equal(approxForeign('abc'), '');
	assert.equal(plnEn(0), '0 zł');
});

test('plnEn: złotówki zostają, dopisek w nawiasie', () => {
	assert.equal(plnEn(19), '19 zł (≈ €4.50 / $5)');
});

test('angielski opis cennika ma dopisek, polski nie', () => {
	assert.match(pricingMetaDescription('en'), /zł \(≈ €/);
	assert.doesNotMatch(pricingMetaDescription('pl'), /€/);
	if (landingContent) assert.doesNotMatch(JSON.stringify(landingContent('pl')), /€/);
});
