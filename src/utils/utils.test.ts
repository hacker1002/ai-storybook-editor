import { describe, it, expect } from 'vitest';
import { nameToKey, isKeyTaken } from './utils';

describe('nameToKey', () => {
  it.each([
    ['Hero', 'hero'],
    ['Hero 01', 'hero_01'],
    ['Hero  01', 'hero_01'],
    ['Hello World', 'hello_world'],
    ['UPPERCASE', 'uppercase'],

    ['Xin chào', 'xin_chao'],
    ['Thanh kiếm', 'thanh_kiem'],
    ['Đồng hồ', 'dong_ho'],
    ['ĐÔNG Á', 'dong_a'],
    ['Nữ hoàng băng giá', 'nu_hoang_bang_gia'],
    ['Cây cầu ánh sáng', 'cay_cau_anh_sang'],
    ['Phượng hoàng lửa', 'phuong_hoang_lua'],
    ['Mặt trời đỏ', 'mat_troi_do'],

    ['Hero-Villain', 'hero_villain'],
    ['Hero_01', 'hero_01'],
    ['Hero.01', 'hero_01'],
    ['  Leading trailing  ', 'leading_trailing'],
    ['Multi---dash', 'multi_dash'],
    ['a!@#$%^&*()b', 'a_b'],

    ['', ''],
    ['   ', ''],
    ['---', ''],
    ['🎉', ''],
    ['Hero 🎉 01', 'hero_01'],

    ['你好', ''],
    ['こんにちは', ''],
    ['한글', ''],
    ['مرحبا', ''],
  ])('nameToKey(%j) === %j', (input, expected) => {
    expect(nameToKey(input)).toBe(expected);
  });
});

describe('isKeyTaken', () => {
  it('returns true when key exists in collection', () => {
    expect(isKeyTaken('hero', ['hero', 'villain'])).toBe(true);
  });

  it('returns false when key is unique', () => {
    expect(isKeyTaken('wizard', ['hero', 'villain'])).toBe(false);
  });

  it('returns false for empty collection', () => {
    expect(isKeyTaken('hero', [])).toBe(false);
  });
});
