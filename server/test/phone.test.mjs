import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeILPhone, isValidILMobile, isPlausiblePhone, formatILDisplay, toWaNumber } from '../src/phone.js';

test('normalizeILPhone — מובייל בכל פורמט → E.164 אחיד', () => {
  const want = '+972501234567';
  for (const input of [
    '0501234567', '050-123-4567', '050 123 4567', '050.123.4567',
    '+972501234567', '+972-50-123-4567', '972501234567', '00972501234567',
    '(050) 123-4567', ' 0501234567 ', '972-50-1234567',
  ]) {
    assert.equal(normalizeILPhone(input), want, `נכשל על: ${input}`);
  }
});

test('normalizeILPhone — כל קידומות המובייל', () => {
  for (const p of ['50', '51', '52', '53', '54', '55', '56', '58', '59']) {
    assert.equal(normalizeILPhone(`0${p}1234567`), `+972${p}1234567`);
  }
});

test('normalizeILPhone — קווי נפוץ', () => {
  assert.equal(normalizeILPhone('03-1234567'), '+97231234567');
  assert.equal(normalizeILPhone('046543210'), '+97246543210');
  assert.equal(normalizeILPhone('072-1234567'), '+972721234567');
});

test('normalizeILPhone — לא תקין → null', () => {
  for (const bad of ['', '   ', 'abc', '12345', '05012345', '05012345678', '+1 415 555 2671', null, undefined]) {
    assert.equal(normalizeILPhone(bad), null, `היה אמור להיכשל: ${bad}`);
  }
});

test('isValidILMobile', () => {
  assert.equal(isValidILMobile('050-123-4567'), true);
  assert.equal(isValidILMobile('+972541111111'), true);
  assert.equal(isValidILMobile('03-1234567'), false); // קווי
  assert.equal(isValidILMobile('05712345678'), false); // 57 לא קיים / אורך
  assert.equal(isValidILMobile('junk'), false);
});

test('isPlausiblePhone — מקל, לא מפסיד לידים', () => {
  assert.equal(isPlausiblePhone('0501234567'), true);
  assert.equal(isPlausiblePhone('+1 415 555 2671'), true); // זר אך סביר — לא חוסמים
  assert.equal(isPlausiblePhone('123'), false);
  assert.equal(isPlausiblePhone(''), false);
});

test('formatILDisplay', () => {
  assert.equal(formatILDisplay('+972501234567'), '050-123-4567');
  assert.equal(formatILDisplay('0541234567'), '054-123-4567');
});

test('toWaNumber', () => {
  assert.equal(toWaNumber('050-123-4567'), '972501234567');
  assert.equal(toWaNumber('+972541234567'), '972541234567');
});
